# /// script
# requires-python = ">=3.12"
# dependencies = ["pytest"]
# ///
# Run: uv run --with pytest pytest tools/test_song_table.py

from __future__ import annotations

import json
from pathlib import Path

import pytest

import song_table
from song_table import SongTableError, main, updated_readme

README = """# 제목

## 들어 있는 곡

| 곡 id | 곡 | 난이도 | 빠르기 | 출처 / 라이선스 |
|---|---|---|---|---|
| `slow` | Slow (설명) | Hard | 1 BPM | 누군가, CC0 |
| `gone` | Gone | Easy | 90 BPM | 사라진 곡 |
| `fast` | Fast (손으로 쓴 설명) | Easy | 90 BPM | 만든 이, CC BY 4.0 |

표 아래 글.
"""


def write_chart(songs: Path, song_id: str, **fields: object) -> None:
    folder = songs / song_id
    folder.mkdir(parents=True)
    (folder / "chart.json").write_text(json.dumps({"title": song_id.title(), **fields}), encoding="utf-8")


@pytest.fixture
def songs(tmp_path: Path) -> Path:
    songs = tmp_path / "songs"
    write_chart(songs, "fast", bpm=128.4, difficulty="normal")
    write_chart(songs, "slow", bpm=95.5, difficulty="easy")
    write_chart(songs, "breach", bpm=152, difficulty="normal", artist="LiveCanvas", tempo=[[0, 140], [10, 184.0001], [20, 132]])
    (songs / "index.json").write_text("{}", encoding="utf-8")
    return songs


def table_of(readme: str) -> list[str]:
    lines = readme.split("\n")
    start = lines.index("| 곡 id | 곡 | 난이도 | 빠르기 | 출처 / 라이선스 |")
    return lines[start : start + 2 + 3]


def test_values_come_from_chart_json_and_hand_written_cells_stay(songs: Path) -> None:
    # Given a table whose difficulty and speed cells are stale.
    # When it is rebuilt from the charts.
    readme = updated_readme(README, song_table.read_charts(songs))
    # Then difficulty and speed follow chart.json, the name and credit cells stay, and the order is by difficulty then speed.
    assert table_of(readme)[2:] == [
        "| `slow` | Slow (설명) | Easy | 96 BPM | 누군가, CC0 |",
        "| `fast` | Fast (손으로 쓴 설명) | Normal | 128 BPM | 만든 이, CC BY 4.0 |",
        "| `breach` | Breach | Normal | 152 BPM (구간마다 132~184 BPM) | LiveCanvas |",
    ]


def test_missing_song_is_added_and_removed_song_is_dropped(songs: Path) -> None:
    readme = updated_readme(README, song_table.read_charts(songs))
    assert "`gone`" not in readme
    assert "| `breach` | Breach |" in readme
    # The text around the table is left as it was.
    assert readme.startswith("# 제목\n\n## 들어 있는 곡\n\n")
    assert readme.endswith("\n\n표 아래 글.\n")


def test_rebuilding_twice_changes_nothing(songs: Path) -> None:
    once = updated_readme(README, song_table.read_charts(songs))
    assert updated_readme(once, song_table.read_charts(songs)) == once


@pytest.mark.parametrize(("bpm", "shown"), [(96.5, "97 BPM"), (95.49, "95 BPM"), (183.99, "184 BPM"), (120.02, "120 BPM")])
def test_bpm_is_rounded_half_up(bpm: float, shown: str) -> None:
    chart = song_table.Chart("a", "A", "", "easy", bpm, ())
    assert song_table.speed_of(chart) == shown


def test_one_tempo_section_shows_no_range() -> None:
    chart = song_table.Chart("a", "A", "", "normal", 176, (176.0,))
    assert song_table.speed_of(chart) == "176 BPM"


def test_check_reports_difference_without_writing(songs: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    readme = tmp_path / "README.md"
    readme.write_text(README, encoding="utf-8")
    assert main(["--check", "--readme", str(readme), "--songs", str(songs)]) == 1
    assert readme.read_text(encoding="utf-8") == README
    assert "+| `breach` |" in capsys.readouterr().out
    assert main(["--readme", str(readme), "--songs", str(songs)]) == 0
    assert main(["--check", "--readme", str(readme), "--songs", str(songs)]) == 0


def test_chart_without_difficulty_is_an_error(tmp_path: Path) -> None:
    write_chart(tmp_path, "bad", bpm=100)
    with pytest.raises(SongTableError):
        song_table.read_charts(tmp_path)


def test_readme_without_table_is_an_error() -> None:
    with pytest.raises(SongTableError):
        updated_readme("# 제목\n", [])


def test_repository_readme_matches_every_chart() -> None:
    # The README table lists every song in public/songs with its chart's difficulty and speed.
    assert main(["--check"]) == 0
