"""Turns the grid steps chosen for one difficulty into playable notes: lanes, holds and chords."""

from __future__ import annotations

from dataclasses import dataclass, replace
from itertools import pairwise
from typing import Final, TypedDict

import numpy as np

LANES: Final = 5
STEPS_PER_BEAT: Final = 4
MAX_SAME_LANE_RUN: Final = 2

MIN_HOLD_S: Final = 0.4
MAX_HOLD_RATIO: Final = 0.15
SUSTAIN_RATIO: Final = 0.5
SUSTAIN_REFERENCE_FRAMES: Final = 8
QUIET_RATIO: Final = 0.5
CHORD_RATIO_BY_DIFFICULTY: Final = {"easy": 0.0, "normal": 0.05, "hard": 0.10}


@dataclass(frozen=True, slots=True)
class Candidate:
    step: int
    time: float
    brightness: float
    accent: float


@dataclass(frozen=True, slots=True)
class Note:
    step: int
    t: float
    lane: int
    accent: float
    end: float | None = None


@dataclass(frozen=True, slots=True)
class Sound:
    """What `add_holds` needs to tell a held sound from silence between two notes."""

    step_times: np.ndarray
    loudness: np.ndarray
    frames_per_second: float


class NoteJson(TypedDict, total=False):
    t: float
    lane: int
    end: float


def assign_lanes(chosen: list[Candidate]) -> list[Note]:
    by_brightness = sorted(range(len(chosen)), key=lambda i: (chosen[i].brightness, chosen[i].step))
    lane_of = {i: min(LANES - 1, rank * LANES // len(chosen)) for rank, i in enumerate(by_brightness)}

    notes: list[Note] = []
    for i, candidate in enumerate(chosen):
        lane = lane_of[i]
        recent = [n.lane for n in notes[-MAX_SAME_LANE_RUN:]]
        if len(recent) == MAX_SAME_LANE_RUN and all(r == lane for r in recent):
            lane = (lane + 1) % LANES
        notes.append(Note(step=candidate.step, t=round(candidate.time, 4), lane=lane, accent=candidate.accent))
    return notes


def add_holds(notes: list[Note], step_divisor: int, sound: Sound) -> list[Note]:
    """Stretch a note across the empty grid slots after it when the music keeps sounding there."""
    quiet = float(np.median(sound.loudness)) * QUIET_RATIO
    hold_end: dict[int, float] = {}
    for i, (note, following) in enumerate(pairwise(notes)):
        if following.step - note.step < 2 * step_divisor:
            continue
        end = float(sound.step_times[following.step - step_divisor])
        if end - note.t < MIN_HOLD_S:
            continue
        start_frame = int(note.t * sound.frames_per_second)
        end_frame = int(end * sound.frames_per_second)
        attack = float(sound.loudness[start_frame : start_frame + SUSTAIN_REFERENCE_FRAMES].max())
        sustained = float(np.median(sound.loudness[start_frame:end_frame]))
        if attack >= quiet and sustained >= SUSTAIN_RATIO * attack:
            hold_end[i] = end

    longest_first = sorted(hold_end, key=lambda i: notes[i].t - hold_end[i])
    kept = set(longest_first[: int(len(notes) * MAX_HOLD_RATIO)])
    return [replace(note, end=round(hold_end[i], 4)) if i in kept else note for i, note in enumerate(notes)]


def add_chords(notes: list[Note], ratio: float) -> list[Note]:
    """Turn the most accented on-beat taps into a mirrored two-lane chord."""
    eligible = [i for i, note in enumerate(notes) if note.end is None and note.step % STEPS_PER_BEAT == 0]
    strongest = set(sorted(eligible, key=lambda i: (-notes[i].accent, notes[i].step))[: int(len(notes) * ratio)])

    center = (LANES - 1) // 2
    with_chords: list[Note] = []
    for i, note in enumerate(notes):
        if i not in strongest:
            with_chords.append(note)
            continue
        left = min(note.lane, LANES - 1 - note.lane)
        if left == center:
            left = center - 1
        with_chords += [replace(note, lane=left), replace(note, lane=LANES - 1 - left)]
    return with_chords


def to_json(notes: list[Note]) -> list[NoteJson]:
    out: list[NoteJson] = []
    for note in notes:
        item: NoteJson = {"t": note.t, "lane": note.lane}
        if note.end is not None:
            item["end"] = note.end
        out.append(item)
    return out
