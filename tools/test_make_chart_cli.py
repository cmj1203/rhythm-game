# /// script
# requires-python = ">=3.12"
# dependencies = ["pytest"]
# ///
# Run: uv run --with pytest pytest tools
# 큰 분석 의존성(beat-this, librosa, scipy, numpy, typer, rich)이 없어도 돈다. 없는 모듈은 tools/conftest.py 가
# 가짜로 채우고, 소리 분석 함수는 이 파일이 monkeypatch 로 가짜를 끼운다. 진짜 numpy 로도 같은지 보려면
# uv run --with pytest --with numpy pytest tools

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

import make_chart
from make_chart import BeatGrid, Level, Road, level_for, rated_level

# 아래 노트 배치는 1분에 60박(bpm 60), offset 0 에서 2진 소수로 정확히 나타나는 시각만 쓴다.
# 그래야 부하(load)가 경계값과 정확히 같아져 '<' 와 '<=' 의 차이를 시험할 수 있다.
BPM = 60.0
OFFSET = 0.0
# 한 박 안에서 이만큼 옮기면 박 위(OFF_BEAT_TOLERANCE 0.1 안)에 남는다. 마지막 노트를 늦춰 길이만 조금 늘릴 때 쓴다.
NUDGE = 1 / 128

# 4박 길이(3초)에 박 위 4개 + 반 박 3개: 분당 140개 x (1 + 3/7) = 정확히 200.
LOAD_200 = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0]
# 2초에 7개(분당 210) x 박 밖 2/7 → 1 + 2/7, 빠른 간격 4/6 → 1 + 0.5 x 4/6: 정확히 360.
# 0.0625 는 박 위(0.1 안)이면서 앞 노트와 0.0625 초, 0.875 는 박 밖이면서 다음 노트와 0.125 초.
LOAD_360 = [0.0, 0.0625, 0.875, 1.0, 1.0625, 1.875, 2.0]


def later_end(notes: list[float]) -> list[float]:
    """마지막 노트만 NUDGE 늦춘다. 노트 수·박 밖·빠른 간격 수는 그대로이고 길이만 늘어 부하가 조금 준다."""
    return [*notes[:-1], notes[-1] + NUDGE]


# ─── 채보 생성 규칙의 경계 ───


def test_rule_constants_are_the_documented_values() -> None:
    # Given/When make_chart 의 규칙 값. Then 아래 경계 시험이 가정하는 값과 같다(바뀌면 배치도 다시 계산해야 한다).
    assert (make_chart.EASY_BELOW_LOAD, make_chart.HARD_FROM_LOAD) == (200, 360)
    assert (make_chart.QUICK_WEIGHT, make_chart.QUICK_GAP_S) == (0.5, 0.25)
    assert make_chart.OFF_BEAT_TOLERANCE == 0.1


def test_load_exactly_easy_below_load_is_normal() -> None:
    # Given 부하가 정확히 EASY_BELOW_LOAD(200)인 채보. When 등급을 매기면 Then EASY 가 아니다(200 미만만 EASY).
    assert rated_level(LOAD_200, BPM, OFFSET) is Level.NORMAL


def test_load_just_below_easy_below_load_is_easy() -> None:
    # Given 같은 채보의 끝만 늦춰 부하가 200 바로 아래(약 199.5)인 채보. Then EASY.
    assert rated_level(later_end(LOAD_200), BPM, OFFSET) is Level.EASY


def test_load_exactly_hard_from_load_is_hard() -> None:
    # Given 부하가 정확히 HARD_FROM_LOAD(360)인 채보. Then HARD(360 이상이 HARD).
    assert rated_level(LOAD_360, BPM, OFFSET) is Level.HARD


def test_load_just_below_hard_from_load_is_normal() -> None:
    # Given 끝만 늦춰 부하가 360 바로 아래(약 358.6)인 채보. 마지막 간격은 0.133 초로 여전히 빠르다.
    notes = later_end(LOAD_360)
    assert notes[-1] - notes[-2] < make_chart.QUICK_GAP_S
    # Then NORMAL.
    assert rated_level(notes, BPM, OFFSET) is Level.NORMAL


