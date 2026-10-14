# Verdict assembly for the batch (tools/screen_songs.py): the owner's repetition rule as `policy`, fast songs in three
# as a `pipeline` item, the stand-in result of a song the decoder could not open, the proposed roster (with the owner's
# keep/drop from screening/decisions.json) and the Korean summary. The verdict rule itself is core.verdict_of: any
# `fail` -> fail, else any `flag` -> flag, else ok; paperwork/preprocess/pipeline/policy never change it.
#
# screening/decisions.json, written by the owner after listening (same format todo 13 reads):
#   {"<id>": {"listened": true, "keep": true | false, "note": "..."}}
# keep true adds a `flag` song to the proposed roster; keep false takes any song off it; a `fail` song never joins.
from __future__ import annotations

import json
import tempfile
from collections.abc import Callable
from pathlib import Path
from typing import Any, Final

import librosa
import numpy as np

from . import core
from .core import Context, Report, mc

SONGS_DIR: Final = core.TOOLS_DIR.parent / "public" / "songs"

# Owner rule 2026-10-06, not a research criterion: the algorithm and constants of tools/check_variety.py (:27-37,
# :44-83), which stays unchanged; repeated here because check_variety.variety() reads public/songs/<id>/chart.json,
# which the restored tracks and YouTube imports do not have.
REPEAT_MAX: Final = 0.5
VARIETY_SAMPLE_RATE: Final = 22050
VARIETY_HOP: Final = 512
BEATS_PER_BAR: Final = 4
PHRASE_BARS: Final = 4
SAME_BAR: Final = 0.95
MEL_BANDS: Final = 48
FRAMES_PER_BAR: Final = 32

# = make_chart.MIN_BEAT_PERIOD_S: a song in three is never halved (make_chart.fold_tempo), so above 150 BPM it stays
# that fast.
THREE_FAST_BPM: Final = 60 / mc.MIN_BEAT_PERIOD_S

THRESHOLDS: Final[dict[str, float]] = {"repeat": REPEAT_MAX, "three_fast": THREE_FAST_BPM}
# Shown as the owner's rule in summary.md; results.json keeps core's uniform {value, status: "proposed"} per code.
OWNER_RULE_CODES: Final = frozenset({"repeat"})
OWNER_RULE: Final = "사용자 규칙"

SUMMARY_HEADER: Final = "모든 문턱은 제안 값이며 검증되지 않았다."
VERDICT_ORDER: Final = ("ok", "flag", "fail", "error")


def bar_sounds(samples: np.ndarray, bpm: float, offset: float) -> np.ndarray:
    """= check_variety.bar_sounds: one row per bar, its log-mel spectrogram stretched to one length, unit length."""
    mel = librosa.power_to_db(
        librosa.feature.melspectrogram(y=samples, sr=VARIETY_SAMPLE_RATE, hop_length=VARIETY_HOP, n_mels=MEL_BANDS)
    )
    bar_s = 60 / bpm * BEATS_PER_BAR
    starts = np.arange(max(offset, 0.0), len(samples) / VARIETY_SAMPLE_RATE - bar_s, bar_s)
    rows = []
    for start in starts:
        low, high = librosa.time_to_frames([start, start + bar_s], sr=VARIETY_SAMPLE_RATE, hop_length=VARIETY_HOP)
        columns = np.linspace(low, high - 1, FRAMES_PER_BAR).round().astype(int)
        row = mel[:, columns].ravel()
        row = row - row.mean()
        rows.append(row / (np.linalg.norm(row) + 1e-9))
    return np.asarray(rows)


def repeat_of(samples: np.ndarray, bpm: float, offset: float) -> float:
    """= check_variety.variety()["repeat"]: share of bars sounding like the bar 4 or 8 bars before them."""
    bars = bar_sounds(samples, bpm, offset)
    if len(bars) <= PHRASE_BARS:
        return 0.0
    similar = bars @ bars.T
    repeated = np.zeros(len(bars), dtype=bool)
    for i in range(PHRASE_BARS, len(bars)):
        before = [similar[i, i - PHRASE_BARS]] + ([similar[i, i - 2 * PHRASE_BARS]] if i >= 2 * PHRASE_BARS else [])
        repeated[i] = max(before) >= SAME_BAR
    return round(float(repeated[PHRASE_BARS:].mean()), 3)


def chart_timing(song_id: str | None) -> tuple[float, float] | None:
    """bpm and offset of public/songs/<id>/chart.json as stored (2 and 4 decimals), so bars match check_variety."""
    chart = SONGS_DIR / song_id / "chart.json" if song_id else None
    if chart is None or not chart.is_file():
        return None
    data = json.loads(chart.read_text(encoding="utf-8"))
    return float(data["bpm"]), float(data["offset"])


