import { COLOR, type Painter, type Point } from "./canvas";
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
/** Phrase brackets, in tiles: how far outside their boundary tile, how tall, how long their arms, how thick. */
const BRACKET = { offset: 0.35, height: 0.34, arm: 0.12, width: 0.045, minWidthPx: 1.5 } as const;

export type PhraseBound = { readonly tile: number; readonly kind: "open" | "close" };

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

export type PhraseSpan = { readonly start: number; readonly end: number };

/**
 * The tiles, first to last, of the phrases laid again in the same shape and of the first time each was laid, so that
 * the first appearance teaches the bracket the repeat shows again. Where they overlap, the longer one (then the
 * earlier) keeps its brackets; spans may touch end to start.
 */
export function phraseSpans({ tiles, rhythm }: RhythmPath): readonly PhraseSpan[] {
  const candidates = rhythm.phrases
    .flatMap(({ from, to, count }) => [from, to].map((at) => ({ start: at + 1, end: at + count + 1 })))
    .filter(({ end }) => end < tiles.length)
    .sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const kept: PhraseSpan[] = [];
  for (const span of candidates) {
    if (kept.every((other) => span.end <= other.start || other.end <= span.start)) kept.push(span);
  }
  return kept.sort((a, b) => a.start - b.start);
}

export function phraseBounds(path: RhythmPath): readonly PhraseBound[] {
  return phraseSpans(path).flatMap(({ start, end }): PhraseBound[] => [{ tile: start, kind: "open" }, { tile: end, kind: "close" }]);
}

/**
 * A bracket across the road just outside a phrase's boundary tile: an opening one before the first tile, its arms
 * pointing into the phrase, a closing one after the last. `along` is the road's screen direction there.
 */
export function drawPhraseBound(painter: Painter, kind: PhraseBound["kind"], at: Point, along: number, size: number): void {
  const { ctx } = painter;
  const outward = kind === "open" ? -1 : 1;
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(along);
  ctx.translate(outward * BRACKET.offset * size, 0);
  const half = (BRACKET.height / 2) * size;
  const arm = -outward * BRACKET.arm * size;
  ctx.strokeStyle = COLOR.text;
  ctx.lineWidth = Math.max(BRACKET.minWidthPx, BRACKET.width * size);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(arm, -half);
  ctx.lineTo(0, -half);
  ctx.lineTo(0, half);
  ctx.lineTo(arm, half);
  ctx.stroke();
  ctx.restore();
}