@pytest.mark.parametrize(
    ("partner", "expected"),
    [
        # 간격이 정확히 QUICK_GAP_S 이면 빠른 간격이 아니다: 분당 135 x (1 + 4/9) = 195 → EASY.
        (0.25, Level.EASY),
        # 그보다 1/128 초 짧으면 빠른 간격이다: 195 x (1 + 0.5 x 4/8) = 243.75 → NORMAL.
        (0.25 - NUDGE, Level.NORMAL),
    ],
)
def test_quick_gap_boundary(partner: float, expected: Level) -> None:
    # Given 박 0~4 와, 앞 네 박마다 박 밖(위상 0.24~0.25) 노트 하나씩. 박 밖 수는 두 경우 같다.
    notes = sorted([0.0, 1.0, 2.0, 3.0, 4.0] + [beat + partner for beat in (0.0, 1.0, 2.0, 3.0)])
    # When 등급을 매기면 Then 간격이 QUICK_GAP_S 보다 짧을 때만 빠른 간격으로 세어 등급이 오른다.
    assert rated_level(notes, BPM, OFFSET) is expected


def test_quick_weight_scales_the_quick_share(monkeypatch: pytest.MonkeyPatch) -> None:
    # Given 정확히 360 인 채보: 빠른 간격 몫 2/3 에 QUICK_WEIGHT 0.5 가 곱해져 270 x 4/3 = 360 이 된다.
    assert rated_level(LOAD_360, BPM, OFFSET) is Level.HARD
    # When QUICK_WEIGHT 가 0.49 이면 Then 270 x (1 + 0.49 x 2/3) = 358.2 로 360 아래가 되어 NORMAL.
    # (0.5 바로 아래 float 는 곱셈 반올림에 묻혀 360 이 그대로 나와 쓰지 않는다.)
    monkeypatch.setattr(make_chart, "QUICK_WEIGHT", 0.49)
    assert rated_level(LOAD_360, BPM, OFFSET) is Level.NORMAL
    # When 빠른 간격을 전혀 세지 않으면(가중 0) Then 270 → NORMAL.
    monkeypatch.setattr(make_chart, "QUICK_WEIGHT", 0.0)
    assert rated_level(LOAD_360, BPM, OFFSET) is Level.NORMAL


def test_single_note_has_no_gaps_and_short_charts_count_one_minute_span() -> None:
    # Given 노트 하나(간격 없음). When 등급을 매기면 Then 길이를 1초로 보아 분당 60 → EASY, 0 으로 나누지 않는다.
    assert rated_level([5.0], BPM, OFFSET) is Level.EASY
    # Given 1초 안에 박 위 노트 4개(0.25 초 간격, 빠르지 않음). Then 분당 4 x 60 = 240 → NORMAL.
    assert rated_level([0.0, 0.25, 0.5, 0.75], 240.0, OFFSET) is Level.NORMAL


@pytest.mark.parametrize(
    ("bpm", "expected"),
    [
        (math.nextafter(105.0, 0.0), Level.EASY),
        (105.0, Level.NORMAL),
        (math.nextafter(125.0, 0.0), Level.NORMAL),
        (125.0, Level.HARD),
    ],
)
def test_level_for_tempo_boundaries(bpm: float, expected: Level) -> None:
    # Given 템포 경계 EASY_BELOW_BPM(105), HARD_FROM_BPM(125)와 그 바로 아래. Then 경계값은 위 등급에 든다.
    assert level_for(bpm) is expected


# ─── CLI: 소리 분석 함수를 가짜로 바꿔 끼운다 ───


def forbid_audio_work(monkeypatch: pytest.MonkeyPatch) -> None:
    def unexpected_work(*args: object, **kwargs: object) -> None:
        pytest.fail("audio/model work started")

    monkeypatch.setattr(make_chart.librosa, "load", unexpected_work)
    monkeypatch.setattr(make_chart, "Audio2Beats", unexpected_work)


def fake_analysis(monkeypatch: pytest.MonkeyPatch, notes: list[float], *, run_notes: list[float] | None = None) -> None:
    """소리를 읽고 분석하는 함수를 모두 가짜로 바꾼다. 채보 노트는 `notes`(keep_runs 이면 `run_notes`)로 정한다."""
    duration_s = 10.0
    samples = [0.0] * int(duration_s * make_chart.SAMPLE_RATE)
    step_times = [i * 0.25 for i in range(int(duration_s / 0.25) + 1)]
    monkeypatch.setattr(make_chart.librosa, "load", lambda audio, sr, mono: (samples, sr))
    monkeypatch.setattr(make_chart.librosa.effects, "percussive", lambda y: y)
    monkeypatch.setattr(make_chart.librosa.onset, "onset_strength", lambda y, sr, hop_length: [0.0])
    monkeypatch.setattr(make_chart.librosa, "time_to_frames", lambda times, sr, hop_length: list(times))
    monkeypatch.setattr(
        make_chart, "chart_grid", lambda *args: BeatGrid(bpm=BPM, is_steady=True, step_times=step_times)
    )
    monkeypatch.setattr(make_chart, "step_accents", lambda *args: [])
    monkeypatch.setattr(make_chart, "music_end", lambda samples: duration_s)
    monkeypatch.setattr(
        make_chart,
        "chart_notes",
        lambda grid, envelope, accent, level, end, *, keep_runs=False: list(run_notes if keep_runs else notes),
    )
    monkeypatch.setattr(make_chart, "unheard_lead_in", lambda samples, charted: [])
    monkeypatch.setattr(make_chart, "attack_anchors", lambda samples: [0.0])
    monkeypatch.setattr(make_chart, "Audio2Beats", lambda *args, **kwargs: pytest.fail("beat model started"))


