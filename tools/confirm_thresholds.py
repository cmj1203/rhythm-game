#!/usr/bin/env -S uv run --script
# /// script
# requires-python = "==3.12.*"
# dependencies = [
#     "typer==0.27.3",
# ]
# ///

# ─── How to run ───
#   uv run tools/confirm_thresholds.py livecanvas-playlog.json [more exports...]
#       reads screening/results.json (uv run tools/screen_songs.py) and screening/decisions.json when it exists,
#       writes screening/thresholds.md
#   uv run tools/confirm_thresholds.py --self-test      synthetic results and plays made in memory
# Compares the player's misses on songs the screening flagged with songs it did not, per flag code and per
# difficulty (hard charts miss more, so difficulties are never pooled). A threshold is `confirmed` only when both
# sides have >= 10 plays on that difficulty and the flagged side misses more; else `unvalidated`. Everything is
# fitted to 1 player. It only reports: thresholds in tools/screen/ and screening/results.json are never edited.
# ──────────────────

from __future__ import annotations

import json
import sys
import tempfile
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from statistics import mean, median
from typing import Any, Final

import typer

REPO: Final = Path(__file__).resolve().parent.parent
SCREENING_DIR: Final = REPO / "screening"
DIFFICULTIES: Final = ("easy", "normal", "hard")  # = src/chart.ts DIFFICULTIES
FLAG_BUCKETS: Final = ("fail", "flag")  # ear checks and hard failures; the other buckets never flag a song
MIN_PLAYS: Final = 10
FITTED: Final = "fitted to 1 player"
COUNTS: Final = ("notes", "perfect", "great", "good", "missPressed", "missUnpressed")


@dataclass(frozen=True, slots=True)
class Play:
    song_id: str
    difficulty: str
    notes: int
    miss: int

    @property
    def miss_rate(self) -> float:
        return self.miss / self.notes


def play_of(entry: Any) -> Play | None:
    """One exported playlog entry (src/playlog.ts playSchema) as a Play; None when it does not read as one."""
    if not isinstance(entry, dict):
        return None
    if not isinstance(entry.get("songId"), str) or not entry["songId"] or entry.get("difficulty") not in DIFFICULTIES:
        return None
    if not all(type(entry.get(name)) is int and entry[name] >= 0 for name in COUNTS):
        return None
    if entry["notes"] == 0 or entry["missPressed"] + entry["missUnpressed"] > entry["notes"]:
        return None
    return Play(entry["songId"], entry["difficulty"], entry["notes"], entry["missPressed"] + entry["missUnpressed"])


def load_plays(paths: list[Path]) -> tuple[list[Play], list[str]]:
    """Plays from every export, and Korean problem lines.

    Two exports from one browser repeat the older plays, so an identical entry counts as many times as the file
    holding it most often does, not once per file.
    """
    most: Counter[str] = Counter()
    problems: list[str] = []
    for path in paths:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, UnicodeDecodeError) as error:
            problems.append(f"{path.name} 을 읽지 못해 건너뜀: {error}")
            continue
        if not isinstance(data, list):
            problems.append(f"{path.name} 은 플레이 기록 목록(JSON 배열)이 아니라 건너뜀")
            continue
        here = Counter(json.dumps(entry, sort_keys=True) for entry in data)
        bad = sum(count for key, count in here.items() if play_of(json.loads(key)) is None)
        if bad:
            problems.append(f"{path.name}: 읽을 수 없는 기록 {bad}개를 건너뜀")
        most |= here
    plays = [play for key, count in sorted(most.items()) if (play := play_of(json.loads(key))) for _ in range(count)]
    return plays, problems


def flagged_codes(results: list[dict[str, Any]]) -> tuple[dict[str, set[str]], list[str]]:
    """Codes each song was flagged for, and every code the screening knows (thresholds plus any flagged code)."""
    flags = {
        result["id"]: {item["code"] for bucket in FLAG_BUCKETS for item in result.get(bucket, [])}
        for result in results
    }
    codes = {code for result in results for code in result.get("thresholds", {})}
    codes |= {code for song in flags.values() for code in song}
    return flags, sorted(codes)


