import { COLOR, type Point } from "./canvas";
import type { RoadPictureData } from "./chart";
import type { Stroke } from "./drawing";
import { GUIDE_STEP, type Guide } from "./guide";
import type { Path, Sweep, Tile } from "./path";
import { phraseMatches, type Phrase } from "./road-phrases";
import { beatsBetween, bpmAt, scaledTempo, type TempoMap, type TempoMark } from "./tempo";

/** Only still-fresh stitches block a turn; older, passed loops may be travelled again. */
export const RHYTHM_CLEARANCE = { distance: 0.95, lookback: 6, maxAgeSeconds: 0.5 } as const;
const GRID = 12;
const SAMPLES_PER_TILE = Math.round(1 / GUIDE_STEP);

export type RhythmDetails = {
  readonly tempo: TempoMap;
  /** How fast the crayon turns: `tempo` times the chart's turn scale. Angles and tempo marks follow this. */
  readonly turns: TempoMap;
  readonly marks: readonly (TempoMark | null)[];
  /** Nonoverlapping destinations reusing an earlier phrase's relative turns. */
  readonly phrases: readonly (Phrase & { readonly to: number })[];
  /** The picture the road's pieces move into on the result screen, if the chart has one. */
  readonly picture?: RoadPicture;
  /** The tiles the road jumps back from, at a repeat sign: the next tile stands where an earlier one did. */
  readonly jumps: readonly number[];
};
export type RepeatSection = { readonly from: number; readonly count: number };
/** `name` is what the result screen calls the picture; `strokes` are its lines, in the picture's own units. */
export type RoadPicture = {
  readonly name: string;
  readonly strokes: readonly Stroke[];
  readonly pieces: RoadPictureData["pieces"];
  /** The road was laid along `strokes` itself: the result screen pulls it onto them instead of drawing them. */
  readonly traced?: boolean;
};
export type RhythmPath = Path & { readonly rhythm: RhythmDetails };

function crowded(tiles: readonly Tile[], spot: Point): boolean {
  const now = tiles.at(-1)?.time ?? 0;
  return tiles.slice(-RHYTHM_CLEARANCE.lookback, -1).some((tile) =>
    now - tile.time <= RHYTHM_CLEARANCE.maxAgeSeconds &&
    Math.hypot(tile.x - spot.x, tile.y - spot.y) < RHYTHM_CLEARANCE.distance);
}

function step(pivot: Point, heading: number): Point {
  return { x: pivot.x + Math.cos(heading), y: pivot.y + Math.sin(heading) };
}

function sweepAngle(units: number): number {
  let divisor = 1;
  while (units / divisor > 2) divisor *= 2;
  return (Math.PI * units) / divisor;
}

/**
 * The guide is the travelled line itself, sampled exactly at each tile, not fitted to a picture. From a tile the road
 * jumps back from, the samples all stay on it: the jump is no line to draw or sew.
 */
function guideOf(tiles: readonly Tile[], jumps: ReadonlySet<number>): Guide {
  const points: Point[] = [];
  for (const [i, tile] of tiles.entries()) {
    const next = tiles[i + 1];
    if (next === undefined) break;
    for (let k = 0; k < SAMPLES_PER_TILE; k++) {
      const along = jumps.has(i) ? 0 : k / SAMPLES_PER_TILE;
      points.push({ x: tile.x + (next.x - tile.x) * along, y: tile.y + (next.y - tile.y) * along });
    }
  }
  const last = tiles.at(-1) ?? { x: 0, y: 0 };
  points.push({ x: last.x, y: last.y });
  return {
    points,
    colors: points.map(() => COLOR.thread),
    endIndex: points.length - 1,
    length: Math.max(0, tiles.length - 1),
    bounds: {
      minX: Math.min(...points.map(({ x }) => x)),
      minY: Math.min(...points.map(({ y }) => y)),
      maxX: Math.max(...points.map(({ x }) => x)),
      maxY: Math.max(...points.map(({ y }) => y)),
    },
  };
}

/** Beats in a bar, and how near (in beats) a note must be to a bar's first beat to count as on it. */
const BAR_BEATS = 4;
const ON_BEAT = 0.08;
/** A chart's twirl time names the note within this many seconds of it. */
const TWIRL_MATCH_S = 0.002;
/** Two turning speeds whose ratio is within this of 1 are the same speed. */
const SAME_SPEED = 1e-6;
/** A note after a gap of at least this many beats comes back in after a rest. */
const REST_BEATS = 2;

