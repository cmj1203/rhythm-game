"""Tempo sections from exact (rounded to 0.1 ms) composer beats."""

from collections.abc import Sequence
from math import isfinite
from typing import Final

PERIOD_TOLERANCE_S: Final = 0.0002
# Gaps of rounded beats can differ by exactly the tolerance; float subtraction may land just past it.
FLOAT_SLACK_S: Final = 1e-9


class InvalidRoadBeatsError(ValueError):
    """Known beats must be finite, nonnegative and strictly increasing."""

    def __init__(self, index: int) -> None:
        self.index = index
        super().__init__(f"invalid known beat at index {index}")


def tempo_from_beats(beats: Sequence[float]) -> list[tuple[float, float]]:
    """Group equal beat lengths, averaging away the beat file's rounding error."""
    if len(beats) < 2:
        raise InvalidRoadBeatsError(len(beats))
    for index, beat in enumerate(beats):
        if not isfinite(beat) or beat < 0 or (index > 0 and beat <= beats[index - 1]):
            raise InvalidRoadBeatsError(index)
    sections: list[tuple[float, float]] = []
    start = 0
    period = beats[1] - beats[0]

    def finish(end: int) -> None:
        """Append the completed run using its mean beat period."""
        bpm = round(60 * (end - start) / (beats[end] - beats[start]), 4)
        sections.append((0.0 if start == 0 else beats[start], bpm))

    for index in range(1, len(beats)):
        gap = beats[index] - beats[index - 1]
        if abs(gap - period) <= PERIOD_TOLERANCE_S + FLOAT_SLACK_S:
            continue
        finish(index - 1)
        start = index - 1
        period = gap
    finish(len(beats) - 1)
    return sections
