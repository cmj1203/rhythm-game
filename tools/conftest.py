"""tools/ 의 pytest 가 큰 분석 의존성 없이 돌도록, 설치되지 않은 모듈 자리에 가짜 모듈을 넣는다.

make_chart.py 는 맨 위에서 librosa, beat_this(PyTorch), scipy, numpy, typer, rich 를 가져온다. 이 파일은
`uv run --with pytest pytest tools` 처럼 pytest 만 있는 환경에서 그 import 가 실패하지 않게 한다.
- 설치된 모듈은 건드리지 않는다. 진짜 모듈이 있으면 진짜를 쓴다.
- 가짜 분석 함수(librosa.load, Audio2Beats 등)는 불리면 바로 실패한다. 시험이 쓰려면 monkeypatch 로 바꿔 끼운다.
- 가짜 numpy 는 rated_level 과 gap_report 가 쓰는 연산만 1차원 float 목록으로 흉내 낸다.
  진짜 numpy 와 결과가 같은지는 `uv run --with pytest --with numpy pytest tools` 로 따로 확인한다.
"""

from __future__ import annotations

import importlib.util
import math
import sys
import types
from collections.abc import Callable, Iterable
from typing import Any


def _missing(name: str) -> bool:
    try:
        return importlib.util.find_spec(name) is None
    except (ImportError, ValueError):
        return True


def _not_faked(qualified: str) -> Callable[..., Any]:
    def call(*args: object, **kwargs: object) -> Any:
        raise RuntimeError(f"가짜 {qualified} 가 불렸다: 시험에서 monkeypatch 로 바꿔 끼워야 한다")

    return call


class _StubModule(types.ModuleType):
    """속성을 물으면 '불리면 실패하는 함수'를 돌려주는 모듈. 하위 모듈은 _install 로 따로 만든다."""

    def __getattr__(self, attribute: str) -> Any:
        if attribute.startswith("__"):
            raise AttributeError(attribute)
        stub = _not_faked(f"{self.__name__}.{attribute}")
        setattr(self, attribute, stub)
        return stub


def _install(name: str) -> _StubModule:
    module = _StubModule(name)
    sys.modules[name] = module
    parent, _, child = name.rpartition(".")
    if parent:
        setattr(sys.modules[parent], child, module)
    return module


class FakeArray:
    """1차원 float 배열. 원소별 산술·비교와 rated_level·gap_report 가 쓰는 메서드만 있다."""

    def __init__(self, values: Iterable[float]) -> None:
        self.values = list(values)

    def _map(self, other: object, op: Callable[[Any, Any], Any]) -> FakeArray:
        if isinstance(other, FakeArray):
            return FakeArray(op(a, b) for a, b in zip(self.values, other.values, strict=True))
        return FakeArray(op(a, other) for a in self.values)

    def __len__(self) -> int:
        return len(self.values)

    def __iter__(self):  # noqa: ANN204
        return iter(self.values)

    def __getitem__(self, index: int | slice) -> Any:
        if isinstance(index, slice):
            return FakeArray(self.values[index])
        return self.values[index]

    def __sub__(self, other: object) -> FakeArray:
        return self._map(other, lambda a, b: a - b)

    def __mul__(self, other: object) -> FakeArray:
        return self._map(other, lambda a, b: a * b)

    def __truediv__(self, other: object) -> FakeArray:
        return self._map(other, lambda a, b: a / b)

    def __mod__(self, other: object) -> FakeArray:
        # numpy 와 같이 나누는 수의 부호를 따른다(파이썬 % 도 같다).
        return self._map(other, lambda a, b: a % b)

    def __lt__(self, other: object) -> FakeArray:
        return self._map(other, lambda a, b: a < b)

    def __gt__(self, other: object) -> FakeArray:
        return self._map(other, lambda a, b: a > b)

    def min(self) -> float:
        return min(self.values)

    def sum(self) -> float:
        return sum(self.values)


def _fake_numpy() -> None:
    np = _install("numpy")
    np.ndarray = FakeArray  # type: ignore[attr-defined]
    np.asarray = lambda values, dtype=float: values if isinstance(values, FakeArray) else FakeArray(map(dtype, values))  # type: ignore[attr-defined]
    np.abs = lambda array: FakeArray(abs(a) for a in array)  # type: ignore[attr-defined]
    # numpy.round 와 파이썬 round 는 둘 다 .5 를 짝수 쪽으로 반올림한다.
    np.round = lambda array: FakeArray(float(round(a)) for a in array)  # type: ignore[attr-defined]
    np.mean = lambda array: sum(array) / len(array) if len(array) else math.nan  # type: ignore[attr-defined]
    np.diff = lambda array: FakeArray(b - a for a, b in zip(array[:-1], array[1:], strict=True))  # type: ignore[attr-defined]


class _FakeExit(Exception):
    def __init__(self, code: int = 0) -> None:
        super().__init__(code)
        self.exit_code = code


def _fake_typer() -> None:
    typer = _install("typer")
    typer.Exit = _FakeExit  # type: ignore[attr-defined]


def _fake_rich() -> None:
    class Quiet:
        """rich 의 Table·Console 자리: 무엇을 받아도 아무것도 하지 않는다."""

        def __init__(self, *args: object, **kwargs: object) -> None:
            pass

        def __getattr__(self, attribute: str) -> Callable[..., None]:
            return lambda *args, **kwargs: None

    _install("rich")
    _install("rich.console").Console = Quiet  # type: ignore[attr-defined]
    _install("rich.table").Table = Quiet  # type: ignore[attr-defined]


def _fake_analysis() -> None:
    if _missing("librosa"):
        for name in ("librosa", "librosa.effects", "librosa.onset", "librosa.feature"):
            _install(name)
    if _missing("beat_this"):
        _install("beat_this")
        _install("beat_this.inference")
    if _missing("scipy"):
        for name in ("scipy", "scipy.ndimage", "scipy.signal"):
            _install(name)


if _missing("numpy"):
    _fake_numpy()
if _missing("typer"):
    _fake_typer()
if _missing("rich"):
    _fake_rich()
_fake_analysis()
