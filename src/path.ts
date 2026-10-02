import type { Point } from "./canvas";
import type { Route } from "./drawing";
import { type Course, GUIDE_STEP, type Guide, layCourse, layGuide } from "./guide";

export type Pace = "normal" | "slow" | "fast";

/** A stepping stone, in units of the distance between neighbours. `time` is when the ball must land on it. */
export type Tile = { readonly x: number; readonly y: number; readonly time: number };

/**
 * How the orbiting ball travels around tile i on its way to tile i + 1.
 * Angles are radians in screen space, positive = clockwise. `angle` is signed by rotation direction.
 */
export type Sweep = {
  readonly startAngle: number;
  readonly angle: number;
  readonly startTime: number;
  readonly endTime: number;
  readonly pace: Pace;
  readonly isTwirl: boolean;
};

/**
 * `tiles[0]` is the start; `tiles[i + 1]` belongs to note i. `sweeps[i]` turns around `tiles[i]`.
 * The road only follows the picture in broad strokes: it wanders for the sake of rhythm and skips what is too
 * fine for it. `anchors[i]` is the point of `guide` tile i stands for, so the stitch of note i is the piece of
 * the picture from `anchors[i]` to `anchors[i + 1]`. `weights[i]` is how thick that stitch is sewn, 1 being
 * the usual: a note that was waited for longer is sewn thicker, so the rhythm shows in the finished line.
 * `drift` is how far the rhythm pushed the road off the picture on average, in road units.
 */
export type Path = {
  readonly tiles: readonly Tile[];
  readonly sweeps: readonly Sweep[];
  readonly anchors: readonly number[];
  readonly weights: readonly number[];
  readonly guide: Guide;
  readonly drift: number;
};

const TAU = Math.PI * 2;
const EPSILON = 0.01;
const FALLBACK_UNIT_S = 0.5;
const COMMON_SHARE = 0.25;
const MAX_UNITS_PER_SWEEP = 1.5;
const MIN_CORNER_ANGLE = Math.PI / 3;
const MAX_CORNER_ANGLE = TAU - Math.PI / 3;
const OVERLAP_DISTANCE = 0.95;
/** Only the last few tiles are kept clear of each other; a drawing is free to cross its own earlier lines. */
const OVERLAP_LOOKBACK = 10;
const SLOW_BELOW = 0.8;
const FAST_ABOVE = 1.25;
const MIN_WEIGHT = 0.6;
const MAX_WEIGHT = 1.8;

/** Detours for rhythm make the road cover less of the guide than it has tiles; this is the planned share. */
const GUIDE_SHARE = 0.9;
const MIN_GUIDE_LENGTH = 4;
/** The road steers toward the guide point this far ahead of the nearest one, which rounds off sharp corners. */
const LOOKAHEAD_POINTS = Math.round(2.5 / GUIDE_STEP);
const SEARCH_POINTS = Math.round(3 / GUIDE_STEP);
/**
 * Where the picture runs straight, the road swings from side to side instead of running straight too: it aims
 * this far to either side of the course, one full swing every `WEAVE_LENGTH` road units.
 */
const WEAVE_REACH = 1.1;
const WEAVE_LENGTH = 7;
/** A stretch of the course counts as straight from this ratio of its length as the crow flies to its length. */
const WEAVE_FROM = 0.85;
/** A last tile this close to the end of the guide sews the rest in one long stitch, so the picture is complete. */
const SNAP_POINTS = Math.round(6 / GUIDE_STEP);
/** Resizing stops once the last tile is within this distance of the end of the guide, in road units. */
const FIT_TOLERANCE = 2;
const FIT_ROUNDS = 24;
/** Until one size is known to be too small and one too large, the picture is resized by this factor. */
const FIT_STRIDE = 0.8;
/** A picture left unfinished shows more than a few last notes that have nothing left to sew. */
const UNSEWN_PENALTY = 2;

function wrap(angle: number): number {
  const turned = ((angle + Math.PI) % TAU + TAU) % TAU;
  return turned - Math.PI;
}

function positive(angle: number): number {
  const turned = ((angle % TAU) + TAU) % TAU;
  return turned < EPSILON ? TAU : turned;
}

/** The spacing drawn as a straight step: the longest interval that is still common in this chart. */
function straightInterval(times: readonly number[]): number {
  const gaps = times.slice(1).map((time, i) => time - (times[i] ?? time));
  const median = [...gaps].sort((a, b) => a - b)[gaps.length >> 1];
  if (median === undefined) return FALLBACK_UNIT_S;
  const doubles = gaps.filter((gap) => Math.abs(gap / median - 2) < 0.25).length;
  return doubles / gaps.length >= COMMON_SHARE ? median * 2 : median;
}

