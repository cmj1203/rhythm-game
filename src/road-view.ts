import type { RhythmPath } from "./rhythm-road";
import { beatsBetween } from "./tempo";

/** A rhythm road shows the tiles of the next `AHEAD_BEATS` beats, but never fewer or more tiles than these. */
export const AHEAD_BEATS = 4;
export const AHEAD_MIN_TILES = 6;
export const AHEAD_MAX_TILES = 12;
/** Tiles nearer each other than this, in tiles, are one spot of the road. */
const SAME_SPOT = 0.5;
/** The last two tiles shown fade out this far. */
const EDGE_CLARITY = [0.7, 0.35] as const;

/** The last tile shown ahead of `standing` at song time `songTime`. */
export function aheadEnd({ tiles, rhythm }: RhythmPath, standing: number, songTime: number): number {
  const last = tiles.length - 1;
  const most = Math.min(last, standing + AHEAD_MAX_TILES);
  let end = Math.min(last, standing + AHEAD_MIN_TILES);
  while (end < most) {
    const next = tiles[end + 1];
    if (next === undefined || beatsBetween(rhythm.tempo, songTime, next.time) > AHEAD_BEATS) break;
    end++;
  }
  return end;
}

/** How clearly the tile `steps` on from the standing one shows, when `shown` tiles are shown after it. */
export function aheadClarity(steps: number, shown: number): number {
  const fromEnd = shown - steps;
  if (fromEnd >= EDGE_CLARITY.length) return 1;
  return EDGE_CLARITY[EDGE_CLARITY.length - 1 - fromEnd] ?? 0;
}

/**
 * The tiles up to `end` that lie on a spot the crayon has yet to reach on an earlier pass. Their markers wait until
 * the crayon stands on that earlier pass, so a spot ahead only ever shows what happens the next time it is reached.
 */
export function laterPasses({ tiles }: RhythmPath, standing: number, end: number): ReadonlySet<number> {
  const later = new Set<number>();
  for (let i = standing + 2; i <= end; i++) {
    const tile = tiles[i];
    if (tile === undefined) continue;
    for (let j = standing + 1; j < i; j++) {
      const earlier = tiles[j];
      if (earlier !== undefined && Math.hypot(earlier.x - tile.x, earlier.y - tile.y) < SAME_SPOT) {
        later.add(i);
        break;
      }
    }
  }
  return later;
}
