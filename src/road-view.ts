import { JUDGEMENT_COLOR } from "./canvas";
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
/**
 * The colours the road ahead takes along a phrase laid again in the same shape, and along the first time it was laid:
 * every time one phrase comes, it comes in the same colour. Phrases take them in turn.
 */
const PHRASE_COLORS = [JUDGEMENT_COLOR.perfect, JUDGEMENT_COLOR.great] as const;
/** A phrase is coloured as a repeat only when it comes again within this many beats of the end of the earlier one. */
const REPEAT_WITHIN_BEATS = 16;

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

/** `group` is the same for every span that is one phrase laid again (or the first time it was laid). */
export type PhraseSpan = { readonly start: number; readonly end: number; readonly group: number };

/**
 * The tiles, first to last, of the phrases laid again in the same shape and of the first time each was laid. Where
 * they overlap, the longer one (then the earlier) is kept; spans may touch end to start. Groups are numbered in the
 * order they first come, and only groups that come at least twice are kept, since one alone repeats nothing on screen.
 * A phrase that comes back only long after (`REPEAT_WITHIN_BEATS`) is not a repeat anyone would hear as one.
 */
export function phraseSpans({ tiles, rhythm }: RhythmPath): readonly PhraseSpan[] {
  const timeOf = (tile: number): number => tiles[tile]?.time ?? Infinity;
  const phrases = rhythm.phrases.filter(({ from, to, count }) =>
    beatsBetween(rhythm.tempo, timeOf(from + count + 1), timeOf(to + 1)) <= REPEAT_WITHIN_BEATS);
  const keyOf = (start: number, end: number): string => `${start}-${end}`;
  const parent = new Map<string, string>();
  const root = (key: string): string => {
    const up = parent.get(key) ?? key;
    if (up === key) return key;
    const top = root(up);
    parent.set(key, top);
    return top;
  };
  for (const { from, to, count } of phrases) parent.set(root(keyOf(to + 1, to + count + 1)), root(keyOf(from + 1, from + count + 1)));
  const candidates = phrases
    .flatMap(({ from, to, count }) => [from, to].map((at) => ({ start: at + 1, end: at + count + 1 })))
    .filter(({ end }) => end < tiles.length)
    .sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const kept: { start: number; end: number; root: string }[] = [];
  for (const span of candidates) {
    const isFree = kept.every((other) => span.end <= other.start || other.end <= span.start);
    if (isFree) kept.push({ ...span, root: root(keyOf(span.start, span.end)) });
  }
  kept.sort((a, b) => a.start - b.start);
  const counts = new Map<string, number>();
  for (const { root: group } of kept) counts.set(group, (counts.get(group) ?? 0) + 1);
  const numbers = new Map<string, number>();
  return kept.filter(({ root: group }) => (counts.get(group) ?? 0) >= 2).map(({ start, end, root: group }) => {
    if (!numbers.has(group)) numbers.set(group, numbers.size);
    return { start, end, group: numbers.get(group) ?? 0 };
  });
}

/** Kept per road's rhythm details, which stay the same object frame after frame. */
const phraseColorCache = new WeakMap<RhythmPath["rhythm"], ReadonlyMap<number, string>>();

/** The colour of the road ahead from tile `i` to tile `i + 1`, for each `i` inside a repeated phrase. */
export function phraseColors(path: RhythmPath): ReadonlyMap<number, string> {
  const cached = phraseColorCache.get(path.rhythm);
  if (cached !== undefined) return cached;
  const colors = new Map<number, string>();
  for (const { start, end, group } of phraseSpans(path)) {
    for (let i = start; i < end; i++) colors.set(i, PHRASE_COLORS[group % PHRASE_COLORS.length] ?? JUDGEMENT_COLOR.perfect);
  }
  phraseColorCache.set(path.rhythm, colors);
  return colors;
}
