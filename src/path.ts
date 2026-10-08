import type { Point } from "./canvas";
import type { Route } from "./drawing";
import { type Course, GUIDE_STEP, type Guide, layCourse, layGuide } from "./guide";

export type Pace = "normal" | "fast" | "slow";

/** A stepping stone, in units of the distance between neighbours. `time` is when the ball must land on it. */
export type Tile = { readonly x: number; readonly y: number; readonly time: number };

/**
 * How the orbiting ball travels around tile i on its way to tile i + 1.
 * Angles are radians in screen space, positive = clockwise. `angle` is signed by rotation direction.
 * The ball turns half a circle a beat whichever way the road bends, so its turning keeps time with the music.
 * It ends each sweep on tile i + 1, and so begins it wherever half a circle a beat puts it: near the tile it
 * came from, but not on it where the road bends. Only a wait of more than `MAX_UNITS_PER_SWEEP` beats is
 * turned through at half that speed or less; that sweep is "slow". Through a busy stretch, a run of notes at
 * most half a beat apart, the ball turns exactly twice as fast, half a circle every half beat; those sweeps are
 * "fast". Either way its turning stays locked to the beat.
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
/** Gaps up to this ratio longer than the average of a group still count as the same interval. */
const SAME_INTERVAL = 1.06;
const MAX_UNITS_PER_SWEEP = 1.5;
/**
 * At least this many gaps in a row of at most `FAST_MAX_UNITS` beats make a busy stretch the ball turns twice as
 * fast through, unless half a beat is shorter than `MIN_FAST_HALF_TURN_S`, when twice as fast would be a blur.
 */
const FAST_RUN_MIN = 6;
const FAST_MAX_UNITS = 0.5;
const MIN_FAST_HALF_TURN_S = 0.1;
/** Steps of the usual length head in one of the eight compass directions, as on a board game. */
const COMPASS_STEP = Math.PI / 4;
/** How many steps in a row may go straight on before the road has to turn a corner. */
const MAX_STRAIGHT_STEPS = 2;
/**
 * Turning the other way round is hard to read, so the road only does it when that heads this much (radians)
 * nearer the picture, or keeps it off the last few tiles.
 */
const TWIRL_COST = Math.PI / 4;
const MIN_CORNER_ANGLE = Math.PI / 3;
const MAX_CORNER_ANGLE = TAU - Math.PI / 3;
const OVERLAP_DISTANCE = 0.95;
/** Only the last few tiles are kept clear of each other; a drawing is free to cross its own earlier lines. */
const OVERLAP_LOOKBACK = 10;
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
/**
 * The camera looks at the road as it runs within this many seconds of the moment, the nearest moments weighing most
 * and the furthest nothing. (It used to look at nine moments up to 0.6 s away; this reach rounds the corners as much.)
 */
const CAMERA_REACH_S = 0.75;

function wrap(angle: number): number {
  const turned = ((angle + Math.PI) % TAU + TAU) % TAU;
  return turned - Math.PI;
}

function positive(angle: number): number {
  const turned = ((angle % TAU) + TAU) % TAU;
  return turned < EPSILON ? TAU : turned;
}

/**
 * The spacing drawn as a straight step: the longest interval that is still common in this chart. The gaps
 * between notes are grouped into intervals that are about the same length, and the longest group holding at
 * least `COMMON_SHARE` of them wins. (A median would fall between two common intervals when a chart has about
 * as many of each, and then fit neither.)
 */
function straightInterval(times: readonly number[]): number {
  const gaps = times.slice(1).map((time, i) => time - (times[i] ?? time));
  const groups: { total: number; count: number }[] = [];
  for (const gap of [...gaps].sort((a, b) => a - b)) {
    const last = groups[groups.length - 1];
    if (last !== undefined && gap <= (last.total / last.count) * SAME_INTERVAL) {
      last.total += gap;
      last.count += 1;
    } else {
      groups.push({ total: gap, count: 1 });
    }
  }
  const common = groups.filter(({ count }) => count / gaps.length >= COMMON_SHARE);
  const chosen = common.length > 0 ? common : [...groups].sort((a, b) => b.count - a.count).slice(0, 1);
  const lengths = chosen.map(({ total, count }) => total / count);
  return lengths.length > 0 ? Math.max(...lengths) : FALLBACK_UNIT_S;
}

/** A road laid along one guide. `shortfall` is how much of the guide was left over; negative = tiles left over. */
type Attempt = { readonly path: Path; readonly shortfall: number };