def load_keeps(path: Path) -> tuple[dict[str, bool], list[str]]:
    """keep per id from the owner's decisions.json; unreadable entries are reported and skipped."""
    if not path.is_file():
        return {}, []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        return {}, [f"{path.name} 을 읽지 못해 남김/뺌 없이 만듦: {error}"]
    if not isinstance(data, dict):
        return {}, [f"{path.name} 은 {{곡 id: {{keep: true|false}}}} 형식이어야 함; 남김/뺌 없이 만듦"]
    keeps = {
        song_id: entry["keep"]
        for song_id, entry in data.items()
        if isinstance(entry, dict) and isinstance(entry.get("keep"), bool)
    }
    skipped = sorted(set(data) - set(keeps))
    return keeps, [f"{path.name} 의 {song_id}: keep 이 true/false 가 아니라 건너뜀" for song_id in skipped]


def percent(value: float) -> str:
    return f"{value * 100:+.1f}%p"


def side_line(name: str, plays: list[tuple[Play, float]]) -> str:
    songs = len({play.song_id for play, _ in plays})
    if not plays:
        return f"{name}: 0곡, 0판"
    return f"{name}: {songs}곡, {len(plays)}판, 중앙값 대비 놓침 평균 {percent(mean(rel for _, rel in plays))}"


def song_rows(plays: list[tuple[Play, float]], flags: dict[str, set[str]], code: str) -> list[str]:
    by_song: dict[str, list[tuple[Play, float]]] = {}
    for play, rel in plays:
        by_song.setdefault(play.song_id, []).append((play, rel))
    rows = []
    for song_id, song in sorted(by_song.items()):
        rows.append(
            f"| {song_id} | {'경고' if code in flags[song_id] else '-'} | {len(song)} | "
            f"{mean(play.miss_rate for play, _ in song) * 100:.1f}% | {percent(mean(rel for _, rel in song))} |"
        )
    return rows


def agreement(code: str, flags: dict[str, set[str]], keeps: dict[str, bool]) -> str:
    """How the owner's keep/drop after listening matches this code: a flag agrees with drop, no flag with keep."""
    decided = sorted(song_id for song_id in keeps if song_id in flags)
    if not decided:
        return "주인 판단(decisions.json): 없음"
    agree = sum((code in flags[song_id]) != keeps[song_id] for song_id in decided)
    flagged_drop = sum(code in flags[s] and not keeps[s] for s in decided)
    flagged_keep = sum(code in flags[s] and keeps[s] for s in decided)
    plain_drop = sum(code not in flags[s] and not keeps[s] for s in decided)
    plain_keep = sum(code not in flags[s] and keeps[s] for s in decided)
    return (
        f"주인 판단(decisions.json): {len(decided)}곡 중 {agree}곡 일치 "
        f"(경고 곡 뺌 {flagged_drop} / 남김 {flagged_keep}, 경고 없는 곡 뺌 {plain_drop} / 남김 {plain_keep})"
    )


