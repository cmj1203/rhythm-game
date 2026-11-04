import { describe, expect, test } from "bun:test";
import { boundsOf, distance, lerp, lerpPoint } from "../src/geometry";

// 코드 리뷰 2026-11-04 중복: 경계 상자·거리·보간이 여러 파일에 따로 있었다.
describe("boundsOf", () => {
  test("점들을 모두 담는 가장 작은 상자", () => {
    expect(boundsOf([{ x: 1, y: -2 }, { x: -3, y: 4 }, { x: 0, y: 0 }])).toEqual({ minX: -3, minY: -2, maxX: 1, maxY: 4 });
  });

  test("점이 없으면 null", () => {
    expect(boundsOf([])).toBeNull();
  });

  test("Math.min(...배열) 의 인자 수 한계를 넘는 점 수에서도 된다", () => {
    const points = Array.from({ length: 2_000_000 }, (_, i) => ({ x: i, y: 5 - i }));
    expect(boundsOf(points)).toEqual({ minX: 0, minY: -1_999_994, maxX: 1_999_999, maxY: 5 });
  });
});

describe("distance, lerp, lerpPoint", () => {
  test("두 점 사이 거리와 비율만큼 간 값", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(lerp(2, 10, 0.25)).toBe(4);
    expect(lerpPoint({ x: 0, y: 10 }, { x: 4, y: 2 }, 0.5)).toEqual({ x: 2, y: 6 });
  });
});
