import type { Point } from "./canvas";

/** 점들을 담는 상자. */
export type Bounds = {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
};

/**
 * `points` 를 모두 담는 가장 작은 상자, 점이 없으면 null. `Math.min(...배열)` 과 달리 점이 아무리 많아도
 * 인자 수 한계에 걸리지 않는다.
 */
export function boundsOf(points: Iterable<Point>): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;
  for (const { x, y } of points) {
    any = true;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return any ? { minX, minY, maxX, maxY } : null;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** `a` 에서 `b` 로 `t` 만큼 간 값. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 점 `a` 에서 점 `b` 로 `t` 만큼 간 점. */
export function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}
