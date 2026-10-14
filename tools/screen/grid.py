# Grid fit (quarter or triplet), fold cliff, note gaps before the 125 ms guard and syncopation: chart-pipeline items
# and descriptions, never a verdict change.
#
# The triplet rule lives here only: classify_grid / grid_steps_per_beat. The top of this file imports numpy and librosa
# only, so tools/make_chart.py can import it (todo 9) without the cycle screen.core -> make_chart -> screen.core.
from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import TYPE_CHECKING, Any, Final, Literal

import librosa
import numpy as np

if TYPE_CHECKING:
    from .core import Context, Report

GridKind = Literal["quarter", "triplet", "mixed"]

SAMPLE_RATE: Final = 22050  # = make_chart.SAMPLE_RATE, repeated so this file needs no make_chart import
HOP: Final = 256  # = make_chart.HOP
# An onset counts when its envelope peak reaches this share of the envelope's 99th percentile.
STRONG_ONSET_SHARE: Final = 0.3
ATTACK_SEARCH_BEFORE_S: Final = 0.06  # = make_chart.ATTACK_SEARCH_BEFORE_S: onsets are placed as the game places beats
ATTACK_SEARCH_AFTER_S: Final = 0.03
ATTACK_SMOOTHING_S: Final = 0.005
# An onset further than 1/16 beat from a beat is off the beat; only those tell a quarter grid from a triplet grid
# (an onset on the beat fits every grid), so the rule is a median over many off-beat onsets, never one gap.
OFF_BEAT_MIN_BEATS: Final = 1 / 16
# proposed, unvalidated - fewer off-beat onsets than this (or this share of all strong onsets) leave the quarter grid.
MIN_OFF_BEAT_ONSETS: Final = 16
MIN_OFF_BEAT_SHARE: Final = 0.1
# proposed, unvalidated - plan todo 5: triplet when the 1/3 residual is under 0.6x the 1/4 residual and the 1/4
# residual is over 20 ms. A straight song whose tempo wobbles has a larger 1/4 residual but its 1/3 residual grows as
# much, so the ratio keeps it quarter; random off-grid onsets give a 1/3 : 1/4 ratio near 1.33.
TRIPLET_RATIO: Final = 0.6
QUARTER_MIN_RESIDUAL_MS: Final = 20.0
# proposed, unvalidated - a triplet-leaning song with at least this share of its off-beat onsets within 20 ms of the
# half beat is mixed: a 1/3 grid has no half beat and would drop them, a 1/6 grid keeps both.
MIXED_MIN_HALF_SHARE: Final = 0.25
ON_POINT_MS: Final = 20.0
STEPS_FOR: Final[dict[GridKind, int]] = {"quarter": 4, "triplet": 3, "mixed": 6}

# proposed, unvalidated - fit-based: share of 8-beat windows whose own period folds differently from the song
FOLD_CROSS_MAX_SHARE: Final = 0.1
# Gaps under this are listed (not flagged): the stricter sync limit the owner did not take (make_chart.py:165-167).
GAP_STRICT_S: Final = 0.18
# A grid step with at least this accent is an onset of the 1/4-grid stream for LHL and WNBD (research bench ACCENT_ON).
SYNC_ACCENT_ON: Final = 0.5
STEPS_PER_BAR: Final = 16
# Fitch & Rosenfeld (2007) metrical weights of the 16 steps of a 4/4 bar, as Thul & Toussaint 2008 use them for LHL.
LHL_WEIGHTS: Final = (0, -4, -3, -4, -2, -4, -3, -4, -1, -4, -3, -4, -2, -4, -3, -4)

THRESHOLDS: Final[dict[str, float]] = {
    "fold_cliff": FOLD_CROSS_MAX_SHARE,
    "gap_too_short": 0.125,  # = make_chart.MIN_NOTE_GAP_S
}


def strong_onsets(percussive: np.ndarray, envelope: np.ndarray) -> np.ndarray:
    """Times of the strong onsets, each moved to the steepest rise of the percussive signal near its envelope peak."""
    if len(envelope) == 0 or float(np.percentile(envelope, 99)) <= 0:
        return np.empty(0)
    frames = librosa.onset.onset_detect(onset_envelope=envelope, sr=SAMPLE_RATE, hop_length=HOP, units="frames")
    frames = frames[envelope[frames] >= STRONG_ONSET_SHARE * float(np.percentile(envelope, 99))]
    width = max(1, int(ATTACK_SMOOTHING_S * SAMPLE_RATE))
    rise = np.diff(np.convolve(np.abs(percussive), np.ones(width) / width, mode="same"))
    times = []
    for frame in frames:
        center = frame * HOP / SAMPLE_RATE
        start = max(0, int((center - ATTACK_SEARCH_BEFORE_S) * SAMPLE_RATE))
        end = min(len(rise), int((center + ATTACK_SEARCH_AFTER_S) * SAMPLE_RATE))
        times.append((start + int(rise[start:end].argmax())) / SAMPLE_RATE if end > start else center)
    return np.unique(np.asarray(times, dtype=float))


