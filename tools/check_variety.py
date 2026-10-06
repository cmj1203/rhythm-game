#!/usr/bin/env -S uv run --script
# /// script
# requires-python = "==3.12.*"
# dependencies = [
#     "librosa",
#     "numpy",
#     "typer",
# ]
# ///

# ─── How to run ───
#   uv run tools/check_variety.py                  every song in public/songs, most repetitive first
#   uv run tools/check_variety.py song-a song-b    only these songs
# Scores how much each song keeps playing the same part over again, from the sound itself, cut into bars of the
# chart's beat. A song that mostly loops one section is tiring to play through, however well it is charted.
# The repeat score is the share of bars that sound the same (log-mel correlation 0.95 or more) as the bar one or
# two phrases (4 or 8 bars) before them. A song scoring 50% or more fails, and the run exits with 1.
# ──────────────────

from __future__ import annotations

import json
from multiprocessing import Pool
from pathlib import Path
from typing import Final

import librosa
import numpy as np
import typer

SONGS_DIR: Final = Path(__file__).parent.parent / "public" / "songs"
SAMPLE_RATE: Final = 22050
HOP: Final = 512
BEATS_PER_BAR: Final = 4
PHRASE_BARS: Final = 4
# Two bars whose sound (log-mel spectrogram, laid out in time) correlates this well are the same bar played again.
# Different parts of one song already correlate around 0.8 (same instruments, same tempo), so the bar is set high.
SAME_BAR: Final = 0.95
TOO_REPETITIVE: Final = 0.5
MEL_BANDS: Final = 48
FRAMES_PER_BAR: Final = 32


def bar_sounds(samples: np.ndarray, bpm: float, offset: float) -> np.ndarray:
    """One row per bar: its log-mel spectrogram stretched to the same length, centred and scaled to length 1."""
    mel = librosa.power_to_db(librosa.feature.melspectrogram(y=samples, sr=SAMPLE_RATE, hop_length=HOP, n_mels=MEL_BANDS))
    bar_s = 60 / bpm * BEATS_PER_BAR
    starts = np.arange(max(offset, 0.0), len(samples) / SAMPLE_RATE - bar_s, bar_s)
    rows = []
    for start in starts:
        low, high = librosa.time_to_frames([start, start + bar_s], sr=SAMPLE_RATE, hop_length=HOP)
        columns = np.linspace(low, high - 1, FRAMES_PER_BAR).round().astype(int)
        row = mel[:, columns].ravel()
        row = row - row.mean()
        rows.append(row / (np.linalg.norm(row) + 1e-9))
    return np.asarray(rows)


def variety(song_id: str) -> dict[str, float | str]:
    chart = json.loads((SONGS_DIR / song_id / "chart.json").read_text(encoding="utf-8"))
    samples, _ = librosa.load(SONGS_DIR / song_id / chart["audio"], sr=SAMPLE_RATE, mono=True)
    bars = bar_sounds(samples, chart["bpm"], chart["offset"])
    similar = bars @ bars.T
    # A bar repeats when it sounds like the bar one phrase (4 bars) or two phrases (8 bars) before it.
    repeated = np.zeros(len(bars), dtype=bool)
    for i in range(PHRASE_BARS, len(bars)):
        before = [similar[i, i - PHRASE_BARS]] + ([similar[i, i - 2 * PHRASE_BARS]] if i >= 2 * PHRASE_BARS else [])
        repeated[i] = max(before) >= SAME_BAR
    longest = run = 0
    for flag in repeated:
        run = run + 1 if flag else 0
        longest = max(longest, run)
    # Sameness: how alike bars far apart (16 bars or more) are, on the middle; near 1 means one sound all the way.
    far = similar[np.triu_indices(len(bars), 4 * PHRASE_BARS)]
    bar_s = 60 / chart["bpm"] * BEATS_PER_BAR
    return {
        "id": song_id,
        "title": chart["title"],
        "repeat": round(float(repeated[PHRASE_BARS:].mean()) if len(bars) > PHRASE_BARS else 0.0, 3),
        "longest_repeat_s": round(longest * bar_s, 1),
        "sameness": round(float(np.median(far)) if len(far) > 0 else 0.0, 3),
    }


def main(songs: list[str] | None = typer.Argument(None, help="song ids; every song when left out")) -> None:
    ids = songs or sorted(path.parent.name for path in SONGS_DIR.glob("*/chart.json"))
    with Pool(min(8, len(ids))) as pool:
        rows = pool.map(variety, ids)
    failed = 0
    for row in sorted(rows, key=lambda r: -float(r["repeat"])):
        too_much = float(row["repeat"]) >= TOO_REPETITIVE
        failed += too_much
        print(
            f"{'FAIL' if too_much else 'ok  '} {row['id']:40s} repeat {float(row['repeat']):5.0%}"
            f"  longest repeat {row['longest_repeat_s']:6}s  sameness {row['sameness']}"
        )
    print(f"{len(rows)} checked, {failed} repeating too much")
    raise typer.Exit(1 if failed else 0)


if __name__ == "__main__":
    typer.run(main)