def report(
    results: list[dict[str, Any]], plays: list[Play], keeps: dict[str, bool], problems: list[str]
) -> tuple[str, dict[tuple[str, str], str]]:
    """thresholds.md text, and the status per (code, difficulty)."""
    flags, codes = flagged_codes(results)
    unknown = sorted({play.song_id for play in plays if play.song_id not in flags})
    known = [play for play in plays if play.song_id in flags]
    lines = [
        "# 문턱 확인",
        "",
        f"모든 결과는 {FITTED} (한 사람의 플레이 기록으로만 맞춤). 문턱 값은 이 파일이 바꾸지 않는다.",
        "",
        f"- 기록 {len(plays)}판, 검사 결과가 있는 곡의 기록 {len(known)}판",
        "- 놓침률 = (빗나가게 누름 + 안 누르고 지나감) / 노트 수, 난이도마다 그 난이도 전체 판의 중앙값을 뺀 값으로 비교",
        (
            f"- `confirmed`: 한 난이도에서 경고 곡과 경고 없는 곡이 각각 {MIN_PLAYS}판 이상이고 경고 곡의 놓침이 더 높음. "
            "그 밖에는 `unvalidated`"
        ),
    ]
    if unknown:
        lines.append(f"- 검사 결과(results.json)에 없는 곡이라 뺌: {', '.join(unknown)}")
    lines += [f"- {problem}" for problem in problems]
    statuses: dict[tuple[str, str], str] = {}
    for code in codes:
        lines += ["", f"## {code}", "", agreement(code, flags, keeps)]
        for difficulty in DIFFICULTIES:
            here = [play for play in known if play.difficulty == difficulty]
            if not here:
                statuses[(code, difficulty)] = "unvalidated"
                lines += ["", f"### {difficulty}: `unvalidated` ({FITTED})", "", "기록 없음"]
                continue
            middle = median(play.miss_rate for play in here)
            relative = [(play, play.miss_rate - middle) for play in here]
            flagged = [(play, rel) for play, rel in relative if code in flags[play.song_id]]
            plain = [(play, rel) for play, rel in relative if code not in flags[play.song_id]]
            enough = len(flagged) >= MIN_PLAYS and len(plain) >= MIN_PLAYS
            higher = bool(flagged and plain) and mean(r for _, r in flagged) > mean(r for _, r in plain)
            status = "confirmed" if enough and higher else "unvalidated"
            statuses[(code, difficulty)] = status
            lines += [
                "",
                f"### {difficulty}: `{status}` ({FITTED})",
                "",
                f"- 이 난이도 놓침률 중앙값 {middle * 100:.1f}%",
                f"- {side_line('경고 곡', flagged)}",
                f"- {side_line('경고 없는 곡', plain)}",
                "",
                "| 곡 | 이 경고 | 판 | 놓침률 | 중앙값 대비 |",
                "|---|---|---|---|---|",
                *song_rows(relative, flags, code),
            ]
    return "\n".join(lines) + "\n", statuses


def run(results_path: Path, playlogs: list[Path], decisions: Path, out: Path) -> dict[tuple[str, str], str]:
    results = json.loads(results_path.read_text(encoding="utf-8"))
    plays, problems = load_plays(playlogs)
    keeps, keep_problems = load_keeps(decisions)
    text, statuses = report(results, plays, keeps, problems + keep_problems)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    return statuses


# ─── self-test: synthetic results and plays written to a temp folder; nothing is played ───


def synthetic_result(song_id: str, flagged: bool) -> dict[str, Any]:
    flag = [{"code": "beat_clarity", "ko": "박이 흐림", "note": "", "value": 0.2, "threshold": 0.5}] if flagged else []
    return {
        "id": song_id,
        "verdict": "flag" if flagged else "ok",
        "fail": [],
        "flag": flag,
        "policy": [{"code": "repeat", "ko": "반복 구간 비율", "note": "", "value": 0.1, "threshold": 0.5}],
        "thresholds": {"beat_clarity": {"value": 0.5, "status": "proposed"}, "repeat": {"value": 0.5, "status": "proposed"}},
    }


def synthetic_play(song_id: str, difficulty: str, miss: int, n: int) -> dict[str, Any]:
    return {
        "songId": song_id,
        "day": f"2026-10-{1 + n % 28:02d}",
        "difficulty": difficulty,
        "notes": 200,
        "perfect": 150 - miss,
        "great": 40,
        "good": 10,
        "missPressed": miss // 2,
        "missUnpressed": miss - miss // 2,
        "maxStrain": 4.0,
        "gameOver": False,
        "lagMs": 0,
    }


