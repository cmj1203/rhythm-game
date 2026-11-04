# /// script
# requires-python = ">=3.12"
# dependencies = ["pytest"]
# ///
# Run: uv run --with pytest pytest tools/test_conftest.py
# conftest.py 의 가짜 모듈이 pytest 자신을 망가뜨리지 않는지 본다.

import sys

import pytest

import make_chart


def test_pytest_approx_works_beside_the_fake_numpy() -> None:
    # Given conftest.py, which fakes numpy when it is not installed.
    # When pytest.approx compares plain floats (it looks for numpy in sys.modules to do so).
    # Then it compares them, instead of calling a fake numpy function that fails.
    assert 0.1 + 0.2 == pytest.approx(0.3)
    assert [0.1 + 0.2] == pytest.approx([0.3])


def test_make_chart_still_gets_the_fake_numpy() -> None:
    # Given make_chart, which imports numpy at its top.
    # Then it holds a numpy, real or fake, that has the operations it uses.
    assert hasattr(make_chart.np, "asarray")
    # And a fake one is not left in sys.modules for other code to take as the real numpy.
    numpy = sys.modules.get("numpy")
    assert numpy is None or not type(numpy).__name__.startswith("_Stub")
