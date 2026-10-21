# /// script
# requires-python = "==3.12.*"
# dependencies = [
#     "pytest",
#     "beat-this==1.1.0",
#     "librosa",
#     "numpy",
#     "scipy",
#     "typer",
#     "rich",
# ]
# ///
# Run: heavy -- uv run tools/test_make_chart_cli.py

from pathlib import Path

import pytest
import typer
from typer.testing import CliRunner

import make_chart


def test_rhythm_road_without_beats_stops_before_audio_work(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # Given a rhythm road without exact beats, and audio/model work forbidden.
    def unexpected_work(*args: Path, **kwargs: int | bool | str) -> None:
        pytest.fail("audio/model work started")

    monkeypatch.setattr(make_chart.librosa, "load", unexpected_work)
    monkeypatch.setattr(make_chart, "Audio2Beats", unexpected_work)
    song_dir = tmp_path / "song"
    song_dir.mkdir()
    app = typer.Typer()
    app.command()(make_chart.main)
    # When the CLI receives the unsupported combination.
    result = CliRunner().invoke(app, [str(song_dir / "song.mp3"), "--road", "rhythm"])
    # Then it rejects the arguments without writing a chart or song index.
    assert result.exit_code == 2
    assert list(song_dir.iterdir()) == []
    assert not (tmp_path / "index.json").exists()


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
