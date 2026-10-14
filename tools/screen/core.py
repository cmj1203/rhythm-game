# Registration: a module tools/screen/<name>.py joins screen() and --self-test by defining CHECKS (check(ctx, report) -> None), SELF_TESTS (test() -> None, raises on failure) and THRESHOLDS ({code: value}); core.py finds them itself, so a new module never edits this file.
from __future__ import annotations

import hashlib
import importlib
import importlib.metadata
import math
import pkgutil
import re
import sys
import tempfile
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from types import ModuleType
from typing import Any, Final, Literal

import librosa
import numpy as np
import pyloudnorm
import soundfile as sf
from scipy.signal import resample_poly

TOOLS_DIR: Final = Path(__file__).resolve().parent.parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))
import make_chart as mc  # noqa: E402

Bucket = Literal["fail", "flag", "paperwork", "preprocess", "pipeline", "policy"]
BUCKETS: Final[tuple[Bucket, ...]] = ("fail", "flag", "paperwork", "preprocess", "pipeline", "policy")
KO_MAX_CHARS: Final = 30
DEPENDENCIES: Final = ("numpy", "scipy", "librosa", "soundfile", "pyloudnorm", "beat-this", "torch", "essentia")

# proposed, unvalidated - Sony ASWG-R001 portable
GAIN_TARGET_LUFS: Final = -18.0
# proposed, unvalidated
GAIN_TOLERANCE_LU: Final = 1.0
# proposed, unvalidated - common streaming ceiling
TRUE_PEAK_MAX_DBTP: Final = -1.0
TRUE_PEAK_OVERSAMPLE: Final = 4
# proposed, unvalidated - relative floor, because an absolute -90 dBFS floor flips with gain (verify-metric-bench.md)
SILENCE_BELOW_LU: Final = 40.0
# proposed, unvalidated - the game already plays LEAD_IN_S = 3 and up to 8 count-in clicks (src/audio.ts), so only
# about half a second before the first attack is kept; the 1.5-2.5 s of BSMG/ScoreSaber/YARN assume no count-in.
TRIM_KEEP_S: Final = 0.5
# proposed, unvalidated
TRIM_MIN_S: Final = 0.5
SILENCE_FRAME_S: Final = 0.1
SILENCE_HOP_S: Final = 0.05
# BS.1770 offset; the edge frames are not K-weighted, which moves them a few dB against a 40 LU margin.
LOUDNESS_OFFSET_DB: Final = -0.691

THRESHOLDS: Final[dict[str, float]] = {
    "gain": GAIN_TARGET_LUFS,
    "true_peak": TRUE_PEAK_MAX_DBTP,
    "trim_lead": TRIM_MIN_S,
    "trim_tail": TRIM_MIN_S,
}

