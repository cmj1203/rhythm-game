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
#   uv run tools/check_timing.py                     every song in public/songs
#   uv run tools/check_timing.py circles lagoa-v2    only these songs
#   uv run tools/check_timing.py --mp3 new.mp3 --difficulty normal
#        a song not in the game yet: charts it in memory as tools/make_chart.py would, and checks that chart
# A chart passes when at least 80% of its notes land within 25 ms of a hit in the music, and no note comes after
# the music has ended. Exits with 1 when any chart fails.
# ──────────────────

from __future__ import annotations

import json
import sys
from multiprocessing import Pool
from pathlib import Path
from typing import Final

import librosa
import numpy as np
import typer

sys.path.insert(0, str(Path(__file__).parent))
import make_chart as mc  # noqa: E402

SONGS_DIR: Final = Path(__file__).parent.parent / "public" / "songs"
ON_TIME_S: Final = 0.025
ENOUGH_ON_TIME: Final = 0.8
# A note's hit is the strongest moment of the percussive envelope within this many frames either side.
SEARCH_FRAMES: Final = 6


def timing(samples: np.ndarray, notes: list[float], bpm: float, offset: float) -> dict[str, float]:
    """How many of `notes` land on a hit, on the beat and off it, and how many come after the music ends."""
    envelope = librosa.onset.onset_strength(y=librosa.effects.percussive(samples), sr=mc.SAMPLE_RATE, hop_length=mc.HOP)
    times = np.asarray(notes)
    phase = ((times - offset) * bpm / 60) % 1
    off_beat = np.abs(phase - np.round(phase)) > mc.OFF_BEAT_TOLERANCE
    misses = []
    for time in times:
        frame = int(round(time * mc.SAMPLE_RATE / mc.HOP))
        low, high = max(0, frame - SEARCH_FRAMES), min(len(envelope), frame + SEARCH_FRAMES + 1)
        misses.append((low + int(envelope[low:high].argmax()) - frame) * mc.HOP / mc.SAMPLE_RATE)
    on_time = np.abs(np.asarray(misses)) <= ON_TIME_S
    return {
        "on_time": float(on_time.mean()),
        "on_beat": float(on_time[~off_beat].mean()) if (~off_beat).any() else 1.0,
        "off_beat": float(on_time[off_beat].mean()) if off_beat.any() else 1.0,
        "after_end": int(np.sum(times > mc.music_end(samples))),
        "unheard_lead_in": len(mc.unheard_lead_in(samples, notes)),
    }


def check_song(song_id: str) -> tuple[str, dict[str, float]]:
    chart = json.loads((SONGS_DIR / song_id / "chart.json").read_text(encoding="utf-8"))
    samples, _ = librosa.load(SONGS_DIR / song_id / chart["audio"], sr=mc.SAMPLE_RATE, mono=True)
    return song_id, timing(samples, chart["notes"], chart["bpm"], chart["offset"])


def check_mp3(audio: Path, difficulty: mc.Level | None) -> tuple[str, dict[str, float]]:
    samples, _ = librosa.load(audio, sr=mc.SAMPLE_RATE, mono=True)
    percussive = librosa.effects.percussive(samples)
    envelope = librosa.onset.onset_strength(y=percussive, sr=mc.SAMPLE_RATE, hop_length=mc.HOP)
    grid = mc.build_grid(samples, percussive, envelope)
    accent = mc.step_accents(envelope, librosa.time_to_frames(grid.step_times, sr=mc.SAMPLE_RATE, hop_length=mc.HOP))
    end = mc.music_end(samples)
    notes = mc.chart_notes(grid, envelope, accent, difficulty or mc.level_for(grid.bpm), end)
    unheard = set(mc.unheard_lead_in(samples, notes))
    notes = [time for time in notes if time not in unheard]
    result = timing(samples, notes, grid.bpm, float(grid.step_times[0]))
    listed = difficulty or mc.rated_level(notes, grid.bpm, float(grid.step_times[0]))
    return f"{audio} ({listed.value}, {grid.bpm:.1f} BPM, {len(notes)} notes)", result


def main(
    songs: list[str] | None = typer.Argument(None, help="song ids; every song when left out"),
    mp3: Path | None = typer.Option(None, help="check an mp3 that is not in the game yet"),
    difficulty: mc.Level | None = typer.Option(None, help="with --mp3: the difficulty to chart it at"),
) -> None:
    if mp3 is not None:
        results = [check_mp3(mp3, difficulty)]
    else:
        ids = songs or sorted(path.parent.name for path in SONGS_DIR.glob("*/chart.json"))
        with Pool(min(8, len(ids))) as pool:
            results = pool.map(check_song, ids)
    failed = 0
    for name, result in results:
        passes = result["on_time"] >= ENOUGH_ON_TIME and result["after_end"] == 0 and result["unheard_lead_in"] == 0
        failed += not passes
        print(
            f"{'ok  ' if passes else 'FAIL'} {name}: {result['on_time']:.0%} on time "
            f"(on the beat {result['on_beat']:.0%}, off it {result['off_beat']:.0%}), "
            f"{result['after_end']} after the end, {result['unheard_lead_in']} unheard before the music starts"
        )
    print(f"{len(results)} checked, {failed} failing")
    raise typer.Exit(1 if failed else 0)


if __name__ == "__main__":
    typer.run(main)