def check_repeat(ctx: Context, report: Report) -> None:
    timing = chart_timing(ctx.meta.get("id"))
    source = "chart"
    if timing is None:
        if ctx.grid is None:
            return
        timing, source = (float(ctx.grid.bpm), float(ctx.grid.step_times[0])), "grid"
    report.describe["repeat_timing"] = source
    report.add(
        "policy",
        "repeat",
        "반복 구간 비율",
        repeat_of(ctx.samples, *timing),
        REPEAT_MAX,
        "사용자 규칙: 50% 이상이면 게임에서 뺌 (tools/check_variety.py)",
    )


def three_fast_bpm(fold: dict[str, Any] | None) -> float | None:
    """Folded tempo of a song in three faster than THREE_FAST_BPM, from make_chart.fold_report; else None."""
    if not fold or not fold["three"] or not fold["period_s"]:
        return None
    bpm = 60 / (fold["period_s"] * 2 ** fold["factor"])
    return bpm if bpm > THREE_FAST_BPM else None


def check_three_fast(ctx: Context, report: Report) -> None:
    # describe["fold"] is make_chart.fold_report as grid.py stored it; core runs modules sorted by name, grid first.
    bpm = three_fast_bpm(report.describe.get("fold"))
    if bpm is not None:
        report.add(
            "pipeline", "three_fast", "빠른 3박자 곡", bpm, THREE_FAST_BPM, "3박자는 반으로 접지 않아 BPM 150 넘게 채보됨"
        )


CHECKS: Final[list[core.Check]] = [check_repeat, check_three_fast]


# ─── batch assembly ───


def decode_failed_result(song_id: str, credit: str, error: BaseException) -> dict[str, Any]:
    """The result of a song whose decoder raised outside core.decode's caught errors: `fail decode`, same schema."""
    report = Report()
    core.check_licence(credit, report)
    report.add("fail", "decode", "소리 파일을 열 수 없음", f"{type(error).__name__}: {error}", None)
    return {
        "id": song_id,
        "verdict": core.verdict_of(report),
        **report.items,
        "describe": {},
        "thresholds": core.all_thresholds(),
        "version": core.screening_version(),
        "deps": core.dependency_versions(),
    }


def error_result(song_id: str, error: BaseException) -> dict[str, Any]:
    """A song whose audio opens but a check raised: verdict `error`, never a silent pass and never a research `fail`."""
    return {
        "id": song_id,
        "verdict": "error",
        "error": f"{type(error).__name__}: {error}",
        **{bucket: [] for bucket in core.BUCKETS},
        "describe": {},
        "thresholds": core.all_thresholds(),
        "version": core.screening_version(),
        "deps": core.dependency_versions(),
    }


def load_decisions(path: Path) -> tuple[dict[str, bool], list[str]]:
    """keep per id from decisions.json, and Korean problem lines for anything unreadable (skipped, never guessed)."""
    if not path.is_file():
        return {}, []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        return {}, [f"{path.name} 을 읽지 못해 keep/drop 없이 만듦: {error}"]
    if not isinstance(data, dict):
        return {}, [f"{path.name} 은 {{곡 id: {{keep: true|false}}}} 형식이어야 함; keep/drop 없이 만듦"]
    keeps: dict[str, bool] = {}
    problems: list[str] = []
    for song_id, entry in sorted(data.items()):
        keep = entry.get("keep") if isinstance(entry, dict) else None
        if isinstance(keep, bool):
            keeps[song_id] = keep
        else:
            problems.append(f"{path.name} 의 {song_id}: keep 이 true/false 가 아니라 건너뜀")
    return keeps, problems


def repeat_value(result: dict[str, Any]) -> float | None:
    return next((item["value"] for item in result["policy"] if item["code"] == "repeat"), None)


def roster(results: list[dict[str, Any]], keeps: dict[str, bool]) -> tuple[list[str], list[str]]:
    """Proposed roster for picture-making, and Korean lines for decisions that could not apply.

    In: ok songs (no ear flag) whose repeat is under the owner's 50%, plus flag songs the owner marked keep.
    Out: anything marked keep false. A keep on a fail or error song is reported, not applied.
    """
    by_id = {result["id"]: result for result in results}
    chosen: list[str] = []
    notes: list[str] = []
    for song_id, keep in sorted(keeps.items()):
        if song_id not in by_id:
            notes.append(f"decisions.json 의 {song_id}: 이번 검사에 없는 곡")
        elif keep and by_id[song_id]["verdict"] in ("fail", "error"):
            notes.append(f"decisions.json 의 {song_id}: 판정이 {by_id[song_id]['verdict']} 라 keep 을 적용하지 않음")
    for result in results:
        keep = keeps.get(result["id"])
        repeat = repeat_value(result)
        default = result["verdict"] == "ok" and (repeat is None or repeat < REPEAT_MAX)
        if keep is False:
            continue
        if default or (keep is True and result["verdict"] in ("ok", "flag")):
            chosen.append(result["id"])
    return chosen, notes