def grid_fit(onsets: np.ndarray, beats: np.ndarray) -> dict[str, float | int | None]:
    """Median distance (ms) of the off-beat strong onsets to the nearest 1/4-, 1/3- and 1/6-beat grid point.

    Each onset is placed on the beats around it (so a slowly changing tempo moves the grid with it); the distance is in
    that beat's own length. `triplet_share` is the share of off-beat onsets nearer a 1/3 point than a 1/4 point.
    """
    inside = onsets[(onsets >= beats[0]) & (onsets < beats[-1])] if len(beats) >= 2 else np.empty(0)
    position = np.interp(inside, beats, np.arange(len(beats)))
    period_ms = np.diff(beats)[np.minimum(np.floor(position).astype(int), len(beats) - 2)] * 1000
    frac = position - np.floor(position)

    def residual(steps: int) -> np.ndarray:
        return np.abs(frac * steps - np.round(frac * steps)) / steps

    off = np.minimum(frac, 1 - frac) > OFF_BEAT_MIN_BEATS
    medians = {
        name: float(np.median(residual(steps)[off] * period_ms[off])) if off.any() else None
        for name, steps in (("quarter_ms", 4), ("triplet_ms", 3), ("sixth_ms", 6))
    }
    return {
        **medians,
        "strong_onsets": len(inside),
        "off_beat_onsets": int(off.sum()),
        "triplet_share": float(np.mean(residual(3)[off] < residual(4)[off])) if off.any() else None,
        "half_share": float(np.mean(residual(2)[off] * period_ms[off] <= ON_POINT_MS)) if off.any() else None,
    }


def classify_grid(fit: dict[str, float | int | None]) -> GridKind:
    """quarter / triplet / mixed from `grid_fit`. The one place the triplet rule is defined."""
    quarter, triplet, half = fit["quarter_ms"], fit["triplet_ms"], fit["half_share"]
    off, total = int(fit["off_beat_onsets"] or 0), int(fit["strong_onsets"] or 0)
    if quarter is None or triplet is None or half is None:
        return "quarter"
    if off < MIN_OFF_BEAT_ONSETS or off < MIN_OFF_BEAT_SHARE * total:
        return "quarter"
    if quarter > QUARTER_MIN_RESIDUAL_MS and triplet < TRIPLET_RATIO * quarter:
        return "mixed" if half >= MIXED_MIN_HALF_SHARE else "triplet"
    return "quarter"


def grid_steps_per_beat(onsets: np.ndarray, beats: np.ndarray) -> int:
    """Grid steps per beat for make_chart (todo 9): 4 (quarter), 3 (triplet) or 6 (mixed)."""
    return STEPS_FOR[classify_grid(grid_fit(onsets, beats))]


def lhl(active: Sequence[bool], phase_steps: int = 0, *, cyclic: bool = False) -> int:
    """Longuet-Higgins & Lee syncopation of a 1/16-step onset pattern: a note followed by a stronger rest adds the
    weight difference (Fitch & Rosenfeld weights). `phase_steps` is the step the bar starts on."""
    notes = [i for i, on in enumerate(active) if on]
    total = 0
    for k, note in enumerate(notes):
        following = notes[k + 1] if k + 1 < len(notes) else (notes[0] + len(active) if cyclic else None)
        if following is None or following - note < 2:
            continue
        note_weight = LHL_WEIGHTS[(note - phase_steps) % STEPS_PER_BAR]
        rest_weight = max(LHL_WEIGHTS[(rest - phase_steps) % STEPS_PER_BAR] for rest in range(note + 1, following))
        total += max(0, rest_weight - note_weight)
    return total


def wnbd(active: Sequence[bool], *, cyclic: bool = False) -> float | None:
    """Weighted note-to-beat distance (Gomez et al. 2005) of a 1/16-step pattern whose step 0 is on a beat."""
    notes = [i for i, on in enumerate(active) if on]
    if not notes:
        return None
    values = []
    for k, note in enumerate(notes):
        within = note % 4
        if within == 0:
            values.append(0.0)
            continue
        following = notes[k + 1] if k + 1 < len(notes) else (notes[0] + len(active) if cyclic else note + 4)
        distance = min(within, 4 - within) / 4
        next_beat = note - within + 4
        crosses_one = next_beat < following <= next_beat + 4
        values.append((2 if crosses_one else 1) / distance)
    return float(sum(values) / len(values))


