# Beat clarity (essentia multifeature confidence) and folded beat stability: warnings for the owner's ears, never fails.
from __future__ import annotations

import math
import os
from collections.abc import Callable
from typing import Any, Final

import numpy as np

from . import core
from .core import Context, Report, mc, rounded

# proposed, unvalidated - Zapata et al. ISMIR 2012, valid for that ensemble only; refs median 1.52 vs free 3.13
# (verify-metric-bench.md), and every gate rejected one of Rhythm Doctor / Deemo / Taiko, so it is a warning only.
CLARITY_MIN_CONFIDENCE: Final = 1.5
# The research bench measured confidence at this loudness and at 44.1 kHz; the threshold comes from that bench.
CLARITY_LOUDNESS_LUFS: Final = -12.9
ESSENTIA_SAMPLE_RATE: Final = 44100
# Run-to-run jitter of the confidence was up to 0.0036, so 2 decimals keep the result byte-identical.
CLARITY_DECIMALS: Final = 2
# proposed, unvalidated - share of 12 s windows whose folded inter-beat intervals vary by at most 10%
STABLE_MIN_SHARE: Final = 0.8
STABLE_MAX_CV: Final = 0.10
STABLE_WINDOW_S: Final = 12.0
STABLE_MIN_WINDOW_BEATS: Final = 4
# A gap this many usual beats long is a pause or beats the tracker skipped, not a change of tempo.
SKIPPED_BEAT_RATIO: Final = 1.5
ENTROPY_BINS: Final = 120
ENTROPY_MAX_RATIO: Final = 3.0
NO_ESSENTIA_ENV: Final = "SONG_SCREEN_NO_ESSENTIA"

THRESHOLDS: Final[dict[str, float]] = {
    "beat_clarity_low": CLARITY_MIN_CONFIDENCE,
    "beat_unstable": STABLE_MIN_SHARE,
}


def essentia_confidence(ctx: Context) -> float | None:
    if os.environ.get(NO_ESSENTIA_ENV) == "1":
        return None
    try:
        import essentia
        import essentia.standard as es
    except ImportError:
        return None
    essentia.log.infoActive = False
    essentia.log.warningActive = False
    mono = ctx.channels.mean(axis=0).astype(np.float32)
    lufs = core.integrated_lufs(ctx.channels, ctx.native_sr)
    if math.isfinite(lufs):
        mono = (mono * 10 ** ((CLARITY_LOUDNESS_LUFS - lufs) / 20)).astype(np.float32)
    if ctx.native_sr != ESSENTIA_SAMPLE_RATE:
        mono = es.Resample(inputSampleRate=ctx.native_sr, outputSampleRate=ESSENTIA_SAMPLE_RATE)(mono)
    _, _, confidence, _, _ = es.RhythmExtractor2013(method="multifeature")(mono)
    return round(float(confidence), CLARITY_DECIMALS)


def check_beat_clarity(ctx: Context, report: Report) -> None:
    confidence = essentia_confidence(ctx)
    report.describe["essentia_confidence"] = confidence
    if confidence is None:
        report.add("flag", "beat_clarity_unmeasured", "박 또렷함을 재지 못함", None, None, "essentia 를 쓸 수 없음")
    elif confidence < CLARITY_MIN_CONFIDENCE:
        report.add(
            "flag",
            "beat_clarity_low",
            "박이 또렷하지 않음",
            confidence,
            CLARITY_MIN_CONFIDENCE,
            "essentia 신뢰도, 제안 값, 귀로 확인",
        )


def folded_stability(beats: np.ndarray) -> tuple[float, int]:
    windows = []
    if len(beats) >= 2:
        usual = float(np.median(np.diff(beats)))
        for start in np.arange(float(beats[0]), float(beats[-1]), STABLE_WINDOW_S):
            gaps = np.diff(beats[(beats >= start) & (beats < start + STABLE_WINDOW_S)])
            gaps = gaps[gaps < SKIPPED_BEAT_RATIO * usual]
            if len(gaps) >= STABLE_MIN_WINDOW_BEATS - 1:
                windows.append(float(np.std(gaps) / np.mean(gaps)))
    share = float(np.mean(np.array(windows) <= STABLE_MAX_CV)) if windows else 0.0
    return share, len(windows)


