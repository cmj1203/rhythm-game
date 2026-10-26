import type { Point } from "./canvas";
import { orbiterAngle, type Path, type Sweep, type Tile } from "./path";

export const LANDING_SETTLE_S = 0.08;

export type WalkingCrayon = {
  readonly standing: number;
  readonly pivot: Point;
  readonly tip: Point;
  readonly flat: Point;
  readonly heading: number;
  readonly settle: number;
};

/** The clock, not the number of judged notes, chooses which end stands. */
export function standingAt(tiles: readonly Tile[], time: number): number {
  let low = 0;
  let high = tiles.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if ((tiles[middle]?.time ?? Infinity) <= time) low = middle;
    else high = middle - 1;
  }
  return low;
}

const midspinCounts = new WeakMap<readonly Sweep[], readonly number[]>();

/** How many midspins the crayon has passed by sweep `standing`, that one included. */
function midspinsUpTo(sweeps: readonly Sweep[], standing: number): number {
  let counts = midspinCounts.get(sweeps);
  if (counts === undefined) {
    let count = 0;
    counts = sweeps.map(({ around }) => (around === undefined ? count : ++count));
    midspinCounts.set(sweeps, counts);
  }
  return counts[standing] ?? 0;
}

/**
 * A unit-length stick. Rhythm-road sweeps already start on the previous tile: no catch-up easing. Its ends take turns
 * to stand, except past a midspin, where the end standing keeps standing and the other swings on.
 */
export function walkingCrayonAt(path: Path, time: number): WalkingCrayon | null {
  const standing = standingAt(path.tiles, time);
  const sweep = path.sweeps[standing];
  const pivot = path.tiles[sweep?.around ?? standing];
  if (pivot === undefined || sweep === undefined) return null;
  const angle = orbiterAngle(sweep, time);
  const free = { x: pivot.x + Math.cos(angle), y: pivot.y + Math.sin(angle) };
  const [tip, flat] = (standing - midspinsUpTo(path.sweeps, standing)) % 2 === 0 ? [free, pivot] : [pivot, free];
  const age = (time - pivot.time) / LANDING_SETTLE_S;
  // Fast, continuous pressure attack, then a longer release. Endpoint positions never squash.
  const settle = standing > 0 && age > 0 && age < 1 ? Math.sin(Math.PI * Math.sqrt(age)) ** 2 : 0;
  return {
    standing, pivot, tip, flat,
    heading: Math.atan2(tip.y - flat.y, tip.x - flat.x),
    settle,
  };
}