def self_test_case(folder: Path, per_song: int, flagged_miss: int) -> dict[tuple[str, str], str]:
    """4 flagged and 4 plain songs on normal with `per_song` plays each; flagged songs miss `flagged_miss` of 200."""
    songs = {f"flagged-{i}": True for i in range(4)} | {f"plain-{i}": False for i in range(4)}
    (folder / "results.json").write_text(json.dumps([synthetic_result(s, f) for s, f in songs.items()]))
    plays = [
        synthetic_play(song_id, "normal", flagged_miss if flagged else 10 + n % 3, n)
        for song_id, flagged in songs.items()
        for n in range(per_song)
    ]
    half = len(plays) // 2
    (folder / "a.json").write_text(json.dumps(plays[: half + 3]))  # overlapping exports must not double count
    (folder / "b.json").write_text(json.dumps(plays[half - 3 :] + [{"songId": "", "notes": "x"}]))
    (folder / "decisions.json").write_text(json.dumps({"flagged-0": {"listened": True, "keep": False}}))
    return run(folder / "results.json", [folder / "a.json", folder / "b.json"], folder / "decisions.json", folder / "t.md")


def self_test() -> int:
    checks: list[tuple[str, bool]] = []
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        statuses = self_test_case(folder, per_song=3, flagged_miss=40)  # 12 plays a side, flagged miss more
        text = (folder / "t.md").read_text(encoding="utf-8")
        checks += [
            ("flagged misses more, 12 plays a side -> confirmed", statuses[("beat_clarity", "normal")] == "confirmed"),
            ("no plays on hard -> unvalidated", statuses[("beat_clarity", "hard")] == "unvalidated"),
            ("no song flagged for repeat -> unvalidated", statuses[("repeat", "normal")] == "unvalidated"),
            ("overlapping exports counted once: 24 plays", "기록 24판" in text),
            ("malformed entry reported", "읽을 수 없는 기록 1개" in text),
            ("owner decision compared", "1곡 중 1곡 일치" in text),
            ("labelled fitted to 1 player", FITTED in text),
        ]
        statuses = self_test_case(folder, per_song=2, flagged_miss=40)  # 8 plays a side
        checks.append(("fewer than 10 plays a side -> unvalidated", statuses[("beat_clarity", "normal")] == "unvalidated"))
        statuses = self_test_case(folder, per_song=3, flagged_miss=5)  # enough plays, flagged songs miss less
        checks.append(("flagged misses less -> unvalidated", statuses[("beat_clarity", "normal")] == "unvalidated"))
    for name, passed in checks:
        print(f"{'PASS' if passed else 'FAIL'} {name}")
    return 0 if all(passed for _, passed in checks) else 1


def main(
    playlogs: list[Path] | None = typer.Argument(None, help="exported livecanvas-playlog.json files"),
    results: Path = typer.Option(SCREENING_DIR / "results.json", "--results", help="uv run tools/screen_songs.py output"),
    decisions: Path = typer.Option(SCREENING_DIR / "decisions.json", "--decisions", help="owner's keep/drop file"),
    out: Path = typer.Option(SCREENING_DIR / "thresholds.md", "--out", help="report to write"),
    self_test_flag: bool = typer.Option(False, "--self-test", help="synthetic results and plays only"),
) -> None:
    if self_test_flag:
        raise typer.Exit(self_test())
    if not playlogs:
        print("오류: 설정의 기록 내보내기로 받은 livecanvas-playlog.json 을 하나 이상 주세요.", file=sys.stderr)
        raise typer.Exit(2)
    if not results.is_file():
        print(f"오류: {results} 이 없음. uv run tools/screen_songs.py 를 먼저 실행하세요.", file=sys.stderr)
        raise typer.Exit(2)
    statuses = run(results, playlogs, decisions, out)
    confirmed = sorted(f"{code}/{difficulty}" for (code, difficulty), status in statuses.items() if status == "confirmed")
    print(f"confirmed {len(confirmed)}: {', '.join(confirmed) or '-'} ({FITTED}) -> {out}")


if __name__ == "__main__":
    typer.run(main)
