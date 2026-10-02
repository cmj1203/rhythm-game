import type { Point } from "./canvas";
import type { Route } from "./drawing";

export type Bounds = {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
};

/**
 * The picture's line at the size it is sewn, as points a fixed distance apart, in road units.
 * `colors[i]` is the thread the picture uses at `points[i]`; null where the thread only passes behind the
 * cloth on its way from one stroke to the next. The picture is complete at `points[endIndex]`, the last point.
 * `bounds` encloses the visible part of the picture.
 */
export type Guide = {
  readonly points: readonly Point[];
  readonly colors: readonly (string | null)[];
  readonly endIndex: number;
  readonly length: number;
  readonly bounds: Bounds;
};

/**
 * What the road steers by: the guide with every loop and wiggle too small for a road to follow smoothed away,
 * again as points a fixed distance apart. `marks[i]` is the guide point that `points[i]` stands for, so a road
 * that has come as far as `points[i]` has sewn the picture up to `marks[i]`. The course is complete at
 * `points[endIndex]`; the points after it only keep a late road going straight on.
 */
export type Course = {
  readonly points: readonly Point[];
  readonly marks: readonly number[];
  readonly endIndex: number;
};

/** Distance between neighbouring guide points, and between neighbouring course points, in road units. */
export const GUIDE_STEP = 0.25;
const SPARE_POINTS = 32;
/** A course point is the average of the guide this far to either side of it, in road units. */
const SMOOTHING_REACH = 2;

function boundsOf(points: readonly Point[]): Bounds {
  let bounds: Bounds | null = null;
  for (const { x, y } of points) {
    bounds =
      bounds === null
        ? { minX: x, minY: y, maxX: x, maxY: y }
        : {
            minX: Math.min(bounds.minX, x),
            minY: Math.min(bounds.minY, y),
            maxX: Math.max(bounds.maxX, x),
            maxY: Math.max(bounds.maxY, y),
          };
  }
  return bounds ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

/** Resizes a drawing's route so that it is `length` road units long and marks it out in even steps. */
export function layGuide(route: Route, length: number): Guide {
  const scale = route.length > 0 ? length / route.length : 0;
  const points: Point[] = [];
  const colors: (string | null)[] = [];
  let untilNext = 0;
  for (const [i, from] of route.points.entries()) {
    const to = route.points[i + 1];
    if (to === undefined) break;
    const dx = (to.x - from.x) * scale;
    const dy = (to.y - from.y) * scale;
    const span = Math.hypot(dx, dy);
    if (span === 0) continue;
    let travelled = untilNext;
    for (; travelled <= span; travelled += GUIDE_STEP) {
      const t = travelled / span;
      points.push({ x: from.x * scale + dx * t, y: from.y * scale + dy * t });
      colors.push(route.colors[i] ?? null);
    }
    untilNext = travelled - span;
  }

  const endIndex = Math.max(0, points.length - 1);
  const sewn = points.filter((_, i) => colors[i] !== null);
  return { points, colors, endIndex, length: endIndex * GUIDE_STEP, bounds: boundsOf(sewn.length > 0 ? sewn : points) };
}

/** Smooths a guide into the line a road can follow, keeping track of which guide point each part stands for. */
export function layCourse(guide: Guide): Course {
  const reach = Math.round(SMOOTHING_REACH / GUIDE_STEP);
  const totals: Point[] = [{ x: 0, y: 0 }];
  let total: Point = { x: 0, y: 0 };
  for (const point of guide.points) {
    total = { x: total.x + point.x, y: total.y + point.y };
    totals.push(total);
  }
  // The average reaches less far near the two ends, so the course still starts and ends where the guide does.
  const smooth = guide.points.map((point, i) => {
    const half = Math.min(reach, i, guide.endIndex - i);
    const low = totals[i - half];
    const high = totals[i + half + 1];
    if (low === undefined || high === undefined) return point;
    const count = 2 * half + 1;
    return { x: (high.x - low.x) / count, y: (high.y - low.y) / count };
  });

  const points: Point[] = [];
  const marks: number[] = [];
  let untilNext = 0;
  for (const [i, from] of smooth.entries()) {
    const to = smooth[i + 1];
    if (to === undefined) break;
    const span = Math.hypot(to.x - from.x, to.y - from.y);
    if (span === 0) continue;
    let travelled = untilNext;
    for (; travelled <= span; travelled += GUIDE_STEP) {
      const t = travelled / span;
      points.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
      marks.push(i);
    }
    untilNext = travelled - span;
  }
  const end = smooth[guide.endIndex];
  if (end !== undefined) {
    points.push(end);
    marks.push(guide.endIndex);
  }

  const endIndex = Math.max(0, points.length - 1);
  const last = points[endIndex];
  const before = points[endIndex - 1];
  if (last !== undefined) {
    const gap = before === undefined ? 0 : Math.hypot(last.x - before.x, last.y - before.y);
    const step =
      before === undefined || gap === 0
        ? { x: GUIDE_STEP, y: 0 }
        : { x: ((last.x - before.x) / gap) * GUIDE_STEP, y: ((last.y - before.y) / gap) * GUIDE_STEP };
    for (let k = 1; k <= SPARE_POINTS; k++) {
      points.push({ x: last.x + step.x * k, y: last.y + step.y * k });
      marks.push(guide.endIndex);
    }
  }
  return { points, marks, endIndex };
}