def rounded_dict(values: dict[str, Any]) -> dict[str, Any]:
    from .core import rounded

    return {key: rounded(value) for key, value in values.items()}


def pre_fold_beats(beats: np.ndarray, samples_length: int) -> np.ndarray:
    """The beats build_grid hands to fold_tempo: a steady grid when one tempo explains them, else the cleaned beats."""
    from .core import mc

    steady = mc.fit_steady_tempo(beats)
    if steady is None:
        return mc.smooth_locally(mc.drop_crowded_beats(beats))
    period, offset = steady
    return np.arange(offset - period * np.floor(offset / period), samples_length / mc.SAMPLE_RATE, period)


def check_fold_cliff(report: Report, beats: np.ndarray, downbeats: np.ndarray, envelope: np.ndarray) -> None:
    from .core import mc

    fold = mc.fold_report(beats, downbeats, envelope)
    report.describe["fold"] = rounded_dict(fold)
    if fold["near_boundary"] or fold["cross_share"] > FOLD_CROSS_MAX_SHARE:
        report.add(
            "pipeline",
            "fold_cliff",
            "빠르기 접기 경계",
            fold["cross_share"],
            FOLD_CROSS_MAX_SHARE,
            f"박 주기 {fold['period_s']:.3f}초, 경계 10% 이내={fold['near_boundary']}; 비슷한 곡이 두 배 빠르기 차이로 채보될 수 있음",
        )


def check_gaps(ctx: Context, report: Report, accent: np.ndarray, end: float) -> None:
    """Note gaps of the chart the game would make, before and after the 125 ms guard (make_chart.space_notes)."""
    from .core import mc

    grid = ctx.grid
    assert grid is not None
    level = mc.level_for(grid.bpm)
    hits = mc.on_hits(ctx.envelope, grid.step_times)
    picked = [int(step) for step in mc.select_steps(accent, mc.DIFFICULTIES[level]) if grid.step_times[step] <= end]
    unguarded = mc.spread_waits(picked, grid.step_times, accent, hits)
    before = [round(float(grid.step_times[step]), 4) for step in unguarded]
    after = mc.chart_notes(grid, ctx.envelope, accent, level, end)
    gaps = mc.gap_report(before, after)
    report.describe["gaps"] = rounded_dict(
        {
            **gaps,
            "level": level.value,
            "n_before_lt_180": int((np.diff(before) < GAP_STRICT_S).sum()) if len(before) > 1 else 0,
            "notes_before": len(before),
            "notes_after": len(after),
            "min_after": float(np.diff(after).min()) if len(after) > 1 else None,
        }
    )
    if len(before) > 1 and gaps["min_before"] < mc.MIN_NOTE_GAP_S:
        report.add(
            "pipeline",
            "gap_too_short",
            "노트 간격 125ms 미만",
            gaps["min_before"],
            mc.MIN_NOTE_GAP_S,
            f"가드 전 {gaps['n_before_lt_125']}곳, 옮김 {gaps['moved']}, 지움 {gaps['deleted']}; 채보 도구가 고침",
        )


def check_syncopation(report: Report, accent: np.ndarray, beats: np.ndarray, downbeats: np.ndarray, end_step: int) -> None:
    """LHL per bar and WNBD of the 1/4-grid onset stream: descriptions only (no threshold)."""
    from .core import mc

    active = list((accent >= SYNC_ACCENT_ON) & (np.arange(len(accent)) < end_step))
    phase = 0
    if len(downbeats) and len(beats):
        distance = np.abs(downbeats[:, None] - beats[None, :])
        matched = distance.argmin(axis=1)[distance.min(axis=1) < mc.DOWNBEAT_MATCH_S]
        if len(matched):
            phase = int(np.bincount(matched % 4, minlength=4).argmax())
    bars = max(end_step / STEPS_PER_BAR, 1.0)
    report.describe["lhl_per_bar"] = round(lhl(active, phase * mc.STEPS_PER_BEAT) / bars, 3)
    value = wnbd(active)
    report.describe["wnbd"] = round(value, 3) if value is not None else None