/**
 * Which notes are big moments, for the screen to give a kick when they are hit: a note on the first beat of a bar
 * (bars counted from `offset`, the first downbeat), the first note after a rest, and the first note at a new tempo.
 */
export function accentsOf(times: readonly number[], tempo: TempoMap, offset: number): boolean[] {
  const changes = tempo.slice(1).map(([start]) => times.findIndex((time) => time >= start - 0.0001));
  return times.map((time, i) => {
    const beats = beatsBetween(tempo, offset, time);
    const fromBar = beats - Math.round(beats / BAR_BEATS) * BAR_BEATS;
    const before = times[i - 1];
    const afterRest = before !== undefined && beatsBetween(tempo, before, time) >= REST_BEATS - ON_BEAT;
    return Math.abs(fromBar) <= ON_BEAT || afterRest || changes.includes(i);
  });
}

/**
 * A separate opt-in layout; buildPath's picture roads and all their heuristics stay untouched. `turnScale` turns the
 * crayon that much faster (or slower) per beat from each start time, so the same rhythm bends at other angles there.
 * After a note at one of the times in `twirls` the crayon turns back the other way, wherever that leaves room.
 * Given `flips` (note indices), the crayon turns back after exactly those notes and nowhere else, as a picture's road
 * was laid out; a phrase is then marked as repeated only where its twirls are the same as the earlier one's.
 * At each of `repeats` the road jumps back: the note after the stretch stands on the stretch's first tile again, the
 * crayon set as it was there, and the stretch is walked once more with the same turns, so the second pass lands
 * on the very same tiles.
 */
