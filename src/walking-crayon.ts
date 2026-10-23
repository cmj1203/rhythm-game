import type { Point } from "./canvas";
import { orbiterAngle, type Path, type Tile } from "./path";

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

/** A unit-length stick. Rhythm-road sweeps already start on the previous tile: no catch-up easing. */
export function walkingCrayonAt(path: Path, time: number): WalkingCrayon | null {
  return poseOn(path, standingAt(path.tiles, time), time);
}

/** The crayon as it stands on tile `standing` at `time`, on the clock of that tile's sweep (before or after it too). */
export function poseOn(path: Path, standing: number, time: number): WalkingCrayon | null {
  const tile = path.tiles[standing];
  const sweep = path.sweeps[standing];
  if (tile === undefined || sweep === undefined) return null;
  // At a repeat sign the crayon has gone back to the tile before the stretch and turns around that one.
  const pivot = sweep.from ?? tile;
  const angle = orbiterAngle(sweep, time);
  const free = { x: pivot.x + Math.cos(angle), y: pivot.y + Math.sin(angle) };
  const [tip, flat] = standing % 2 === 0 ? [free, pivot] : [pivot, free];
  const age = (time - tile.time) / LANDING_SETTLE_S;
  // Fast, continuous pressure attack, then a longer release. Endpoint positions never squash.
  const settle = standing > 0 && age > 0 && age < 1 ? Math.sin(Math.PI * Math.sqrt(age)) ** 2 : 0;
  return {
    standing, pivot, tip, flat,
    heading: Math.atan2(tip.y - flat.y, tip.x - flat.x),
    settle,
  };
}
