#!/usr/bin/env -S uv run --script
# /// script
# requires-python = "==3.12.*"
# dependencies = [
#     "beat-this==1.1.0",
#     "librosa",
#     "numpy",
#     "scipy",
#     "typer",
#     "rich",
# ]
# ///

# ─── How to run ───
# 1. Install uv (if not installed):
#      curl -LsSf https://astral.sh/uv/install.sh | sh
# 2. Run (writes chart.json next to the audio file):
#      uv run tools/make_chart.py public/songs/<song-id>/song.mp3 --title "Song Title"
#    Options: --artist "Name", --credit "attribution text the music license requires",
#             --difficulty easy|normal|hard (without it the tempo decides)
#    The first run downloads PyTorch and the beat-tracking model, which takes a few minutes.
# ──────────────────

from __future__ import annotations

import json
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import Final

import librosa
import numpy as np
import typer
from beat_this.inference import Audio2Beats
from rich.console import Console
from rich.table import Table
from scipy.ndimage import median_filter, percentile_filter

SAMPLE_RATE: Final = 22050
HOP: Final = 256
STEPS_PER_BEAT: Final = 4
MIN_BEATS: Final = 8

# Tempo is folded into 75-150 BPM so that one beat is a comfortable single-key tap. A fast song in three
# (a waltz) is left as it is, because half its beats would not be a beat of the music.
MIN_BEAT_PERIOD_S: Final = 0.4
MAX_BEAT_PERIOD_S: Final = 0.8
NEVER: Final = float("inf")

STEADY_INLIER_RESIDUAL_S: Final = 0.035
# A constant-tempo grid replaces the tracked beats only when it explains practically all of them: a passage
# the music plays half a beat off, or after a pause, would otherwise be charted on the off-beat.
STEADY_MIN_INLIER_RATIO: Final = 0.98
LOCAL_FIT_HALF_WINDOW_BEATS: Final = 4
# A gap this far, as a ratio, from the usual gap of its passage is a pause or a pickup rather than one beat.
RUN_BREAK_RATIO: Final = 0.25
RUN_TEMPO_WINDOW_BEATS: Final = 9
DOWNBEAT_MATCH_S: Final = 0.07
# Even a "steady" recording drifts a few ms over minutes; a wide window follows that without adding jitter.
STEADY_ALIGN_HALF_WINDOW_BEATS: Final = 16

ATTACK_SEARCH_BEFORE_S: Final = 0.06
ATTACK_SEARCH_AFTER_S: Final = 0.03
ATTACK_SMOOTHING_S: Final = 0.005

# The onset envelope peaks 1-2 frames after the attack it reports.
ENVELOPE_PEAK_FRAMES: Final = 4
LOCAL_LEVEL_WINDOW_STEPS: Final = 65
LOCAL_LEVEL_PERCENTILE: Final = 80
MIN_STRENGTH: Final = 0.04

# The music has ended once it stays this far below its loudest; the faint hits of a fade-out after that are no notes.
END_LEVEL_DB: Final = -30.0
END_FRAME: Final = 2048
# Before the music first comes within END_LEVEL_DB of its loudest, a note needs something to hear around it: one
# on the silence of a lead-in, or on the fading tail of a soft pickup, is a tap on nothing. -36 dB lies between
# the softest pickup hit charted so far (-32 dB, Impact Allegretto) and the loudest such tail (-43 dB, the same song).
HEARD_LEVEL_DB: Final = -36.0
HEARD_FRAME: Final = 512
HEARD_SEARCH_S: Final = 0.05

ANCHOR_COUNT: Final = 8
ANCHOR_LEVEL_S: Final = 0.005
# A stretch whose sharpest attack is weaker than this share of the song's sharpest gives no anchor.
ANCHOR_MIN_SHARE: Final = 0.2


# A song is charted at one difficulty. Unless one is asked for, its tempo picks how many of its hits become notes
# (`level_for`), and then the notes picked decide the difficulty the chart is listed under (`rated_level`).
EASY_BELOW_BPM: Final = 105
HARD_FROM_BPM: Final = 125

# How hard a chart is to play: its notes per minute, raised by the share of them off the beat and by the share
# that come within QUICK_GAP_S of the note before. 200 and 360 split the songs into thirds of about equal size.
QUICK_GAP_S: Final = 0.25
QUICK_WEIGHT: Final = 0.5
OFF_BEAT_TOLERANCE: Final = 0.1
EASY_BELOW_LOAD: Final = 200
HARD_FROM_LOAD: Final = 360