def song_dir(tmp_path: Path) -> Path:
    directory = tmp_path / "song"
    directory.mkdir()
    return directory


def test_rhythm_road_without_beats_stops_before_audio_work(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # Given a rhythm road without exact beats, and audio/model work forbidden.
    forbid_audio_work(monkeypatch)
    directory = song_dir(tmp_path)
    # When the CLI receives the unsupported combination.
    with pytest.raises(make_chart.typer.Exit) as stopped:
        make_chart.main(directory / "song.mp3", road=Road.RHYTHM)
    # Then it rejects the arguments with exit code 2 without writing a chart or song index.
    assert stopped.value.exit_code == 2
    assert list(directory.iterdir()) == []
    assert not (tmp_path / "index.json").exists()


@pytest.mark.parametrize(
    ("notes", "listed"),
    [(LOAD_200, "normal"), (later_end(LOAD_200), "easy"), (LOAD_360, "hard"), (later_end(LOAD_360), "normal")],
)
def test_cli_lists_chart_under_rated_level(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, notes: list[float], listed: str
) -> None:
    # Given 분석이 경계 부하의 노트를 내는 곡.
    fake_analysis(monkeypatch, notes)
    directory = song_dir(tmp_path)
    # When CLI 가 채보를 쓰면
    make_chart.main(directory / "song.mp3", title="Boundary")
    # Then chart.json 의 difficulty 는 rated_level 경계를 따르고, 곡 목록도 같은 값으로 갱신된다.
    chart = json.loads((directory / "chart.json").read_text(encoding="utf-8"))
    assert chart["difficulty"] == listed
    assert chart["notes"] == notes
    assert (chart["bpm"], chart["offset"], chart["duration"]) == (60.0, 0.0, 10.0)
    index = json.loads((tmp_path / "index.json").read_text(encoding="utf-8"))
    assert index["songs"] == [
        {"id": "song", "title": "Boundary", "bpm": 60.0, "duration": 10.0, "difficulty": listed, "notes": len(notes)}
    ]


def test_cli_difficulty_option_overrides_rated_level(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # Given 부하로는 HARD 인 노트. When --difficulty easy 를 주면 Then 목록 등급은 easy.
    fake_analysis(monkeypatch, LOAD_360)
    directory = song_dir(tmp_path)
    make_chart.main(directory / "song.mp3", difficulty=Level.EASY)
    assert json.loads((directory / "chart.json").read_text(encoding="utf-8"))["difficulty"] == "easy"


@pytest.mark.parametrize(
    ("previous_count", "mode"),
    [
        # 엄격한 채보 24개가 이전 25개의 0.96 과 같으면 엄격한 채보를 쓴다.
        (25, "strict"),
        # 이전이 26개면 24 < 0.96 x 26 = 24.96 이라 빠른 묶음을 남긴 채보로 바꾼다.
        (26, "run_exempt"),
    ],
)
def test_cli_keeps_runs_when_strict_spacing_drops_too_many_notes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, previous_count: int, mode: str
) -> None:
    # Given 이전 채보와, 엄격한 간격(24개)·묶음 유지(25개) 두 가지 노트를 내는 분석.
    strict = [float(i) * 0.375 for i in range(24)]
    runs = sorted([*strict, 0.0625])
    fake_analysis(monkeypatch, strict, run_notes=runs)
    directory = song_dir(tmp_path)
    previous = {"notes": [float(i) for i in range(previous_count)]}
    (directory / "chart.json").write_text(json.dumps(previous), encoding="utf-8")
    # When CLI 가 채보를 다시 쓰면
    make_chart.main(directory / "song.mp3")
    # Then MIN_KEPT_SHARE 경계에 따라 고른 노트가 쓰인다.
    assert make_chart.MIN_KEPT_SHARE == 0.96
    notes = json.loads((directory / "chart.json").read_text(encoding="utf-8"))["notes"]
    assert notes == (strict if mode == "strict" else runs)


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