function paceOf(angle: number, units: number): Pace {
  const relativeSpeed = angle / Math.PI / units;
  if (relativeSpeed < SLOW_BELOW) return "slow";
  return relativeSpeed > FAST_ABOVE ? "fast" : "normal";
}

/** A road laid along one guide. `shortfall` is how much of the guide was left over; negative = tiles left over. */
type Attempt = { readonly path: Path; readonly shortfall: number };

function lay(times: readonly number[], unit: number, guide: Guide, course: Course): Attempt {
  const first = times[0] ?? 0;
  const courseAt = (index: number): Point =>
    course.points[Math.min(index, course.points.length - 1)] ?? { x: 0, y: 0 };
  const markAt = (index: number): number => course.marks[Math.min(index, course.endIndex)] ?? guide.endIndex;
  const aimAt = (index: number): Point => {
    const aim = courseAt(index + LOOKAHEAD_POINTS);
    const before = courseAt(index);
    const beyond = courseAt(index + 2 * LOOKAHEAD_POINTS);
    const chord = Math.hypot(beyond.x - before.x, beyond.y - before.y);
    const straightness = (chord / (2 * LOOKAHEAD_POINTS * GUIDE_STEP) - WEAVE_FROM) / (1 - WEAVE_FROM);
    if (straightness <= 0) return aim;
    const swing =
      WEAVE_REACH *
      Math.min(1, straightness) *
      Math.sin((TAU * (index + LOOKAHEAD_POINTS) * GUIDE_STEP) / WEAVE_LENGTH);
    return { x: aim.x - ((beyond.y - before.y) / chord) * swing, y: aim.y + ((beyond.x - before.x) / chord) * swing };
  };

  const start = courseAt(0);
  const startAim = courseAt(LOOKAHEAD_POINTS);
  let heading = Math.atan2(startAim.y - start.y, startAim.x - start.x);
  let direction = 1;
  let nearest = 0;
  let finishedAt: number | null = null;

  const tiles: Tile[] = [
    { ...start, time: first - unit },
    { x: start.x + Math.cos(heading), y: start.y + Math.sin(heading), time: first },
  ];
  const sweeps: Sweep[] = [
    {
      startAngle: heading + Math.PI,
      angle: Math.PI,
      startTime: first - unit,
      endTime: first,
      pace: "normal",
      isTwirl: false,
    },
  ];
  const anchors = [0];
  const weights = [1];
  let driftSum = 0;

  const isCrowded = (spot: Point): boolean =>
    tiles
      .slice(-OVERLAP_LOOKBACK, -1)
      .some((tile) => Math.hypot(tile.x - spot.x, tile.y - spot.y) < OVERLAP_DISTANCE);

  // Only course points just ahead are searched, so the road never jumps across to another line of the picture.
  const follow = (spot: Point): void => {
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let j = nearest; j <= nearest + SEARCH_POINTS; j++) {
      const point = courseAt(j);
      const distance = Math.hypot(point.x - spot.x, point.y - spot.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = j;
      }
    }
    driftSum += nearestDistance;
  };

  for (let i = 0; i + 1 < times.length; i++) {
    const pivot = tiles[i + 1];
    const from = times[i];
    const to = times[i + 1];
    if (pivot === undefined || from === undefined || to === undefined) break;
    const spotAt = (toward: number): Point => ({ x: pivot.x + Math.cos(toward), y: pivot.y + Math.sin(toward) });

    follow(pivot);
    anchors.push(markAt(nearest));
    if (finishedAt === null && nearest >= course.endIndex) finishedAt = i;
    const aim = aimAt(nearest);
    const target = Math.atan2(aim.y - pivot.y, aim.x - pivot.x);

    const units = Math.max(0.25, Math.round(((to - from) / unit) * 4) / 4);
    weights.push(Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, Math.sqrt(units))));
    let divisor = 1;
    while (units / divisor > MAX_UNITS_PER_SWEEP) divisor *= 2;
    const rhythmAngle = (Math.PI * units) / divisor;

    let nextHeading = heading;
    let angle = rhythmAngle;
    let isTwirl = false;
    if (Math.abs(rhythmAngle - Math.PI) < EPSILON) {
      // A straight step may bend at most a right angle toward the target, so corners never fold back sharply.
      // If going straight would land on the last few tiles, sidestepping a right angle is tried as well.
      let turn = wrap(target - heading);
      if (Math.abs(turn) > Math.PI / 2 + EPSILON) turn = Math.sign(turn) * (Math.PI / 2);
      const turns = isCrowded(spotAt(heading)) ? [turn, Math.PI / 2, -Math.PI / 2] : [turn];
      const usable = turns.find(
        (candidate) =>
          Math.abs(candidate) < EPSILON ||
          (positive(direction * (candidate - Math.PI)) >= MIN_CORNER_ANGLE &&
            positive(direction * (candidate - Math.PI)) <= MAX_CORNER_ANGLE &&
            !isCrowded(spotAt(heading + candidate))),
      );
      if (usable !== undefined && Math.abs(usable) >= EPSILON) {
        nextHeading = heading + usable;
        angle = positive(direction * (usable - Math.PI));
      }
    } else {
      const options = [direction, -direction].map((spin) => {
        const toward = heading + Math.PI + spin * rhythmAngle;
        const cost = (isCrowded(spotAt(toward)) ? 10 : 0) + Math.abs(wrap(toward - target));
        return { spin, toward, cost };
      });
      const best = options.reduce((a, b) => (b.cost < a.cost ? b : a));
      isTwirl = best.spin !== direction;
      direction = best.spin;
      nextHeading = best.toward;
    }

    sweeps.push({
      startAngle: heading + Math.PI,
      angle: direction * angle,
      startTime: from,
      endTime: to,
      pace: paceOf(angle, units),
      isTwirl,
    });
    heading = nextHeading;
    tiles.push({ ...spotAt(heading), time: to });
  }

  const lastTile = tiles[tiles.length - 1] ?? { ...start, time: first };
  sweeps.push({
    startAngle: heading + Math.PI,
    angle: direction * Math.PI,
    startTime: lastTile.time,
    endTime: lastTile.time + unit,
    pace: "normal",
    isTwirl: false,
  });
  follow(lastTile);
  if (finishedAt === null && nearest >= course.endIndex) finishedAt = times.length - 1;
  anchors.push(course.endIndex - nearest <= SNAP_POINTS ? guide.endIndex : markAt(nearest));

  const shortfall =
    finishedAt === null ? (course.endIndex - nearest) * GUIDE_STEP : finishedAt - (times.length - 1);
  return { path: { tiles, sweeps, anchors, weights, guide, drift: driftSum / tiles.length }, shortfall };
}

