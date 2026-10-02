#!/usr/bin/env -S uv run --script
# /// script
# requires-python = "==3.12.*"
# dependencies = [
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
#    Options: --artist "Name", --credit "attribution text the music license requires"
# ──────────────────

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Final

import librosa
import numpy as np
import typer
from chart_notes import (
    CHORD_RATIO_BY_DIFFICULTY,
    STEPS_PER_BEAT,
    Candidate,
    Sound,
    add_chords,
    add_holds,
    assign_lanes,
    to_json,
)
from rich.console import Console
from rich.table import Table
from scipy.ndimage import percentile_filter

SAMPLE_RATE: Final = 22050
HOP: Final = 256
MIN_BEATS: Final = 8

# Tempo is folded into 75-150 BPM so that half / quarter / 8th notes are playable as easy / normal / hard.
MIN_BEAT_PERIOD_S: Final = 0.4
MAX_BEAT_PERIOD_S: Final = 0.8
STEP_DIVISOR_BY_DIFFICULTY: Final = {"easy": 8, "normal": 4, "hard": 2}

STEADY_INLIER_RESIDUAL_S: Final = 0.035
STEADY_MIN_INLIER_RATIO: Final = 0.9
LOCAL_FIT_HALF_WINDOW_BEATS: Final = 4
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
ON_BEAT_THRESHOLD: Final = 0.25
ON_HALF_BEAT_THRESHOLD: Final = 0.3


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


def smooth_locally(beats: np.ndarray) -> np.ndarray:
    smoothed = np.empty_like(beats)
    for i in range(len(beats)):
        start = max(0, i - LOCAL_FIT_HALF_WINDOW_BEATS)
        end = min(len(beats), i + LOCAL_FIT_HALF_WINDOW_BEATS + 1)
        slope, intercept = np.polyfit(np.arange(start, end), beats[start:end], 1)
        smoothed[i] = slope * i + intercept
    return smoothed


def fold_tempo(beats: np.ndarray, envelope: np.ndarray) -> np.ndarray:
    def mean_strength(times: np.ndarray) -> float:
        frames = librosa.time_to_frames(times, sr=SAMPLE_RATE, hop_length=HOP)
        return float(envelope[np.clip(frames, 0, len(envelope) - 1)].mean())

    while np.median(np.diff(beats)) < MIN_BEAT_PERIOD_S:
        even, odd = beats[::2], beats[1::2]
        beats = even if mean_strength(even) >= mean_strength(odd) else odd
    while np.median(np.diff(beats)) >= MAX_BEAT_PERIOD_S:
        beats = np.sort(np.concatenate([beats, (beats[:-1] + beats[1:]) / 2]))
    return beats


def align_to_attacks(beats: np.ndarray, percussive: np.ndarray, *, is_steady: bool) -> np.ndarray:
    # Beat detectors report ~10-20 ms after the real attack (frame-based spectral flux), so the
    # phase is re-measured from the sample-accurate steepest rise near each beat.
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


def build_grid(percussive: np.ndarray, envelope: np.ndarray) -> BeatGrid:
    _, beat_frames = librosa.beat.beat_track(
        onset_envelope=envelope, sr=SAMPLE_RATE, hop_length=HOP, trim=False
    )
    beats = librosa.frames_to_time(beat_frames, sr=SAMPLE_RATE, hop_length=HOP)
    if len(beats) < MIN_BEATS:
        raise NoBeatError(len(beats))

    steady = fit_steady_tempo(beats)
    if steady is None:
        beats = smooth_locally(beats)
    else:
        period, offset = steady
        beats = np.arange(offset - period * np.floor(offset / period), len(percussive) / SAMPLE_RATE, period)

    beats = align_to_attacks(fold_tempo(beats, envelope), percussive, is_steady=steady is not None)
    steps = np.arange((len(beats) - 1) * STEPS_PER_BEAT + 1) / STEPS_PER_BEAT
    return BeatGrid(
        bpm=60.0 / float(np.median(np.diff(beats))),
        is_steady=steady is not None,
        step_times=np.interp(steps, np.arange(len(beats)), beats),
    )


