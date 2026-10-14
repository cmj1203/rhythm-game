#!/usr/bin/env -S uv run --script
# /// script
# requires-python = "==3.12.*"
# dependencies = [
#     "typer==0.15.1",
# ]
# ///

# ─── How to run ───
#   uv run tools/restore_history.py                 restore every free track ever committed to screening/audio/<id>/song.mp3
#   uv run tools/restore_history.py --repo <path>   read another git repo
# Writes screening/history.json (committed); screening/audio/ is gitignored. Does not touch public/.
# ──────────────────

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Final

import typer

ROOT: Final = Path(__file__).resolve().parent.parent
EXCLUDED: Final = frozenset({"test-beat"})
SONG_GLOB: Final = "public/songs/*/song.mp3"
INDEX_PATH: Final = "public/songs/index.json"


def git(repo: Path, *args: str) -> bytes:
    return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True).stdout


def newest_commit_per_id(repo: Path) -> dict[str, str]:
    """Newest commit that added or changed each id's song.mp3 (log is newest first; deletions are skipped)."""
    out = git(repo, "log", "--all", "--diff-filter=ACMR", "--format=%x00%H", "--name-only", "--", SONG_GLOB).decode()
    newest: dict[str, str] = {}
    for block in out.split("\x00")[1:]:
        commit, *paths = block.split("\n")
        for path in paths:
            parts = path.split("/")
            if len(parts) == 4 and parts[3] == "song.mp3" and parts[2] not in EXCLUDED:
                newest.setdefault(parts[2], commit)
    return newest


def index_entry(repo: Path, commit: str, song_id: str) -> dict:
    raw = git(repo, "show", f"{commit}:{INDEX_PATH}")
    data = json.loads(raw)
    songs = data["songs"] if isinstance(data, dict) else data
    for song in songs:
        if song.get("id") == song_id:
            return song
    return {}


def main(
    repo: Path = typer.Option(ROOT, "--repo", help="git 저장소 경로"),
    out: Path = typer.Option(ROOT / "screening", "--out", help="결과 폴더"),
) -> None:
    if not (repo / ".git").exists():
        typer.echo(f"git 저장소가 아니에요: {repo}", err=True)
        raise typer.Exit(1)
    try:
        newest = newest_commit_per_id(repo)
    except subprocess.CalledProcessError as error:
        typer.echo(f"git 기록을 읽지 못했어요: {error.stderr.decode().strip()}", err=True)
        raise typer.Exit(1) from error

    present_now = {p.parent.name for p in (repo / "public" / "songs").glob("*/song.mp3")}
    tracks = []
    for song_id in sorted(newest):
        commit = newest[song_id]
        path = f"public/songs/{song_id}/song.mp3"
        blob_sha = git(repo, "rev-parse", f"{commit}:{path}").decode().strip()
        target = out / "audio" / song_id / "song.mp3"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(git(repo, "show", f"{commit}:{path}"))
        meta = index_entry(repo, commit, song_id)
        tracks.append({
            "id": song_id,
            "title": meta.get("title"),
            "artist": meta.get("artist"),
            "credit": meta.get("credit"),
            "commit": commit,
            "blob_sha": blob_sha,
            "present_now": song_id in present_now,
        })
    out.mkdir(parents=True, exist_ok=True)
    (out / "history.json").write_text(json.dumps({"tracks": tracks}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    typer.echo(f"{len(tracks)}곡 복원 → {out / 'audio'}")


if __name__ == "__main__":
    typer.run(main)