function badness({ shortfall }: Attempt): number {
  if (shortfall < 0) return -shortfall;
  return Math.max(0, shortfall - FIT_TOLERANCE) * UNSEWN_PENALTY;
}

/**
 * Lays one tile per note. The time between notes becomes the angle the ball sweeps, so rhythm shapes the road,
 * while the road as a whole runs along the drawing's `route`, smoothed to what a road can follow, and ends up
 * sewing that picture.
 *
 * How much ground the notes cover depends on their rhythm, so the picture is resized and the road laid again,
 * halving the range between a size that was too small and one that was too large, until the last note lands
 * at the end of the drawing.
 */
export function buildPath(times: readonly number[], route: Route): Path {
  const unit = straightInterval(times);
  const attemptAt = (length: number): Attempt => {
    const guide = layGuide(route, length);
    return lay(times, unit, guide, layCourse(guide));
  };
  let length = Math.max(MIN_GUIDE_LENGTH, times.length * GUIDE_SHARE);
  let attempt = attemptAt(length);
  let best = attempt;
  let tooSmall = 0;
  let tooLarge = Number.POSITIVE_INFINITY;
  for (let round = 1; round < FIT_ROUNDS && badness(best) > 0 && route.length > 0; round++) {
    if (attempt.shortfall < 0) tooSmall = length;
    else tooLarge = length;
    if (tooSmall === 0) length = tooLarge * FIT_STRIDE;
    else if (tooLarge === Number.POSITIVE_INFINITY) length = tooSmall / FIT_STRIDE;
    else length = (tooSmall + tooLarge) / 2;
    attempt = attemptAt(length);
    if (badness(attempt) < badness(best)) best = attempt;
  }
  return best.path;
}

/** Before `startTime` and after `endTime` the ball simply keeps turning at the same speed. */
export function orbiterAngle(sweep: Sweep, time: number): number {
  return sweep.startAngle + (sweep.angle * (time - sweep.startTime)) / (sweep.endTime - sweep.startTime);
}

/** The camera glides along the road at the pace of the music, independent of what the player presses. */
export function cameraAt({ tiles }: Path, time: number): Point {
  let low = 0;
  let high = tiles.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if ((tiles[middle]?.time ?? Number.POSITIVE_INFINITY) <= time) low = middle;
    else high = middle - 1;
  }
  const from = tiles[low];
  const to = tiles[low + 1];
  if (from === undefined) return { x: 0, y: 0 };
  if (to === undefined) return from;
  const progress = Math.min(1, Math.max(0, (time - from.time) / (to.time - from.time)));
  return { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress };
}