def ibi_entropy_bits(beats: np.ndarray) -> float | None:
    if len(beats) < 3:
        return None
    gaps = np.diff(beats)
    ratio = np.clip(gaps / np.median(gaps), 0, ENTROPY_MAX_RATIO)
    counts, _ = np.histogram(ratio, bins=ENTROPY_BINS, range=(0, ENTROPY_MAX_RATIO))
    share = counts[counts > 0] / counts.sum()
    return float(-(share * np.log2(share)).sum()) + 0.0


def check_beat_stability(ctx: Context, report: Report) -> None:
    if ctx.grid is None:
        return
    beats, downbeats = mc.track_beats(ctx.samples)
    # Measured after folding as the game folds: before folding, a passage tracked at the other octave counted as
    # unstable although the game charts it on one beat (verify-screen-on-refs.md). A beat the tracker marks twice is
    # dropped first, as the game does; its local smoothing is left out because it would even out real jitter.
    folded = mc.fold_tempo(mc.drop_crowded_beats(beats), downbeats, ctx.envelope)
    share, windows = folded_stability(folded)
    report.describe["beat_stable_share"] = rounded(share)
    report.describe["beat_stable_windows"] = windows
    report.describe["ibi_entropy_bits"] = rounded(ibi_entropy_bits(folded))
    if share < STABLE_MIN_SHARE:
        report.add(
            "flag",
            "beat_unstable",
            "박 간격이 고르지 않음",
            share,
            STABLE_MIN_SHARE,
            "12초 창 중 간격 변동 10% 이하 비율, 제안 값, 귀로 확인",
        )


CHECKS: Final[list[Callable[[Context, Report], None]]] = [check_beat_clarity, check_beat_stability]


def jittered_click(bpm: float, seconds: float, jitter_s: float) -> np.ndarray:
    sample_rate = mc.SAMPLE_RATE
    signal = np.zeros(round(seconds * sample_rate), dtype=np.float32)
    hit_length = round(0.08 * sample_rate)
    t = np.arange(hit_length) / sample_rate
    rng = np.random.default_rng(0)
    hit = np.exp(-t * 40) * (np.sin(2 * np.pi * 150 * t) + 0.3 * rng.standard_normal(hit_length))
    gaps = np.clip(60 / bpm + jitter_s * rng.standard_normal(round(seconds * bpm / 60)), 0.2, None)
    for index, start in enumerate(np.cumsum(gaps)):
        begin = round(start * sample_rate)
        if begin >= len(signal):
            break
        end = min(len(signal), begin + hit_length)
        signal[begin:end] += (1.0 if index % 4 == 0 else 0.6) * hit[: end - begin]
    return signal / np.max(np.abs(signal)) * 0.5


def beat_codes(result: dict[str, Any]) -> list[str]:
    return [item["code"] for item in result["flag"] if item["code"].startswith("beat_")]


def test_clean_click_has_no_beat_flags() -> None:
    with core.temp_audio(core.synthetic_click(120, 40)) as path:
        result = core.screen(path, {"credit": "CC0"})
    assert result["fail"] == [] and beat_codes(result) == [], (result["fail"], result["flag"], result["describe"])
    assert result["describe"]["essentia_confidence"] is not None, result["describe"]


def test_jittered_click_is_unstable() -> None:
    with core.temp_audio(jittered_click(120, 40, 0.06)) as path:
        result = core.screen(path, {"credit": "CC0"})
    assert "beat_unstable" in beat_codes(result), (result["fail"], result["flag"], result["describe"])


def test_pad_without_onsets_has_no_clear_beat() -> None:
    t = np.arange(20 * mc.SAMPLE_RATE) / mc.SAMPLE_RATE
    pad = sum(np.sin(2 * np.pi * freq * t) for freq in (220.0, 277.18, 329.63)) / 3
    with core.temp_audio((0.3 * pad).astype(np.float32)) as path:
        result = core.screen(path, {"credit": "CC0"})
    codes = [item["code"] for item in result["fail"]] + beat_codes(result)
    assert "no_beat" in codes or "beat_clarity_low" in codes, (result["fail"], result["flag"])


SELF_TESTS: Final[list[Callable[[], None]]] = [
    test_clean_click_has_no_beat_flags,
    test_jittered_click_is_unstable,
    test_pad_without_onsets_has_no_clear_beat,
]