def rhythm_steps(envelope: np.ndarray, step_frames: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Grid steps where the percussive envelope stands out against its surrounding section.

    Returns the step indices and, for every step, how strongly it stands out (its accent).
    """
    normalized = envelope / (float(np.percentile(envelope, 99)) or 1.0)
    windows = np.lib.stride_tricks.sliding_window_view(
        np.pad(normalized, (0, ENVELOPE_PEAK_FRAMES)), ENVELOPE_PEAK_FRAMES
    )
    strength = windows[np.minimum(step_frames, len(windows) - 1)].max(axis=1)
    level = percentile_filter(strength, LOCAL_LEVEL_PERCENTILE, size=LOCAL_LEVEL_WINDOW_STEPS, mode="nearest")

    step = np.arange(len(step_frames))
    threshold = np.where(step % STEPS_PER_BEAT == 0, ON_BEAT_THRESHOLD, ON_HALF_BEAT_THRESHOLD)
    is_playable = step % (STEPS_PER_BEAT // 2) == 0
    steps = np.flatnonzero(is_playable & (strength >= threshold * level) & (strength >= MIN_STRENGTH))
    return steps, strength / np.maximum(level, MIN_STRENGTH)


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
                "notes": {name: len(notes) for name, notes in chart["charts"].items()},
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
) -> None:
    """Analyze AUDIO, write chart.json (easy / normal / hard) next to it and refresh the song list."""
    samples, _ = librosa.load(audio, sr=SAMPLE_RATE, mono=True)
    duration = len(samples) / SAMPLE_RATE
    percussive = librosa.effects.percussive(samples)
    envelope = librosa.onset.onset_strength(y=percussive, sr=SAMPLE_RATE, hop_length=HOP)
    grid = build_grid(percussive, envelope)

    step_frames = librosa.time_to_frames(grid.step_times, sr=SAMPLE_RATE, hop_length=HOP)
    brightness = librosa.feature.spectral_centroid(y=samples, sr=SAMPLE_RATE, hop_length=HOP)[0]
    steps, accent = rhythm_steps(envelope, step_frames)
    candidates = [
        Candidate(
            step=int(step),
            time=float(grid.step_times[step]),
            brightness=float(brightness[min(step_frames[step] + 1, len(brightness) - 1)]),
            accent=float(accent[step]),
        )
        for step in steps
    ]
    sound = Sound(
        step_times=grid.step_times,
        loudness=librosa.feature.rms(y=samples, hop_length=HOP)[0],
        frames_per_second=SAMPLE_RATE / HOP,
    )
    charts = {
        name: add_chords(
            add_holds(assign_lanes([c for c in candidates if c.step % divisor == 0]), divisor, sound),
            CHORD_RATIO_BY_DIFFICULTY[name],
        )
        for name, divisor in STEP_DIVISOR_BY_DIFFICULTY.items()
    }

    chart = {
        "version": 2,
        "title": title or audio.parent.name,
        "audio": audio.name,
        "bpm": round(grid.bpm, 2),
        "offset": round(float(grid.step_times[0]), 4),
        "duration": round(duration, 3),
        "charts": {name: to_json(notes) for name, notes in charts.items()},
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
    table.add_column("holds", justify="right")
    table.add_column("chords", justify="right")
    for name, notes in charts.items():
        holds = sum(note.end is not None for note in notes)
        chords = len(notes) - len({note.step for note in notes})
        table.add_row(name, str(len(notes)), f"{len(notes) / duration:.2f}", str(holds), str(chords))
    console = Console()
    console.print(table)
    console.print(f"[green]wrote[/green] {out}")
    console.print(f"[green]updated[/green] {index_path}")


if __name__ == "__main__":
    typer.run(main)