ND_PATTERN: Final = re.compile(r"noderiv|no[\s-]derivatives?|-nd(?![a-z0-9])", re.IGNORECASE)
NC_PATTERN: Final = re.compile(r"non-?commercial|-nc(?![a-z0-9])", re.IGNORECASE)
OPEN_PATTERN: Final = re.compile(
    r"cc0|public\s*domain|publicdomain|(?<![a-z])cc[\s-]by(?![a-z])|creativecommons\.org/licenses/by/"
    r"|by attribution|creative commons attribution",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class Context:
    path: Path
    meta: dict[str, Any]
    samples: np.ndarray
    channels: np.ndarray
    native_sr: int
    percussive: np.ndarray
    envelope: np.ndarray
    grid: mc.BeatGrid | None


@dataclass(slots=True)
class Report:
    items: dict[Bucket, list[dict[str, Any]]] = field(default_factory=lambda: {bucket: [] for bucket in BUCKETS})
    describe: dict[str, Any] = field(default_factory=dict)

    def add(self, bucket: Bucket, code: str, ko: str, value: Any, threshold: float | None, note: str = "") -> None:
        if len(ko) > KO_MAX_CHARS:
            raise ValueError(f"ko label of {code} is longer than {KO_MAX_CHARS} characters: {ko}")
        self.items[bucket].append(
            {"code": code, "ko": ko, "note": note, "value": rounded(value), "threshold": rounded(threshold)}
        )

    def codes(self, bucket: Bucket) -> list[str]:
        return [item["code"] for item in self.items[bucket]]


Check = Callable[[Context, Report], None]


def rounded(value: Any) -> Any:
    if isinstance(value, (float, np.floating)):
        return round(float(value), 3) if math.isfinite(value) else None
    if isinstance(value, np.integer):
        return int(value)
    return value


def screening_modules() -> list[ModuleType]:
    package = importlib.import_module(__package__)
    names = sorted(info.name for info in pkgutil.iter_modules(package.__path__) if info.name != "core")
    return [importlib.import_module(f"{__package__}.{name}") for name in names]


def module_checks() -> list[Check]:
    return [check for module in screening_modules() for check in getattr(module, "CHECKS", [])]


def self_tests() -> list[tuple[str, Callable[[], None]]]:
    modules = [sys.modules[__name__], *screening_modules()]
    return [
        (f"{module.__name__.rsplit('.', 1)[-1]}.{test.__name__}", test)
        for module in modules
        for test in getattr(module, "SELF_TESTS", [])
    ]


def all_thresholds() -> dict[str, dict[str, Any]]:
    modules = [sys.modules[__name__], *screening_modules()]
    merged = {code: value for module in modules for code, value in getattr(module, "THRESHOLDS", {}).items()}
    return {code: {"value": merged[code], "status": "proposed"} for code in sorted(merged)}


def screening_version() -> str:
    files = [TOOLS_DIR / "song_screen.py", *sorted((TOOLS_DIR / "screen").glob("*.py")), TOOLS_DIR / "make_chart.py"]
    digest = hashlib.sha256()
    for path in files:
        digest.update(path.relative_to(TOOLS_DIR).as_posix().encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def dependency_versions() -> dict[str, str | None]:
    versions: dict[str, str | None] = {}
    for name in DEPENDENCIES:
        try:
            versions[name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            versions[name] = None
    return versions


def check_licence(credit: str, report: Report) -> None:
    if nd := ND_PATTERN.search(credit):
        report.add("fail", "license_nd", "변경 금지 라이선스", nd.group(0), None)
    if nc := NC_PATTERN.search(credit):
        report.add("paperwork", "license_nc", "비영리 라이선스", nc.group(0), None, "상업적 이용 조건 확인")
    if nd is None and nc is None and OPEN_PATTERN.search(credit) is None:
        report.add(
            "paperwork",
            "license_unknown",
            "라이선스 확인 필요",
            credit or None,
            None,
            "크레딧에서 라이선스를 찾지 못함",
        )


def true_peak_dbtp(channels: np.ndarray) -> float:
    peak = max(
        float(np.max(np.abs(resample_poly(channel.astype(np.float32), TRUE_PEAK_OVERSAMPLE, 1))))
        for channel in channels
    )
    return 20 * math.log10(peak) if peak > 0 else -math.inf


def integrated_lufs(channels: np.ndarray, sample_rate: int) -> float:
    meter = pyloudnorm.Meter(sample_rate)
    if channels.shape[1] <= meter.block_size * sample_rate:
        return -math.inf
    return float(meter.integrated_loudness(channels.T))


def check_loudness(ctx: Context, report: Report) -> None:
    lufs = integrated_lufs(ctx.channels, ctx.native_sr)
    peak = true_peak_dbtp(ctx.channels)
    report.describe["lufs"] = rounded(lufs)
    report.describe["true_peak_dbtp"] = rounded(peak)
    if math.isfinite(lufs) and abs(GAIN_TARGET_LUFS - lufs) > GAIN_TOLERANCE_LU:
        gain_db = GAIN_TARGET_LUFS - lufs
        report.describe["true_peak_after_gain_dbtp"] = rounded(peak + gain_db)
        report.add("preprocess", "gain", "음량 맞추기", gain_db, GAIN_TARGET_LUFS, "dB, 리미터 없이 곱하기만")
    if peak > TRUE_PEAK_MAX_DBTP:
        report.add("preprocess", "true_peak", "최대 음량 초과", peak, TRUE_PEAK_MAX_DBTP, "dBTP, 4배 오버샘플")


def frame_loudness(channels: np.ndarray, sample_rate: int) -> np.ndarray:
    length = max(1, round(SILENCE_FRAME_S * sample_rate))
    hop = max(1, round(SILENCE_HOP_S * sample_rate))
    if channels.shape[1] < length:
        return np.empty(0)
    energy = np.cumsum(np.concatenate([np.zeros(1), np.sum(channels.astype(np.float64) ** 2, axis=0)]))
    starts = np.arange(0, channels.shape[1] - length + 1, hop)
    mean_square = (energy[starts + length] - energy[starts]) / length
    with np.errstate(divide="ignore"):
        return LOUDNESS_OFFSET_DB + 10 * np.log10(mean_square)


def check_silence(ctx: Context, report: Report) -> None:
    lufs = integrated_lufs(ctx.channels, ctx.native_sr)
    loudness = frame_loudness(ctx.channels, ctx.native_sr)
    sounding = np.flatnonzero(loudness >= lufs - SILENCE_BELOW_LU) if math.isfinite(lufs) else np.empty(0, int)
    if len(sounding) == 0:
        report.describe["lead_silence_s"] = None
        report.describe["tail_silence_s"] = None
        return
    duration = ctx.channels.shape[1] / ctx.native_sr
    lead = float(sounding[0]) * SILENCE_HOP_S
    tail = max(0.0, duration - (float(sounding[-1]) * SILENCE_HOP_S + SILENCE_FRAME_S))
    report.describe["lead_silence_s"] = rounded(lead)
    report.describe["tail_silence_s"] = rounded(tail)
    if lead - TRIM_KEEP_S >= TRIM_MIN_S:
        report.add(
            "preprocess", "trim_lead", "앞 무음 자르기", lead - TRIM_KEEP_S, TRIM_MIN_S, "초, 첫 소리 앞 0.5초는 남김"
        )
    if tail - TRIM_KEEP_S >= TRIM_MIN_S:
        report.add(
            "preprocess", "trim_tail", "뒤 무음 자르기", tail - TRIM_KEEP_S, TRIM_MIN_S, "초, 끝 소리 뒤 0.5초는 남김"
        )


CORE_CHECKS: Final[list[Check]] = [check_loudness, check_silence]


class DecodeError(Exception):
    pass


def decode(path: Path) -> tuple[np.ndarray, np.ndarray, int]:
    try:
        samples, _ = librosa.load(path, sr=mc.SAMPLE_RATE, mono=True)
        native, native_sr = librosa.load(path, sr=None, mono=False)
    except (sf.SoundFileError, EOFError, ValueError) as error:
        raise DecodeError(f"{type(error).__name__}: {error}") from error
    if samples.size == 0:
        raise DecodeError("no samples")
    return samples, np.atleast_2d(native), int(native_sr)


def describe_source(path: Path, channels: np.ndarray, native_sr: int, describe: dict[str, Any]) -> None:
    duration = channels.shape[1] / native_sr
    describe["sample_rate"] = native_sr
    describe["channels"] = int(channels.shape[0])
    describe["duration_s"] = rounded(duration)
    describe["bitrate_kbps"] = rounded(path.stat().st_size * 8 / duration / 1000)


def verdict_of(report: Report) -> str:
    if report.items["fail"]:
        return "fail"
    return "flag" if report.items["flag"] else "ok"


def screen(path: Path | str, meta: dict[str, Any] | None = None) -> dict[str, Any]:
    path = Path(path)
    meta = meta or {}
    report = Report()
    check_licence(str(meta.get("credit") or ""), report)
    try:
        samples, channels, native_sr = decode(path)
    except DecodeError as error:
        report.add("fail", "decode", "소리 파일을 열 수 없음", str(error), None)
    else:
        describe_source(path, channels, native_sr, report.describe)
        percussive = librosa.effects.percussive(samples)
        envelope = librosa.onset.onset_strength(y=percussive, sr=mc.SAMPLE_RATE, hop_length=mc.HOP)
        grid: mc.BeatGrid | None
        try:
            grid = mc.build_grid(samples, percussive, envelope)
        except mc.NoBeatError as error:
            grid = None
            report.add("fail", "no_beat", "박을 찾지 못함", error.beats_found, mc.MIN_BEATS, "게임의 박 추적 결과")
        else:
            report.describe["bpm"] = rounded(grid.bpm)
            report.describe["steady"] = grid.is_steady
        ctx = Context(path, meta, samples, channels, native_sr, percussive, envelope, grid)
        for check in [*CORE_CHECKS, *module_checks()]:
            check(ctx, report)
    return {
        "id": meta.get("id") or path.parent.name,
        "verdict": verdict_of(report),
        **report.items,
        "describe": dict(sorted(report.describe.items())),
        "thresholds": all_thresholds(),
        "version": screening_version(),
        "deps": dependency_versions(),
    }


def synthetic_click(bpm: float, seconds: float, sample_rate: int = mc.SAMPLE_RATE) -> np.ndarray:
    signal = np.zeros(round(seconds * sample_rate), dtype=np.float32)
    hit_length = round(0.08 * sample_rate)
    t = np.arange(hit_length) / sample_rate
    rng = np.random.default_rng(0)
    hit = np.exp(-t * 40) * (np.sin(2 * np.pi * 150 * t) + 0.3 * rng.standard_normal(hit_length))
    for index, start in enumerate(np.arange(0, seconds, 60 / bpm)):
        begin = round(start * sample_rate)
        end = min(len(signal), begin + hit_length)
        signal[begin:end] += (1.0 if index % 4 == 0 else 0.6) * hit[: end - begin]
    return signal / np.max(np.abs(signal)) * 0.5


def scaled_to_lufs(signal: np.ndarray, lufs: float, sample_rate: int = mc.SAMPLE_RATE) -> np.ndarray:
    current = pyloudnorm.Meter(sample_rate).integrated_loudness(signal)
    return (signal * 10 ** ((lufs - current) / 20)).astype(np.float32)


@contextmanager
def temp_audio(signal: np.ndarray, sample_rate: int = mc.SAMPLE_RATE) -> Iterator[Path]:
    with tempfile.TemporaryDirectory(prefix="song-screen-") as folder:
        path = Path(folder) / "test" / "song.wav"
        path.parent.mkdir()
        sf.write(path, signal, sample_rate)
        yield path


def test_decode_failure() -> None:
    with tempfile.TemporaryDirectory(prefix="song-screen-") as folder:
        path = Path(folder) / "notes.mp3"
        path.write_text("not audio\n")
        result = screen(path, {"credit": "CC0"})
    assert result["verdict"] == "fail" and [item["code"] for item in result["fail"]] == ["decode"], result["fail"]


def test_no_beat_on_sine() -> None:
    t = np.arange(10 * mc.SAMPLE_RATE) / mc.SAMPLE_RATE
    with temp_audio((0.5 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)) as path:
        result = screen(path, {"credit": "CC0"})
    assert [item["code"] for item in result["fail"]] == ["no_beat"], result["fail"]


def test_licence_parsing() -> None:
    cases = {
        "Licensed under Creative Commons: By Attribution 4.0. https://creativecommons.org/licenses/by/4.0/": [],
        "licensed under CC0 1.0 https://creativecommons.org/publicdomain/zero/1.0/": [],
        "Licensed under CC BY-ND 4.0": ["license_nd"],
        "Attribution-NonCommercial 4.0 International": ["license_nc"],
        "CC BY-NC-ND 3.0": ["license_nd", "license_nc"],
        "Free to use in games": ["license_unknown"],
    }
    for credit, expected in cases.items():
        report = Report()
        check_licence(credit, report)
        found = report.codes("fail") + report.codes("paperwork")
        assert found == expected, (credit, found)


def test_gain_and_trim_on_quiet_padded_click() -> None:
    silence = np.zeros(5 * mc.SAMPLE_RATE, dtype=np.float32)
    signal = scaled_to_lufs(np.concatenate([silence, synthetic_click(120, 20), silence]), -30.0)
    with temp_audio(signal) as path:
        result = screen(path, {"credit": "CC0"})
    preprocess = {item["code"]: item["value"] for item in result["preprocess"]}
    assert result["fail"] == [] and result["verdict"] == "ok", result["fail"]
    assert abs(preprocess["gain"] - 12.0) < 0.5, preprocess
    last_hit_end = 19.5 + 0.08
    expected_lead, expected_tail = 5.0 - TRIM_KEEP_S, 5.0 + 20 - last_hit_end - TRIM_KEEP_S
    assert abs(preprocess["trim_lead"] - expected_lead) <= 0.15, preprocess
    assert abs(preprocess["trim_tail"] - expected_tail) <= 0.15, preprocess


SELF_TESTS: Final[list[Callable[[], None]]] = [
    test_decode_failure,
    test_no_beat_on_sine,
    test_licence_parsing,
    test_gain_and_trim_on_quiet_padded_click,
]