function lay(times: readonly number[], unit: number, guide: Guide, course: Course): Attempt {
  const first = times[0] ?? 0;
  const unitsOf = (gap: number): number => Math.max(0.25, Math.round((gap / unit) * 4) / 4);
  // fast[i]: the gap after note i lies in a busy stretch, which the ball turns through twice as fast.
  const fast = times.slice(1).map(() => false);
  if (unit / 2 >= MIN_FAST_HALF_TURN_S) {
    let runStart = 0;
    for (let i = 0; i <= fast.length; i++) {
      const to = times[i + 1];
      const from = times[i];
      if (to !== undefined && from !== undefined && unitsOf(to - from) <= FAST_MAX_UNITS) continue;
      if (i - runStart >= FAST_RUN_MIN) fast.fill(true, runStart, i);
      runStart = i + 1;
    }
  }
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
  let heading =
    Math.round(Math.atan2(startAim.y - start.y, startAim.x - start.x) / COMPASS_STEP) * COMPASS_STEP;
  let straightSteps = 0;
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

    const units = unitsOf(to - from);
    weights.push(Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, Math.sqrt(units))));
    let divisor = 1;
    while (units / divisor > MAX_UNITS_PER_SWEEP) divisor *= 2;
    const isFast = fast[i] === true;
    const rhythmAngle = (Math.PI * units * (isFast ? 2 : 1)) / divisor;

    let nextHeading = heading;
    let isTwirl = false;
    if (Math.abs(rhythmAngle - Math.PI) < EPSILON) {
      // A step of the usual length heads in one of the eight compass directions, at most a right angle off the
      // last, so the road bends in crisp corners of 45 or 90 degrees, never folding back sharply. It takes the
      // direction nearest the target, but after `MAX_STRAIGHT_STEPS` straight on it has to turn, and it keeps
      // off the last few tiles.
      const nearestCompass = Math.round(heading / COMPASS_STEP) * COMPASS_STEP;
      const options = [-2, -1, 0, 1, 2]
        .map((k) => nearestCompass + k * COMPASS_STEP)
        .filter((toward) => {
          const turn = wrap(toward - heading);
          const sweep = positive(direction * (turn - Math.PI));
          return (
            Math.abs(turn) < EPSILON ||
            (Math.abs(turn) <= Math.PI / 2 + EPSILON && sweep >= MIN_CORNER_ANGLE && sweep <= MAX_CORNER_ANGLE)
          );
        })
        .map((toward) => {
          const isStraight = Math.abs(wrap(toward - heading)) < EPSILON;
          const cost =
            Math.abs(wrap(toward - target)) +
            (isStraight && straightSteps >= MAX_STRAIGHT_STEPS ? Math.PI : 0) +
            (isCrowded(spotAt(toward)) ? 10 : 0);
          return { toward, cost };
        });
      const best = options.reduce((a, b) => (b.cost < a.cost ? b : a), { toward: heading, cost: Number.POSITIVE_INFINITY });
      nextHeading = best.toward;
    } else {
      const options = [direction, -direction].map((spin) => {
        const toward = heading + Math.PI + spin * rhythmAngle;
        const cost =
          (isCrowded(spotAt(toward)) ? 10 : 0) + Math.abs(wrap(toward - target)) + (spin === direction ? 0 : TWIRL_COST);
        return { spin, toward, cost };
      });
      const best = options.reduce((a, b) => (b.cost < a.cost ? b : a));
      isTwirl = best.spin !== direction;
      direction = best.spin;
      nextHeading = best.toward;
    }

    sweeps.push({
      startAngle: nextHeading - direction * rhythmAngle,
      angle: direction * rhythmAngle,
      startTime: from,
      endTime: to,
      pace: divisor > 1 ? "slow" : isFast ? "fast" : "normal",
      isTwirl,
    });
    straightSteps = Math.abs(wrap(nextHeading - heading)) < EPSILON ? straightSteps + 1 : 0;
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

/**
 * When the road reaches the end of its picture a few notes early, those notes would draw nothing. The last
 * stretch of the picture is shared out among them instead, so every note draws a piece and the last note
 * finishes the picture.
 */