def cell(items: list[dict[str, Any]]) -> str:
    parts = [item["ko"] if item["value"] is None or isinstance(item["value"], str) else f"{item['ko']} {item['value']}"
             for item in items]
    return ", ".join(parts).replace("|", "/") or "-"


def summary_markdown(results: list[dict[str, Any]], keeps: dict[str, bool], problems: list[str]) -> str:
    counts = {verdict: sum(result["verdict"] == verdict for result in results) for verdict in VERDICT_ORDER}
    chosen, notes = roster(results, keeps)
    titles = {result["id"]: result.get("title") or result["id"] for result in results}
    versions = sorted({result["version"][:12] for result in results})
    lines = [
        "# 곡 검사 결과",
        "",
        SUMMARY_HEADER,
        "",
        f"- 곡 수: {len(results)} (검사 버전 {', '.join(versions)})",
        "- " + " · ".join(f"{verdict} {counts[verdict]}" for verdict in VERDICT_ORDER if counts[verdict] or verdict != "error"),
        "",
        f"## 제안 명단 ({len(chosen)}곡)",
        "",
        "기준: 판정 ok 이고 반복 50% 미만, 또는 decisions.json keep. keep false 는 뺌.",
        "",
        *[f"- {song_id} — {titles[song_id]}" for song_id in chosen],
    ]
    if notes or problems:
        lines += ["", "## decisions.json", "", *[f"- {line}" for line in [*problems, *notes]]]
    errors = [result for result in results if result["verdict"] == "error"]
    if errors:
        lines += ["", "## 검사 오류", "", *[f"- {result['id']}: {result['error']}" for result in errors]]
    lines += [
        "",
        "## 곡별 결과",
        "",
        "| id | 판정 | 귀로 확인할 경고 | 서류 확인 | 전처리 | 채보 과제 | 정책 |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for result in results:
        verdict = result["verdict"] if not result["fail"] else f"fail: {cell(result['fail'])}"
        keep = keeps.get(result["id"])
        mark = "" if keep is None else (" (keep)" if keep else " (drop)")
        lines.append(
            f"| {result['id']} | {verdict}{mark} | {cell(result['flag'])} | {cell(result['paperwork'])} | "
            f"{cell(result['preprocess'])} | {cell(result['pipeline'])} | {cell(result['policy'])} |"
        )
    notes_by_code = {
        item["code"]: (item["ko"], item["note"])
        for result in results
        for bucket in core.BUCKETS
        for item in result[bucket]
        if item["note"]
    }
    thresholds = results[0]["thresholds"] if results else {}
    lines += ["", "## 항목과 문턱", "", "| code | 이름 | 문턱 | 상태 | 메모 |", "| --- | --- | --- | --- | --- |"]
    for code in sorted(set(thresholds) | set(notes_by_code)):
        ko, note = notes_by_code.get(code, ("", ""))
        threshold = thresholds.get(code, {})
        status = OWNER_RULE if code in OWNER_RULE_CODES else threshold.get("status", "-")
        lines.append(f"| {code} | {ko} | {threshold.get('value', '-')} | {status} | {note.replace('|', '/')} |")
    return "\n".join(lines) + "\n"


# ─── self-tests (synthetic signals and hand-made results; nothing is played) ───


def made_result(song_id: str, verdict: str, *, flag: bool = False, repeat: float = 0.1) -> dict[str, Any]:
    item = {"code": "x", "ko": "x", "note": "", "value": None, "threshold": None}
    result: dict[str, Any] = {
        "id": song_id,
        "verdict": verdict,
        **{bucket: [] for bucket in core.BUCKETS},
        "thresholds": {},
        "version": "0" * 64,
    }
    result["policy"] = [{**item, "code": "repeat", "value": repeat, "threshold": REPEAT_MAX}]
    result["fail" if verdict == "fail" else "flag"] = [item] if verdict == "fail" or flag else []
    return result


def test_roster_with_decisions() -> None:
    results = [
        made_result("a-ok", "ok"),
        made_result("b-flag", "flag", flag=True),
        made_result("c-flag-keep", "flag", flag=True),
        made_result("d-ok-drop", "ok"),
        made_result("e-fail-keep", "fail"),
        made_result("f-ok-repeats", "ok", repeat=0.62),
    ]
    with tempfile.TemporaryDirectory(prefix="song-screen-") as folder:
        path = Path(folder) / "decisions.json"
        path.write_text(json.dumps({
            "c-flag-keep": {"listened": True, "keep": True},
            "d-ok-drop": {"listened": True, "keep": False},
            "e-fail-keep": {"listened": True, "keep": True},
            "z-unknown": {"keep": True},
            "bad": {"keep": "yes"},
        }))
        keeps, problems = load_decisions(path)
        path.write_text("{not json")
        _, broken = load_decisions(path)
    chosen, notes = roster(results, keeps)
    assert chosen == ["a-ok", "c-flag-keep"], chosen
    assert len(problems) == 1 and len(notes) == 2 and len(broken) == 1, (problems, notes, broken)


def test_summary_header_and_roster_section() -> None:
    results = [made_result("a-ok", "ok"), made_result("b-flag", "flag", flag=True)]
    results[0]["thresholds"] = {"repeat": {"value": REPEAT_MAX, "status": "proposed"}}
    text = summary_markdown(results, {}, [])
    assert SUMMARY_HEADER in text and "## 제안 명단 (1곡)\n" in text and "- a-ok — a-ok" in text, text
    assert f"| repeat |  | {REPEAT_MAX} | {OWNER_RULE} |" in text, text


def test_preprocess_only_song_is_ok() -> None:
    report = Report()
    report.add("preprocess", "gain", "음량 맞추기", 12.0, -18.0)
    report.add("pipeline", "gap_too_short", "노트 간격 125ms 미만", 0.1, 0.125)
    report.add("policy", "repeat", "반복 구간 비율", 0.7, REPEAT_MAX)
    assert core.verdict_of(report) == "ok"


def test_decode_failed_result_keeps_schema() -> None:
    result = decode_failed_result("x", "CC BY 4.0", FileNotFoundError("gone"))
    assert result["verdict"] == "fail" and [item["code"] for item in result["fail"]] == ["decode"], result
    assert set(result) >= {"id", "verdict", *core.BUCKETS, "describe", "thresholds", "version", "deps"}, result


def test_three_fast_from_fold_report() -> None:
    fast = {"factor": 0, "three": True, "period_s": 0.36, "near_boundary": False, "cross_share": 0.0}
    assert three_fast_bpm(fast) is not None
    assert three_fast_bpm({**fast, "three": False}) is None
    assert three_fast_bpm({**fast, "period_s": 0.5}) is None


def test_repeat_of_on_loop_and_noise() -> None:
    # A bar of exactly 86 hops, so every bar starts on the same spectrogram frame and a looped bar is identical.
    bar_samples = 86 * VARIETY_HOP
    bpm = 60 * BEATS_PER_BAR * VARIETY_SAMPLE_RATE / bar_samples
    loop = np.tile(core.synthetic_click(bpm, bar_samples / VARIETY_SAMPLE_RATE)[:bar_samples], 16)
    noise = np.random.default_rng(3).standard_normal(len(loop)).astype(np.float32) * 0.1
    assert repeat_of(loop, bpm, 0.0) >= 0.9, ("loop", repeat_of(loop, bpm, 0.0))
    assert repeat_of(noise, bpm, 0.0) < REPEAT_MAX, ("noise", repeat_of(noise, bpm, 0.0))


REFERENCES: Final = Path("/tmp/livecanvas-audio-curation/popularity/references")
REFERENCE_IDS: Final = ("rd-dreams-dont-stop", "rd-all-the-times", "deemo-dream")


def test_reference_songs_are_not_fail() -> None:
    """Face validity: Rhythm Doctor x2, Deemo Dream and the Taiko references are rhythm-game music, never `fail`."""
    if not REFERENCES.is_dir():
        print("SKIPPED verdict.test_reference_songs_are_not_fail: 참고곡 폴더가 없음")
        return
    paths = [REFERENCES / name / "song.mp3" for name in REFERENCE_IDS] + sorted(REFERENCES.glob("taiko-*/song.mp3"))
    failed = {}
    for path in paths:
        result = core.screen(path, {"id": path.parent.name, "credit": "CC0"})
        if result["verdict"] == "fail":
            failed[path.parent.name] = result["fail"]
    assert not failed, failed


SELF_TESTS: Final[list[Callable[[], None]]] = [
    test_roster_with_decisions,
    test_summary_header_and_roster_section,
    test_preprocess_only_song_is_ok,
    test_decode_failed_result_keeps_schema,
    test_three_fast_from_fold_report,
    test_repeat_of_on_loop_and_noise,
    test_reference_songs_are_not_fail,
]
