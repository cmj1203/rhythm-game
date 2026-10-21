# /// script
# requires-python = ">=3.12"
# dependencies = ["pytest"]
# ///
# Run: uv run --with pytest pytest tools/test_road_tempo.py

import pytest

from road_tempo import InvalidRoadBeatsError, tempo_from_beats


def test_tempo_changes_when_known_beat_length_changes() -> None:
    # Given exact beats in 120, 150, then 100 BPM sections.
    beats = [0.1, 0.6, 1.1, 1.5, 1.9, 2.5, 3.1]
    # When equal beat lengths are grouped.
    tempo = tempo_from_beats(beats)
    # Then changes start on the shared boundary beat.
    assert tempo == [(0.0, 120.0), (1.1, 150.0), (1.9, 100.0)]


def test_rounding_noise_does_not_make_tempo_marks() -> None:
    # Given composer beats rounded to four decimals.
    beats = [0.0232, 0.3493, 0.6754, 1.0015, 1.3275]
    # When a map is derived.
    tempo = tempo_from_beats(beats)
    # Then the rounding error stays within one section.
    assert len(tempo) == 1
    assert tempo[0][1] == pytest.approx(184, abs=0.02)


def test_gaps_exactly_one_tolerance_apart_stay_one_section() -> None:
    # Given rounded beats whose gaps differ by 0.0002 s, which float subtraction puts just past it.
    beats = [0.0004, 0.3265, 0.6528]
    # When a map is derived.
    tempo = tempo_from_beats(beats)
    # Then no false tempo change is made.
    assert len(tempo) == 1


@pytest.mark.parametrize("beats", [[], [0.0], [0.0, 0.0], [1.0, 0.5], [-0.1, 0.5], [0.0, float("nan")]])
def test_invalid_beats_fail_at_the_boundary(beats: list[float]) -> None:
    # Given unusable beat input.
    # When the tempo map is requested.
    # Then no invalid map reaches the chart.
    with pytest.raises(InvalidRoadBeatsError):
        tempo_from_beats(beats)