export function buildRhythmPath(
  times: readonly number[],
  songTempo: TempoMap,
  turnScale?: TempoMap,
  twirls: readonly number[] = [],
  flips?: readonly number[],
  repeats: readonly RepeatSection[] = [],
): RhythmPath {
  const tempo = scaledTempo(songTempo, turnScale);
  const forced = new Set(times.flatMap((time, i) => (twirls.some((at) => Math.abs(at - time) < TWIRL_MATCH_S) ? [i] : [])));
  const exact = flips === undefined ? null : new Set(flips);
  const first = times[0] ?? 0;
  const unit = 60 / bpmAt(tempo, first);
  const tiles: Tile[] = [{ x: 0, y: 0, time: first - unit }, { x: 1, y: 0, time: first }];
  const sweeps: Sweep[] = [{
    startAngle: Math.PI,
    angle: Math.PI,
    startTime: first - unit,
    endTime: first,
    pace: "normal",
    isTwirl: false,
  }];
  const units = times.slice(1).map((time, i) => Math.max(1 / GRID, Math.round(beatsBetween(tempo, times[i] ?? time, time) * GRID) / GRID));
  const phrases = phraseMatches(units);
  const decisions: boolean[] = [];
  const reproduced: (Phrase & { readonly to: number })[] = [];
  const weights = [1];
  // How many half turns a beat the crayon makes on each sweep: 1, or less on a long rest it turns more slowly.
  const factors = [1];
  let heading = 0;
  let spin = 1;
  let replay: readonly boolean[] = [];
  let replayAt = 0;
  // Where the road jumps back (by the unit it jumps over) to which note's tile, and which earlier unit each unit of a
  // second pass walks again; and the crayon's heading and spin after each note's tile, to set it back there.
  const jumpTo = new Map<number, number>();
  const secondPassOf = new Map<number, number>();
  for (const { from, count } of repeats) {
    jumpTo.set(from + count - 1, from);
    for (let k = 0; k + 1 < count; k++) secondPassOf.set(from + count + k, from + k);
  }
  const headingAfter = [0];
  const spinAfter = [1];
  const jumps = new Set<number>();

  for (const [i, gap] of units.entries()) {
    const pivot = tiles[i + 1];
    const from = times[i];
    const to = times[i + 1];
    if (pivot === undefined || from === undefined || to === undefined) break;
    if (replayAt >= replay.length) {
      replay = [];
      replayAt = 0;
      for (const phrase of phrases.get(i) ?? []) {
        if (Math.sign(sweeps[phrase.from]?.angle ?? Math.PI) !== spin) continue;
        const proposed = decisions.slice(phrase.from, phrase.from + phrase.count);
        if (exact !== null) {
          if (proposed.every((twirl, j) => twirl === exact.has(i + j))) {
            replay = proposed;
            reproduced.push({ ...phrase, to: i });
            break;
          }
          continue;
        }
        const trial: Tile[] = tiles.slice(-RHYTHM_CLEARANCE.lookback);
        let trialHeading = heading;
        let trialSpin = spin;
        let valid = true;
        for (const [j, twirl] of proposed.entries()) {
          const at = trial.at(-1) ?? pivot;
          const angle = sweepAngle(units[i + j] ?? 1);
          const forward = step(at, trialHeading + Math.PI + trialSpin * angle);
          // A remembered twirl is legal only when it still prevents an overlap here.
          if (twirl && !crowded(trial, forward) && !forced.has(i + j)) { valid = false; break; }
          if (forced.has(i + j) && !twirl) { valid = false; break; }
          if (twirl) trialSpin *= -1;
          trialHeading += Math.PI + trialSpin * angle;
          const next = step(at, trialHeading);
          if (crowded(trial, next)) { valid = false; break; }
          trial.push({ ...next, time: times[i + j + 1] ?? to });
        }
        if (valid) {
          replay = proposed;
          reproduced.push({ ...phrase, to: i });
          break;
        }
      }
    }

    const source = jumpTo.get(i);
    if (source !== undefined) {
      // The repeat sign: the crayon is set back as it stood on the tile before the stretch, and this sweep turns it
      // into the stretch's first tile again, from there.
      const first = tiles[source + 1];
      const before = tiles[source];
      const entry = sweeps[source];
      if (first === undefined || before === undefined || entry === undefined) break;
      heading = headingAfter[source] ?? heading;
      spin = spinAfter[source] ?? spin;
      decisions.push(false);
      sweeps.push({ ...entry, startTime: from, endTime: to, tempo, from: { x: before.x, y: before.y } });
      tiles.push({ x: first.x, y: first.y, time: to });
      weights.push(weights[source + 1] ?? 1);
      factors.push(factors[source + 1] ?? 1);
      headingAfter.push(heading);
      spinAfter.push(spin);
      jumps.add(i + 1);
      continue;
    }
    const angle = sweepAngle(gap);
    const forward = step(pivot, heading + Math.PI + spin * angle);
    const backward = step(pivot, heading + Math.PI - spin * angle);
    const avoidsOverlap = crowded(tiles, forward) && !crowded(tiles, backward);
    const isReplayed = replayAt < replay.length;
    if (isReplayed) replayAt++;
    const again = secondPassOf.get(i);
    const twirl = again !== undefined
      ? decisions[again] === true
      : exact !== null
        ? exact.has(i)
        : isReplayed
          ? replay[replayAt - 1] === true
          : avoidsOverlap || (forced.has(i) && !crowded(tiles, backward));
    if (twirl) spin *= -1;
    heading = (heading + Math.PI + spin * angle) % (Math.PI * 2);
    decisions.push(twirl);
    sweeps.push({
      startAngle: heading - spin * angle,
      angle: spin * angle,
      startTime: from,
      endTime: to,
      pace: gap > 2 ? "slow" : "normal",
      isTwirl: twirl,
      tempo,
    });
    tiles.push({ ...step(pivot, heading), time: to });
    weights.push(Math.min(1.8, Math.max(0.6, Math.sqrt(gap))));
    factors.push(angle / (Math.PI * gap));
    headingAfter.push(heading);
    spinAfter.push(spin);
  }
  const last = tiles.at(-1) ?? tiles[0];
  const endTime = last?.time ?? first;
  sweeps.push({
    startAngle: heading + Math.PI,
    angle: spin * Math.PI,
    startTime: endTime,
    endTime: endTime + 60 / bpmAt(tempo, endTime),
    pace: "normal",
    isTwirl: false,
  });
  // A note is marked wherever the crayon sets out from it turning at another speed than it came in: a new tempo, or
  // a long rest turned at half speed (or a quarter) and the note after it, where it speeds up again. The speed holds
  // from one mark to the next, so every change of speed the player feels has a mark on its note.
  factors.push(1);
  const speeds = sweeps.map(({ startTime }, i) => bpmAt(tempo, startTime) * (factors[i] ?? 1));
  const marks: (TempoMark | null)[] = tiles.map((_, i) => {
    const before = speeds[i - 1];
    const now = speeds[i];
    if (before === undefined || now === undefined || Math.abs(now / before - 1) < SAME_SPEED) return null;
    return now > before ? "faster" : "slower";
  });
  return {
    tiles, sweeps, weights,
    anchors: tiles.map((_, i) => i * SAMPLES_PER_TILE),
    guide: guideOf(tiles, jumps),
    drift: 0,
    rhythm: { tempo: songTempo, turns: tempo, marks, phrases: reproduced, jumps: [...jumps] },
  };
}