def check_grid(ctx: Context, report: Report) -> None:
    from .core import mc

    if ctx.grid is None:
        return
    grid = ctx.grid
    beats = grid.step_times[:: mc.STEPS_PER_BEAT]
    fit = grid_fit(strong_onsets(ctx.percussive, ctx.envelope), beats)
    report.describe["grid"] = classify_grid(fit)
    report.describe["grid_fit"] = rounded_dict(fit)

    tracked, downbeats = mc.track_beats(ctx.samples)
    check_fold_cliff(report, pre_fold_beats(tracked, len(ctx.samples)), downbeats, ctx.envelope)

    step_frames = librosa.time_to_frames(grid.step_times, sr=mc.SAMPLE_RATE, hop_length=mc.HOP)
    accent = mc.step_accents(ctx.envelope, step_frames)
    end = mc.music_end(ctx.samples)
    check_gaps(ctx, report, accent, end)
    check_syncopation(report, accent, beats, downbeats, int(np.searchsorted(grid.step_times, end, side="right")))


CHECKS: Final[list[Callable[[Context, Report], None]]] = [check_grid]


# ─── self-tests (synthetic signals in memory, never played) ───

# Fitch & Rosenfeld's 30 rhythms with LHL and WNBD as tabulated by Thul & Toussaint 2008, Table 3 (research bench
# fitch_rosenfeld_lhl.json): (rhythm, lhl, wnbd).
FITCH_ROSENFELD: Final = (
    ("x.....x.x.....x.", 0, 1.0), ("x...x...x...x.x.", 0, 0.4), ("x.x.x.......x.x.", 1, 0.8),
    ("x...xxx.....x...", 2, 1.6), ("..x...x.x.x.x...", 3, 1.6), ("..x...x.x...x.x.", 4, 2.0),
    ("x.....x..x....x.", 4, 3.5), ("x..x...x..x.x...", 5, 3.6), ("x....x...x...xx.", 5, 4.4),
    ("x....x...x...x..", 6, 5.0), ("..x...x...xx.x..", 9, 5.2), (".x...x...x..x.x.", 9, 4.8),
    ("..x...xx...x.x..", 10, 6.0), ("..x..x.....x...x", 10, 7.0), ("...x.x....xx...x", 11, 6.8),
    ("x...x.xxx.......", 0, 1.2), ("x.x.x.....x.x...", 1, 0.8), ("..x.x...x.x.x...", 2, 0.8),
    ("x.x...x.x..x....", 3, 2.8), ("..x...x.x...x...", 3, 1.5), ("x....x.x..x.x...", 4, 2.8),
    ("..x...x.x.x...x.", 5, 2.8), ("xx...x....x...x.", 6, 4.4), (".x...x...xx.x...", 7, 4.4),
    ("..x...x...x..x..", 8, 5.0), ("..x...x...xx...x", 9, 5.2), ("..x..x....x..x.x", 10, 5.6),
    ("..xx...x...x.x..", 11, 6.8), (".x.x.x.x...x....", 11, 6.4), (".x.x...x...x...x", 12, 7.2),
)


def hit(kind: str) -> np.ndarray:
    length = round(0.06 * SAMPLE_RATE)
    t = np.arange(length) / SAMPLE_RATE
    rng = np.random.default_rng(1 if kind == "hat" else 0)
    if kind == "hat":
        return np.exp(-t * 80) * rng.standard_normal(length)
    return np.exp(-t * 40) * (np.sin(2 * np.pi * 150 * t) + 0.3 * rng.standard_normal(length))


def render(events: list[tuple[float, str, float]], seconds: float) -> np.ndarray:
    signal = np.zeros(round(seconds * SAMPLE_RATE), dtype=np.float32)
    sounds = {kind: hit(kind) for kind in ("kick", "hat")}
    for time, kind, gain in events:
        begin = round(time * SAMPLE_RATE)
        if begin >= len(signal):
            continue
        end = min(len(signal), begin + len(sounds[kind]))
        signal[begin:end] += gain * sounds[kind][: end - begin]
    return (signal / np.max(np.abs(signal)) * 0.5).astype(np.float32)


def beat_times(bpm: float, seconds: float, wobble: float = 0.0) -> np.ndarray:
    """Beats at `bpm`, the tempo swaying by +-`wobble` over 10 s when it is not 0."""
    times, now = [], 0.0
    while now < seconds:
        times.append(now)
        now += 60 / bpm * (1 + wobble * np.sin(2 * np.pi * now / 10))
    return np.asarray(times)


