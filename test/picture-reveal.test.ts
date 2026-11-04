import { describe, expect, test } from "bun:test";
import { revealFingerprints } from "./reveal-fixture";

// 코드 리뷰 2026-11-04 낮음: revealedPath 가 점마다 타일을 처음부터 찾아 느렸다. 빠르게 바꾸기 전의 결과를 고정한다.
describe("revealedPath 결과 고정", () => {
  test("last-fortress 길의 조각 이동·정착 결과가 바꾸기 전과 같다", async () => {
    expect(await revealFingerprints()).toEqual([
      { points: 1609, sumX: -56293.875271, sumY: 1711.365809, nulls: 28, tileSum: -13227.224224, minX: -57.08917, minY: -12.109031, maxX: 7.707107, maxY: 18.34031 },
      { points: 1609, sumX: 1306.988856, sumY: 37467.344352, nulls: 28, tileSum: 19059.895598, minX: -35.882436, minY: -18.137786, maxX: 178.428448, maxY: 68.064288 },
      { points: 1609, sumX: 87772.631578, sumY: 91008.472436, nulls: 28, tileSum: 67490.575332, minX: 0, minY: -39.999608, maxX: 398, maxY: 110 },
      { points: 1609, sumX: 81533.129942, sumY: 47949.735696, nulls: 28, tileSum: 67490.575332, minX: 0, minY: -39.999608, maxX: 398, maxY: 110 },
    ]);
  });
});

describe("revealedPath 캐시", () => {
  test("연출이 끝난 뒤처럼 같은 인자로 다시 부르면 다시 계산하지 않고 같은 결과를 준다", async () => {
    const { lastFortressReveal } = await import("./reveal-fixture");
    const { revealedPath } = await import("../src/picture-reveal");
    const { road, picture } = await lastFortressReveal();
    const first = revealedPath(road, picture, 1, 1);
    expect(revealedPath(road, picture, 1, 1)).toBe(first);
    expect(revealedPath(road, picture, 0.5, 0)).not.toBe(first);
    expect(revealedPath(road, picture, 1, 1)).not.toBe(revealedPath(road, picture, 1, 0));
  });
});