class Level(StrEnum):
    EASY = "easy"
    NORMAL = "normal"
    HARD = "hard"


@dataclass(frozen=True, slots=True)
class Difficulty:
    """Minimum accent a grid step needs to become a note, by where it falls in the beat.

    The music's own accents decide where the notes go, on the beat or off it, so a chart plays the song's
    rhythm instead of ticking every beat: a beat with no clear hit is left out, an off-beat hit hard is kept.
    Mixed spacing is also what bends the path in the game. Harder charts take weaker hits, and the quarter
    steps between the beat and the half beat.
    """

    on_beat: float
    on_half_beat: float = NEVER
    off_beat: float = NEVER


DIFFICULTIES: Final = {
    Level.EASY: Difficulty(on_beat=0.6, on_half_beat=0.95),
    Level.NORMAL: Difficulty(on_beat=0.55, on_half_beat=0.6, off_beat=1.3),
    Level.HARD: Difficulty(on_beat=0.5, on_half_beat=0.4, off_beat=0.75),
}

# Where the accents leave more than this many beats without a note, the beats in between that have any hit at
# all become notes too, so a quieter passage is not one long wait.
FILL_AFTER_BEATS: Final = 2
FILL_MIN_ACCENT: Final = 0.25


def level_for(bpm: float) -> Level:
    if bpm < EASY_BELOW_BPM:
        return Level.EASY
    return Level.HARD if bpm >= HARD_FROM_BPM else Level.NORMAL


def rated_level(notes: list[float], bpm: float, offset: float) -> Level:
    """The difficulty to list a chart under, from how hard its notes are to play."""
    times = np.asarray(notes)
    phase = ((times - offset) * bpm / 60) % 1
    off_beat = float(np.mean(np.abs(phase - np.round(phase)) > OFF_BEAT_TOLERANCE))
    gaps = np.diff(times)
    quick = float(np.mean(gaps < QUICK_GAP_S)) if len(gaps) > 0 else 0.0
    per_minute = len(times) / max(float(times[-1] - times[0]), 1.0) * 60
    load = per_minute * (1 + off_beat) * (1 + QUICK_WEIGHT * quick)
    if load < EASY_BELOW_LOAD:
        return Level.EASY
    return Level.HARD if load >= HARD_FROM_LOAD else Level.NORMAL


@dataclass(frozen=True, slots=True)
class BeatGrid:
    bpm: float
    is_steady: bool
    step_times: np.ndarray


class NoBeatError(Exception):
    def __init__(self, beats_found: int) -> None:
        self.beats_found = beats_found
        super().__init__(f"beat tracking found only {beats_found} beats (need {MIN_BEATS})")


def fit_steady_tempo(beats: np.ndarray) -> tuple[float, float] | None:
    """Return (period, offset) when one constant tempo explains the tracked beats, else None."""
    rough_period = float(np.median(np.diff(beats)))
    skipped = np.maximum(1, np.round(np.diff(beats) / rough_period)).astype(int)
    index = np.concatenate([[0], np.cumsum(skipped)])
    inliers = np.ones(len(beats), dtype=bool)
    period, offset = rough_period, float(beats[0])
    for _ in range(3):
        period, offset = np.polyfit(index[inliers], beats[inliers], 1)
        inliers = np.abs(beats - (offset + period * index)) < STEADY_INLIER_RESIDUAL_S
        if inliers.mean() < STEADY_MIN_INLIER_RATIO:
            return None
    return float(period), float(offset)