export function shareEnding(path: Path): Path {
  const { anchors, guide } = path;
  let first = anchors.length - 1;
  while (first > 0 && anchors[first - 1] === guide.endIndex) first--;
  const from = anchors[first - 1];
  const count = anchors.length - first;
  if (from === undefined || count <= 1) return path;
  return {
    ...path,
    anchors: anchors.map((anchor, i) =>
      i < first ? anchor : Math.round(from + ((guide.endIndex - from) * (i - first + 1)) / count),
    ),
  };
}

/** Before `startTime` and after `endTime` the ball simply keeps turning at the same speed. */
export function orbiterAngle(sweep: Sweep, time: number): number {
  return sweep.startAngle + (sweep.angle * (time - sweep.startTime)) / (sweep.endTime - sweep.startTime);
}

/**
 * A walk along the road, straight from tile to tile at the pace of the music, summed up over time, and that sum
 * summed up again, as far as each tile. From these the walker's average place over any stretch of time comes at once.
 */
type RoadSums = {
  readonly onceX: Float64Array;
  readonly onceY: Float64Array;
  readonly twiceX: Float64Array;
  readonly twiceY: Float64Array;
};

const roadSums = new WeakMap<readonly Tile[], RoadSums>();

function sumsOf(tiles: readonly Tile[]): RoadSums {
  const known = roadSums.get(tiles);
  if (known !== undefined) return known;
  const sums = {
    onceX: new Float64Array(tiles.length),
    onceY: new Float64Array(tiles.length),
    twiceX: new Float64Array(tiles.length),
    twiceY: new Float64Array(tiles.length),
  };
  for (let i = 0; i + 1 < tiles.length; i++) {
    const from = tiles[i];
    const to = tiles[i + 1];
    if (from === undefined || to === undefined) break;
    const span = to.time - from.time;
    const onceX = sums.onceX[i] ?? 0;
    const onceY = sums.onceY[i] ?? 0;
    sums.onceX[i + 1] = onceX + ((from.x + to.x) * span) / 2;
    sums.onceY[i + 1] = onceY + ((from.y + to.y) * span) / 2;
    sums.twiceX[i + 1] = (sums.twiceX[i] ?? 0) + onceX * span + ((2 * from.x + to.x) * span ** 2) / 6;
    sums.twiceY[i + 1] = (sums.twiceY[i] ?? 0) + onceY * span + ((2 * from.y + to.y) * span ** 2) / 6;
  }
  roadSums.set(tiles, sums);
  return sums;
}

/**
 * The walker's place summed up twice over time, until `time`. Before the first tile and after the last, the walker
 * stands still on it.
 */
function twiceSummedAt(tiles: readonly Tile[], sums: RoadSums, time: number): Point {
  let low = 0;
  let high = tiles.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if ((tiles[middle]?.time ?? Number.POSITIVE_INFINITY) <= time) low = middle;
    else high = middle - 1;
  }
  const from = tiles[low];
  if (from === undefined) return { x: 0, y: 0 };
  const to = tiles[low + 1] ?? from;
  const since = time - from.time;
  const span = to.time - from.time;
  // What the steps toward the next tile add: nothing while the walker stands still.
  const strides = since > 0 && span > 0 ? since ** 3 / (6 * span) : 0;
  return {
    x: (sums.twiceX[low] ?? 0) + (sums.onceX[low] ?? 0) * since + (from.x * since ** 2) / 2 + (to.x - from.x) * strides,
    y: (sums.twiceY[low] ?? 0) + (sums.onceY[low] ?? 0) * since + (from.y * since ** 2) / 2 + (to.y - from.y) * strides,
  };
}

/**
 * The camera glides along the road at the pace of the music, independent of what the player presses. It looks at
 * the road around `time` rather than at `time` alone, the moments nearest weighing most, so it sweeps through the
 * corners in one smooth curve. It weighs every moment within reach, not a few picked ones: with a few, the camera's
 * speed jumped each time one of them passed a corner, and the screen shook where tiles are close and the road keeps
 * bending. (The weights fall off evenly to nothing at the reach, which makes the average the second difference of
 * the road summed up twice.)
 */
export function cameraAt({ tiles }: Path, time: number): Point {
  const sums = sumsOf(tiles);
  const before = twiceSummedAt(tiles, sums, time - CAMERA_REACH_S);
  const at = twiceSummedAt(tiles, sums, time);
  const after = twiceSummedAt(tiles, sums, time + CAMERA_REACH_S);
  return {
    x: (before.x - 2 * at.x + after.x) / CAMERA_REACH_S ** 2,
    y: (before.y - 2 * at.y + after.y) / CAMERA_REACH_S ** 2,
  };
}
