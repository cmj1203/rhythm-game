import { JUDGEMENT_COLOR, type Point } from "./canvas";
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

/** The colours of the road ahead where it runs over a spot the crayon has already passed: the second pass, the third, and so on in turn. */
const PASS_COLORS = [JUDGEMENT_COLOR.perfect, JUDGEMENT_COLOR.great] as const;
/** Tiles this close in index are the same visit, not an earlier pass over the spot. */
const SAME_VISIT_TILES = 2;

/** Kept per road's rhythm details, which stay the same object frame after frame. */
const passColorCache = new WeakMap<RhythmPath["rhythm"], ReadonlyMap<number, string>>();

/** Whether the stretches from tile `i` and from tile `j` run between the same two spots, either way round. */
function sameStretch(tiles: RhythmPath["tiles"], i: number, j: number): boolean {
  const a = tiles[i]; const b = tiles[i + 1]; const c = tiles[j]; const d = tiles[j + 1];
  if (a === undefined || b === undefined || c === undefined || d === undefined) return false;
  const near = (p: Point, q: Point): boolean => Math.hypot(p.x - q.x, p.y - q.y) < SAME_SPOT;
  return (near(a, c) && near(b, d)) || (near(a, d) && near(b, c));
}

/** How many earlier stretches of the road run along the stretch from tile `i`: the line there was drawn before. */
function earlierPasses(tiles: RhythmPath["tiles"], i: number): number {
  let passes = 0;
  for (let j = 0; j < i - SAME_VISIT_TILES; j++) if (sameStretch(tiles, i, j)) passes++;
  return passes;
}

/**
 * The colour of the road ahead from tile `i` to tile `i + 1`, for each `i` where that stretch runs along a line the
 * crayon has already drawn (both its ends on the spots of an earlier stretch, not merely one tile on an old spot): the colour says which pass this is, so the player can tell a retraced line apart.
 */
export function passColors(path: RhythmPath): ReadonlyMap<number, string> {
  const cached = passColorCache.get(path.rhythm);
  if (cached !== undefined) return cached;
  const colors = new Map<number, string>();
  for (let i = 0; i + 1 < path.tiles.length; i++) {
    const pass = earlierPasses(path.tiles, i);
    if (pass > 0) colors.set(i, PASS_COLORS[(pass - 1) % PASS_COLORS.length] ?? JUDGEMENT_COLOR.perfect);
  }
  passColorCache.set(path.rhythm, colors);
  return colors;
}