def track_beats(samples: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Beats and downbeats in seconds, from the Beat This! model.

    It keeps the beat through syncopation and pauses, where an onset-based tracker slips onto the off-beat.
    """
    tracker = Audio2Beats(checkpoint_path="final0", device="cpu", dbn=False)
    beats, downbeats = tracker(samples, SAMPLE_RATE)
    return np.asarray(beats, dtype=float), np.asarray(downbeats, dtype=float)


def beat_runs(beats: np.ndarray) -> list[np.ndarray]:
    """Indices of the beats, split wherever the gap to the next beat is not about one beat of that passage."""
    gaps = np.diff(beats)
    usual = median_filter(gaps, size=RUN_TEMPO_WINDOW_BEATS, mode="nearest")
    breaks = np.flatnonzero(np.abs(gaps / usual - 1) > RUN_BREAK_RATIO) + 1
    return np.split(np.arange(len(beats)), breaks)


def smooth_locally(beats: np.ndarray) -> np.ndarray:
    """Fit each beat to its neighbours, which evens out the tracker's coarse time steps without bridging a pause."""
    smoothed = beats.copy()
    for run in beat_runs(beats):
        for i in run:
            start = max(run[0], i - LOCAL_FIT_HALF_WINDOW_BEATS)
            end = min(run[-1], i + LOCAL_FIT_HALF_WINDOW_BEATS) + 1
            if end - start >= 3:
                slope, intercept = np.polyfit(np.arange(start, end), beats[start:end], 1)
                smoothed[i] = slope * i + intercept
    return smoothed


def fold_tempo(beats: np.ndarray, downbeats: np.ndarray, envelope: np.ndarray) -> np.ndarray:
    def mean_strength(times: np.ndarray) -> float:
        frames = librosa.time_to_frames(times, sr=SAMPLE_RATE, hop_length=HOP)
        return float(envelope[np.clip(frames, 0, len(envelope) - 1)].mean())

    def bar_starts(times: np.ndarray) -> int:
        if len(downbeats) == 0:
            return 0
        return int((np.abs(downbeats[:, None] - times[None, :]).min(axis=1) < DOWNBEAT_MATCH_S).sum())

    def main_half(run: np.ndarray) -> np.ndarray:
        """Every other beat of a run: the half the bars start on, or the louder half when neither has more."""
        even, odd = run[::2], run[1::2]
        if len(odd) == 0:
            return even
        return max(even, odd, key=lambda half: (bar_starts(half), mean_strength(half)))

    def is_in_three() -> bool:
        """True when most bars are three or six beats long, as in a waltz: every other beat would cut across them."""
        if len(downbeats) < 2:
            return False
        bar_lengths = np.diff(np.abs(downbeats[:, None] - beats[None, :]).argmin(axis=1))
        return bool((bar_lengths[bar_lengths > 0] % 3 == 0).mean() > 0.5)

    while np.median(np.diff(beats)) < MIN_BEAT_PERIOD_S and not is_in_three():
        halved = np.concatenate([main_half(beats[run]) for run in beat_runs(beats)])
        if len(halved) == len(beats):
            break
        beats = halved
    while np.median(np.diff(beats)) >= MAX_BEAT_PERIOD_S:
        beats = np.sort(np.concatenate([beats, (beats[:-1] + beats[1:]) / 2]))
    return beats


def align_to_attacks(beats: np.ndarray, percussive: np.ndarray, *, is_steady: bool) -> np.ndarray:
    # The tracker reports beats in 20 ms steps and not exactly on the attack, so the phase is
    # re-measured from the sample-accurate steepest rise near each beat.
    width = int(ATTACK_SMOOTHING_S * SAMPLE_RATE)
    rise = np.diff(np.convolve(np.abs(percussive), np.ones(width) / width, mode="same"))

    shifts = np.full(len(beats), np.nan)
    for i, beat_time in enumerate(beats):
        start = int((beat_time - ATTACK_SEARCH_BEFORE_S) * SAMPLE_RATE)
        end = int((beat_time + ATTACK_SEARCH_AFTER_S) * SAMPLE_RATE)
        if start >= 0 and end <= len(rise):
            shifts[i] = (start + int(rise[start:end].argmax())) / SAMPLE_RATE - beat_time

    half_window = STEADY_ALIGN_HALF_WINDOW_BEATS if is_steady else LOCAL_FIT_HALF_WINDOW_BEATS
    local = np.array(
        [np.nanmedian(shifts[max(0, i - half_window) : i + half_window + 1]) for i in range(len(beats))]
    )
    return beats + np.nan_to_num(local, nan=float(np.nanmedian(shifts)))


def build_grid(samples: np.ndarray, percussive: np.ndarray, envelope: np.ndarray) -> BeatGrid:
    beats, downbeats = track_beats(samples)
    if len(beats) < MIN_BEATS:
        raise NoBeatError(len(beats))

    steady = fit_steady_tempo(beats)
    if steady is None:
        beats = smooth_locally(beats)
    else:
        period, offset = steady
        beats = np.arange(offset - period * np.floor(offset / period), len(percussive) / SAMPLE_RATE, period)

    beats = align_to_attacks(fold_tempo(beats, downbeats, envelope), percussive, is_steady=steady is not None)
    steps = np.arange((len(beats) - 1) * STEPS_PER_BEAT + 1) / STEPS_PER_BEAT
    return BeatGrid(
        bpm=60.0 / float(np.median(np.diff(beats))),
        is_steady=steady is not None,
        step_times=np.interp(steps, np.arange(len(beats)), beats),
    )


def step_accents(envelope: np.ndarray, step_frames: np.ndarray) -> np.ndarray:
    """How strongly the percussive envelope stands out at each grid step, relative to its section.

    Around 1 is a typical strong hit of that section; 0 means nothing audible happens there.
    """
    normalized = envelope / (float(np.percentile(envelope, 99)) or 1.0)
    windows = np.lib.stride_tricks.sliding_window_view(
        np.pad(normalized, (0, ENVELOPE_PEAK_FRAMES)), ENVELOPE_PEAK_FRAMES
    )
    strength = windows[np.minimum(step_frames, len(windows) - 1)].max(axis=1)
    level = percentile_filter(strength, LOCAL_LEVEL_PERCENTILE, size=LOCAL_LEVEL_WINDOW_STEPS, mode="nearest")

    return np.where(strength >= MIN_STRENGTH, strength / np.maximum(level, MIN_STRENGTH), 0.0)


def select_steps(accent: np.ndarray, difficulty: Difficulty) -> np.ndarray:
    step = np.arange(len(accent))
    minimum = np.where(
        step % STEPS_PER_BEAT == 0,
        difficulty.on_beat,
        np.where(step % 2 == 0, difficulty.on_half_beat, difficulty.off_beat),
    )
    chosen = np.flatnonzero(accent >= minimum)
    bounds = np.concatenate([[-STEPS_PER_BEAT], chosen, [len(accent)]])
    fill = [
        beat
        for before, after in zip(bounds[:-1], bounds[1:])
        if after - before > FILL_AFTER_BEATS * STEPS_PER_BEAT
        for beat in range((before // STEPS_PER_BEAT + 1) * STEPS_PER_BEAT, after, STEPS_PER_BEAT)
        if beat - before >= STEPS_PER_BEAT and after - beat >= STEPS_PER_BEAT and accent[beat] >= FILL_MIN_ACCENT
    ]
    return np.union1d(chosen, np.asarray(fill, dtype=int)).astype(int)


def music_end(samples: np.ndarray) -> float:
    """The time after which the song never again comes within END_LEVEL_DB of its loudest moment."""
    rms = librosa.feature.rms(y=samples, frame_length=END_FRAME, hop_length=HOP)[0]
    level = 20 * np.log10(np.maximum(rms, 1e-9) / max(float(rms.max()), 1e-9))
    loud = np.flatnonzero(level > END_LEVEL_DB)
    if len(loud) == 0:
        return len(samples) / SAMPLE_RATE
    return float((loud[-1] * HOP + END_FRAME / 2) / SAMPLE_RATE)


def music_start(samples: np.ndarray) -> float:
    """The time before which the song never comes within END_LEVEL_DB of its loudest moment."""
    rms = librosa.feature.rms(y=samples, frame_length=END_FRAME, hop_length=HOP)[0]
    level = 20 * np.log10(np.maximum(rms, 1e-9) / max(float(rms.max()), 1e-9))
    loud = np.flatnonzero(level > END_LEVEL_DB)
    if len(loud) == 0:
        return 0.0
    return max(0.0, float((loud[0] * HOP - END_FRAME / 2) / SAMPLE_RATE))


def unheard_lead_in(samples: np.ndarray, notes: list[float]) -> list[float]:
    """The notes before `music_start` with nothing within HEARD_LEVEL_DB of the loudest moment around them."""
    start = music_start(samples)
    loudest = float(librosa.feature.rms(y=samples, frame_length=END_FRAME, hop_length=HOP)[0].max())
    rms = librosa.feature.rms(y=samples, frame_length=HEARD_FRAME, hop_length=HOP)[0]
    level = 20 * np.log10(np.maximum(rms, 1e-9) / max(loudest, 1e-9))

    def heard(time: float) -> bool:
        low = max(0, int((time - HEARD_SEARCH_S) * SAMPLE_RATE / HOP))
        high = min(len(level), int((time + HEARD_SEARCH_S) * SAMPLE_RATE / HOP) + 1)
        return bool(level[low:high].max() > HEARD_LEVEL_DB) if high > low else False

    return [time for time in notes if time < start and not heard(time)]


def attack_anchors(samples: np.ndarray) -> list[float]:
    """Times of the sharpest attack in each stretch of the song.

    Decoders differ in how much padding they drop from the start of an mp3, so the same sound sits at a
    slightly different time in every browser. The game finds these attacks again in its own decoded audio
    and shifts the chart by the difference. An attack is where the level of the last `ANCHOR_LEVEL_S`
    rises most over the level of the `ANCHOR_LEVEL_S` before; the game measures it the same way.
    """
    width = round(ANCHOR_LEVEL_S * SAMPLE_RATE)
    energy = np.concatenate([[0.0], np.cumsum(samples.astype(np.float64) ** 2)])
    level = np.sqrt((energy[width:] - energy[:-width]) / width)
    rise = level[width:] - level[:-width]
    anchors = []
    for stretch in np.array_split(np.arange(len(rise)), ANCHOR_COUNT):
        sharpest = stretch[int(rise[stretch].argmax())]
        if rise[sharpest] >= ANCHOR_MIN_SHARE * rise.max():
            # rise[k] compares the window that ends at sample k + 2 * width with the one before it.
            anchors.append(round(float((sharpest + 2 * width) / SAMPLE_RATE), 4))
    return anchors


def write_song_index(songs_dir: Path) -> Path:
    songs = []
    for chart_path in sorted(songs_dir.glob("*/chart.json")):
        chart = json.loads(chart_path.read_text(encoding="utf-8"))
        optional = {key: chart[key] for key in ("artist", "credit") if key in chart}
        songs.append(
            {
                "id": chart_path.parent.name,
                "title": chart["title"],
                "bpm": chart["bpm"],
                "duration": chart["duration"],
                "difficulty": chart["difficulty"],
                "notes": len(chart["notes"]),
                **optional,
            }
        )
    index_path = songs_dir / "index.json"
    index_path.write_text(json.dumps({"songs": songs}, ensure_ascii=False, indent=1), encoding="utf-8")
    return index_path


def main(
    audio: Path,
    title: str | None = None,
    artist: str | None = None,
    credit: str | None = None,
    difficulty: Level | None = None,
) -> None:
    """Analyze AUDIO, write chart.json next to it and refresh the song list."""
    samples, _ = librosa.load(audio, sr=SAMPLE_RATE, mono=True)
    duration = len(samples) / SAMPLE_RATE
    percussive = librosa.effects.percussive(samples)
    envelope = librosa.onset.onset_strength(y=percussive, sr=SAMPLE_RATE, hop_length=HOP)
    grid = build_grid(samples, percussive, envelope)

    step_frames = librosa.time_to_frames(grid.step_times, sr=SAMPLE_RATE, hop_length=HOP)
    accent = step_accents(envelope, step_frames)
    level = difficulty or level_for(grid.bpm)
    end = music_end(samples)
    notes = [
        round(float(grid.step_times[step]), 4)
        for step in select_steps(accent, DIFFICULTIES[level])
        if grid.step_times[step] <= end
    ]
    unheard = set(unheard_lead_in(samples, notes))
    notes = [time for time in notes if time not in unheard]
    listed = difficulty or rated_level(notes, grid.bpm, float(grid.step_times[0]))

    chart = {
        "version": 4,
        "title": title or audio.parent.name,
        "audio": audio.name,
        "bpm": round(grid.bpm, 2),
        "offset": round(float(grid.step_times[0]), 4),
        "duration": round(duration, 3),
        "anchors": attack_anchors(samples),
        "difficulty": listed.value,
        "notes": notes,
    }
    for key, value in (("artist", artist), ("credit", credit)):
        if value:
            chart[key] = value
    out = audio.with_name("chart.json")
    out.write_text(json.dumps(chart, ensure_ascii=False, indent=1), encoding="utf-8")
    index_path = write_song_index(audio.parent.parent)

    tempo = "steady tempo" if grid.is_steady else "varying tempo"
    table = Table(title=f"{chart['title']}  |  {chart['bpm']} BPM ({tempo})  |  {duration:.1f}s")
    table.add_column("difficulty")
    table.add_column("notes", justify="right")
    table.add_column("notes/sec", justify="right")
    table.add_row(listed.value, str(len(notes)), f"{len(notes) / duration:.2f}")
    console = Console()
    console.print(table)
    console.print(f"[green]wrote[/green] {out}")
    console.print(f"[green]updated[/green] {index_path}")


if __name__ == "__main__":
    typer.run(main)
