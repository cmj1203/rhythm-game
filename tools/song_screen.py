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
#   uv run tools/song_screen.py public/songs/<id>/song.mp3 --credit "..."   screens one file, prints the result JSON
#   uv run tools/song_screen.py --self-test                                  synthetic signals only, nothing is played
# ──────────────────

from __future__ import annotations

import json
import sys
from pathlib import Path

import typer

sys.path.insert(0, str(Path(__file__).parent))
from screen.core import screen, self_tests  # noqa: E402

__all__ = ["screen"]


def run_self_tests() -> int:
    failed = 0
    for name, test in self_tests():
        try:
            test()
        except AssertionError as error:
            failed += 1
            print(f"FAIL {name}: {error}")
        else:
            print(f"PASS {name}")
    return 1 if failed else 0


def main(
    audio: Path | None = typer.Argument(None, help="audio file to screen"),
    song_id: str | None = typer.Option(None, "--id", help="song id (default: the audio file's folder name)"),
    credit: str = typer.Option("", help="credit text with the licence"),
    self_test: bool = typer.Option(False, "--self-test", help="run every module's SELF_TESTS"),
) -> None:
    if self_test:
        raise typer.Exit(run_self_tests())
    if audio is None:
        print("오류: 검사할 소리 파일을 주거나 --self-test 를 붙여 주세요.", file=sys.stderr)
        raise typer.Exit(2)
    meta = {"credit": credit} | ({"id": song_id} if song_id else {})
    print(json.dumps(screen(audio, meta), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    typer.run(main)
