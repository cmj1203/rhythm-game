#!/usr/bin/env -S uv run --script
# /// script
# requires-python = "==3.12.*"
# dependencies = [
#     "beat-this==1.1.0",
#     "librosa==1.0.0",
#     "numpy==2.5.4",
#     "scipy==1.18.1",
#     "soundfile==0.14.0",
#     "pyloudnorm==0.2.0",
#     "torch==2.14.1",
#     "typer==0.27.3",
#     "rich==15.0.0",
#     "essentia==2.1b6.dev1389; sys_platform == 'darwin' and platform_machine == 'arm64' and platform_release >= '24'",
# ]
# ///

# ─── How to run ───
#   uv run tools/screen_songs.py                  every public/songs/<id>/song.mp3
#   uv run tools/screen_songs.py id-a id-b        only these songs
#   uv run tools/screen_songs.py --history        also the restored tracks (uv run tools/restore_history.py first)
# Writes screening/results.json and screening/summary.md; reads screening/decisions.json when it exists.
# Per-file results are cached in screening/cache/ by (audio sha256, screening version, credit), so a rerun with
# nothing changed takes seconds. Always exits 0: it is a report, not a gate.
# ──────────────────

from __future__ import annotations

import hashlib
import json
import os
import sys
from dataclasses import dataclass
from multiprocessing import Pool
from pathlib import Path
from typing import Any, Final

import typer

sys.path.insert(0, str(Path(__file__).parent))
from screen import core, verdict  # noqa: E402

REPO: Final = Path(__file__).resolve().parent.parent
SONGS_DIR: Final = REPO / "public" / "songs"
SCREENING_DIR: Final = REPO / "screening"
HISTORY: Final = SCREENING_DIR / "history.json"
CACHE_DIR: Final = SCREENING_DIR / "cache"
MAX_WORKERS: Final = 8


@dataclass(frozen=True, slots=True)
class Job:
    id: str
    path: str
    title: str
    credit: str
    source: str


def public_jobs() -> dict[str, Job]:
    index = json.loads((SONGS_DIR / "index.json").read_text(encoding="utf-8"))["songs"]
    meta = {song["id"]: song for song in index}
    return {
        path.parent.name: Job(
            path.parent.name,
            str(path),
            meta.get(path.parent.name, {}).get("title", ""),
            meta.get(path.parent.name, {}).get("credit", ""),
            f"public/songs/{path.parent.name}/song.mp3",
        )
        for path in sorted(SONGS_DIR.glob("*/song.mp3"))
    }


def history_jobs(skip: set[str]) -> dict[str, Job]:
    tracks = json.loads(HISTORY.read_text(encoding="utf-8"))["tracks"]
    return {
        track["id"]: Job(
            track["id"],
            str(SCREENING_DIR / "audio" / track["id"] / "song.mp3"),
            track.get("title") or "",
            track.get("credit") or "",
            f"screening/audio/{track['id']}/song.mp3",
        )
        for track in tracks
        if track["id"] not in skip
    }


def cache_path(job: Job, version: str) -> Path:
    audio = Path(job.path)
    audio_sha = hashlib.sha256(audio.read_bytes()).hexdigest() if audio.is_file() else "missing"
    chart = verdict.SONGS_DIR / job.id / "chart.json"  # policy.repeat reads its bpm/offset (verdict.chart_timing)
    chart_sha = hashlib.sha256(chart.read_bytes()).hexdigest() if chart.is_file() else "none"
    key = hashlib.sha256(json.dumps([audio_sha, chart_sha, version, job.id, job.credit]).encode()).hexdigest()
    return CACHE_DIR / f"{key}.json"


def screen_job(job: Job) -> tuple[dict[str, Any], bool]:
    """The result and whether it may be cached (a check that raised is retried next run, never stored)."""
    try:
        return core.screen(job.path, {"id": job.id, "credit": job.credit}), True
    except Exception as error:  # noqa: BLE001 - one song must never stop the batch; the error is kept in the result
        try:
            core.decode(Path(job.path))
        except Exception as decode_error:  # noqa: BLE001 - any decoder error is that song's `fail decode`
            return verdict.decode_failed_result(job.id, job.credit, decode_error), True
        return verdict.error_result(job.id, error), False


def run_job(job: Job) -> dict[str, Any]:
    cached = cache_path(job, core.screening_version())
    try:
        result = json.loads(cached.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        result, keep = screen_job(job)
        if keep:
            cached.parent.mkdir(parents=True, exist_ok=True)
            partial = cached.with_suffix(f".{os.getpid()}.tmp")
            partial.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
            partial.replace(cached)
    return {**result, "title": job.title, "source": job.source}


def one_thread_per_worker() -> None:
    import torch

    torch.set_num_threads(1)


def main(
    ids: list[str] | None = typer.Argument(None, help="song ids; every song when left out"),
    history: bool = typer.Option(False, "--history", help="also screen the restored tracks in screening/audio"),
    out: Path = typer.Option(SCREENING_DIR / "results.json", "--out", help="result file; summary.md goes next to it"),
    decisions: Path = typer.Option(SCREENING_DIR / "decisions.json", "--decisions", help="owner's keep/drop file"),
) -> None:
    jobs = public_jobs()
    if history:
        if HISTORY.is_file():
            jobs |= history_jobs(set(jobs))
        else:
            print("오류: screening/history.json 이 없음. uv run tools/restore_history.py 를 먼저 실행하세요.", file=sys.stderr)
    for song_id in ids or []:
        if song_id not in jobs:
            print(f"오류: {song_id} 곡을 찾지 못해 건너뜀 (public/songs, --history 목록에 없음)", file=sys.stderr)
    selected = [jobs[song_id] for song_id in sorted(set(ids)) if song_id in jobs] if ids else list(jobs.values())
    selected.sort(key=lambda job: job.id)
    if not selected:
        print("검사할 곡이 없어 결과 파일을 쓰지 않음", file=sys.stderr)
        raise typer.Exit(0)
    with Pool(min(MAX_WORKERS, len(selected)), initializer=one_thread_per_worker) as pool:
        results = pool.map(run_job, selected)
    keeps, problems = verdict.load_decisions(decisions)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(results, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    summary = out.with_name("summary.md")
    summary.write_text(verdict.summary_markdown(results, keeps, problems), encoding="utf-8")
    for result in results:
        reasons = [item["code"] for bucket in ("fail", "flag") for item in result[bucket]]
        print(f"{result['verdict']:5s} {result['id']}" + (f": {', '.join(reasons)}" if reasons else ""))
        if result["verdict"] == "error":
            print(f"오류: {result['id']} 검사 중 예외: {result['error']}", file=sys.stderr)
    counts = {name: sum(result["verdict"] == name for result in results) for name in verdict.VERDICT_ORDER}
    print(f"{len(results)}곡: " + ", ".join(f"{name} {count}" for name, count in counts.items()) + f" -> {out}, {summary}")


if __name__ == "__main__":
    typer.run(main)
