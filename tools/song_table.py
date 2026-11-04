#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///

# ─── 쓰는 법 ───
#   uv run tools/song_table.py           README.md 의 '들어 있는 곡' 표를 public/songs/*/chart.json 에 맞춰 고친다
#   uv run tools/song_table.py --check   고치지 않고, 표가 chart.json 과 다르면 다른 줄을 보이고 1 로 끝난다
# 난이도와 빠르기 칸은 chart.json 의 difficulty·bpm(템포 맵이 있으면 그 범위도)에서 만든다. 곡 칸(설명)과
# 출처 칸은 손으로 쓴 것을 그대로 두고, 표에 없던 곡은 chart.json 의 title·artist 로 채운다.
# 폴더가 없어진 곡의 줄은 지운다. 줄 순서는 난이도(Easy, Normal, Hard) 다음 빠르기이고, 같으면 원래 순서를 지킨다.
# 표준 라이브러리만 쓴다.
# ──────────────────

from __future__ import annotations

import argparse
import difflib
import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Final

ROOT: Final = Path(__file__).resolve().parent.parent
README: Final = ROOT / "README.md"
SONGS_DIR: Final = ROOT / "public" / "songs"
HEADING: Final = "## 들어 있는 곡"
HEADER: Final = "| 곡 id | 곡 | 난이도 | 빠르기 | 출처 / 라이선스 |"
DIVIDER: Final = "|---|---|---|---|---|"
DIFFICULTY_ORDER: Final = ("easy", "normal", "hard")


class SongTableError(ValueError):
    """README 에서 곡 표를 찾지 못했거나 chart.json 이 표를 만들 값을 갖고 있지 않다."""


@dataclass(frozen=True)
class Chart:
    id: str
    title: str
    artist: str
    difficulty: str
    bpm: float
    tempo_bpms: tuple[float, ...]


@dataclass(frozen=True)
class Row:
    id: str
    name: str
    credit: str


def round_half_up(value: float) -> int:
    """파이썬 round 는 .5 를 짝수 쪽으로 보내므로, 표에 적을 BPM 은 0.5 를 올려 반올림한다."""
    return math.floor(value + 0.5)


def read_chart(folder: Path) -> Chart:
    data = json.loads((folder / "chart.json").read_text(encoding="utf-8"))
    difficulty = data.get("difficulty")
    bpm = data.get("bpm")
    if difficulty not in DIFFICULTY_ORDER or not isinstance(bpm, int | float) or bpm <= 0:
        raise SongTableError(f"{folder.name}/chart.json 에 difficulty 나 bpm 이 없다")
    tempo = data.get("tempo") or []
    return Chart(
        id=folder.name,
        title=str(data.get("title") or folder.name),
        artist=str(data.get("artist") or ""),
        difficulty=difficulty,
        bpm=float(bpm),
        tempo_bpms=tuple(float(section[1]) for section in tempo),
    )


def read_charts(songs_dir: Path) -> list[Chart]:
    return [read_chart(folder) for folder in sorted(songs_dir.iterdir()) if (folder / "chart.json").is_file()]


def speed_of(chart: Chart) -> str:
    """기본 BPM. 템포 맵 안에서 빠르기가 바뀌면 가장 느린 곳과 빠른 곳을 함께 적는다."""
    text = f"{round_half_up(chart.bpm)} BPM"
    marks = sorted({round_half_up(bpm) for bpm in chart.tempo_bpms})
    if len(marks) > 1:
        text += f" (구간마다 {marks[0]}~{marks[-1]} BPM)"
    return text


def find_table(lines: list[str]) -> tuple[int, int]:
    """표의 첫 줄(머리)과 끝 다음 줄의 번호."""
    try:
        heading = lines.index(HEADING)
        header = lines.index(HEADER, heading)
    except ValueError as error:
        raise SongTableError(f"README 에 '{HEADING}' 아래 곡 표가 없다") from error
    if lines[header + 1 : header + 2] != [DIVIDER]:
        raise SongTableError("곡 표 머리 다음 줄이 구분선이 아니다")
    end = header + 2
    while end < len(lines) and lines[end].startswith("|"):
        end += 1
    return header, end


def parse_row(line: str) -> Row:
    cells = [cell.strip() for cell in line.strip().strip("|").split(" | ")]
    if len(cells) != 5 or not (cells[0].startswith("`") and cells[0].endswith("`")):
        raise SongTableError(f"곡 표 줄을 읽을 수 없다: {line}")
    return Row(id=cells[0].strip("`"), name=cells[1], credit=cells[4])


def table_lines(rows: list[Row], charts: list[Chart]) -> list[str]:
    known = {row.id: (position, row) for position, row in enumerate(rows)}
    ordered = sorted(
        charts,
        key=lambda chart: (
            DIFFICULTY_ORDER.index(chart.difficulty),
            round_half_up(chart.bpm),
            known.get(chart.id, (len(rows), None))[0],
            chart.id,
        ),
    )
    lines = [HEADER, DIVIDER]
    for chart in ordered:
        row = known.get(chart.id, (0, Row(chart.id, chart.title, chart.artist)))[1]
        lines.append(f"| `{chart.id}` | {row.name} | {chart.difficulty.capitalize()} | {speed_of(chart)} | {row.credit} |")
    return lines


def updated_readme(readme: str, charts: list[Chart]) -> str:
    lines = readme.split("\n")
    header, end = find_table(lines)
    rows = [parse_row(line) for line in lines[header + 2 : end]]
    return "\n".join([*lines[:header], *table_lines(rows, charts), *lines[end:]])


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="README 의 곡 표를 chart.json 에 맞춘다.")
    parser.add_argument("--check", action="store_true", help="고치지 않고 다르면 1 로 끝난다")
    parser.add_argument("--readme", type=Path, default=README)
    parser.add_argument("--songs", type=Path, default=SONGS_DIR)
    args = parser.parse_args(argv)
    before = args.readme.read_text(encoding="utf-8")
    after = updated_readme(before, read_charts(args.songs))
    if before == after:
        print("곡 표가 chart.json 과 같다")
        return 0
    if args.check:
        diff = difflib.unified_diff(before.splitlines(), after.splitlines(), "README.md", "chart.json 기준", lineterm="")
        print("\n".join(diff))
        print("곡 표가 chart.json 과 다르다: uv run tools/song_table.py 로 고친다", file=sys.stderr)
        return 1
    args.readme.write_text(after, encoding="utf-8")
    print(f"{args.readme} 의 곡 표를 고쳤다")
    return 0


if __name__ == "__main__":
    sys.exit(main())