def groove(bpm: float, seconds: float, *, off_beat: Sequence[float], beats_per_bar: int = 4, wobble: float = 0.0,
           jitter_s: float = 0.0) -> np.ndarray:
    """Kick on every beat (louder on the bar), hats at the given fractions of each beat."""
    beats = beat_times(bpm, seconds, wobble)
    rng = np.random.default_rng(2)
    events = [(t, "kick", 1.0 if i % beats_per_bar == 0 else 0.6) for i, t in enumerate(beats)]
    for i, t in enumerate(beats[:-1]):
        events += [(t + share * (beats[i + 1] - t), "hat", 0.5) for share in off_beat]
    if jitter_s:
        events = [(max(0.0, t + jitter_s * float(rng.standard_normal())), kind, gain) for t, kind, gain in events]
    return render(events, seconds)


def screened(signal: np.ndarray) -> dict[str, Any]:
    from . import core

    with core.temp_audio(signal) as path:
        return core.screen(path, {"credit": "CC0"})


def pipeline_codes(result: dict[str, Any]) -> list[str]:
    return [item["code"] for item in result["pipeline"]]


def test_swing_is_triplet() -> None:
    result = screened(groove(100, 40, off_beat=[2 / 3]))
    assert result["describe"]["grid"] == "triplet", result["describe"]["grid_fit"]


def test_straight_is_quarter_without_pipeline_items() -> None:
    result = screened(groove(120, 40, off_beat=[1 / 2]))
    assert result["describe"]["grid"] == "quarter", result["describe"]["grid_fit"]
    assert pipeline_codes(result) == [], (result["pipeline"], result["describe"]["fold"])


def test_wobbly_straight_is_quarter() -> None:
    # A plain song whose tempo sways 4% and whose hits are 10 ms loose must not read as triplet.
    result = screened(groove(120, 40, off_beat=[1 / 4, 1 / 2, 3 / 4], wobble=0.04, jitter_s=0.01))
    assert result["describe"]["grid"] == "quarter", result["describe"]["grid_fit"]


def test_waltz_is_not_triplet() -> None:
    for bpm in (120, 180):
        result = screened(groove(bpm, 40, off_beat=[], beats_per_bar=3))
        assert result["fail"] == [] and result["describe"]["grid"] == "quarter", (bpm, result["describe"])


def test_fold_cliff_at_152_bpm() -> None:
    result = screened(groove(152, 40, off_beat=[]))
    assert "fold_cliff" in pipeline_codes(result), result["describe"]["fold"]


def test_sixteenths_at_140_bpm_gap_too_short() -> None:
    result = screened(groove(140, 40, off_beat=[1 / 4, 1 / 2, 3 / 4]))
    gaps = result["describe"]["gaps"]
    assert "gap_too_short" in pipeline_codes(result) and gaps["n_before_lt_125"] > 0, gaps
    assert gaps["min_after"] is None or gaps["min_after"] >= 0.125, gaps


def test_syncopation_matches_fitch_rosenfeld() -> None:
    patterns = [[step == "x" for step in rhythm] for rhythm, _, _ in FITCH_ROSENFELD]
    lhl_ok = sum(lhl(p, cyclic=True) == want for p, (_, want, _) in zip(patterns, FITCH_ROSENFELD))
    wnbd_ok = sum(round(wnbd(p, cyclic=True) or 0, 1) == want for p, (_, _, want) in zip(patterns, FITCH_ROSENFELD))
    assert lhl_ok >= 29 and wnbd_ok >= 29, (lhl_ok, wnbd_ok)


def test_grid_rule_on_onsets() -> None:
    beats = np.arange(0, 60, 0.6)
    swing = np.sort(np.concatenate([beats, beats[:-1] + 0.4]))
    straight = np.sort(np.concatenate([beats, beats[:-1] + 0.3]))
    mixed = np.sort(np.concatenate([beats, beats[:-1:2] + 0.2, beats[1:-1:2] + 0.3]))
    few = np.sort(np.concatenate([beats, beats[:10] + 0.4]))
    got = [grid_steps_per_beat(onsets, beats) for onsets in (swing, straight, mixed, few)]
    assert got == [3, 4, 6, 4], got


SELF_TESTS: Final[list[Callable[[], None]]] = [
    test_grid_rule_on_onsets,
    test_syncopation_matches_fitch_rosenfeld,
    test_swing_is_triplet,
    test_straight_is_quarter_without_pipeline_items,
    test_wobbly_straight_is_quarter,
    test_waltz_is_not_triplet,
    test_fold_cliff_at_152_bpm,
    test_sixteenths_at_140_bpm_gap_too_short,
]
