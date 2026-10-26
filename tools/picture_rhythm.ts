// Picture first: lays a rhythm road along a picture's outline and reads the rhythm off the road. Every note's gap
// (in beats) sets the turn at its tile, as src/rhythm-road.ts turns it with no twirls, so the outline decides the
// rhythm; gaps come in cells that fill whole beats, so the bars stay whole. The result is a gap list to compose the
// song to, and the placement that puts the played road onto the picture for the result screen.
//   bun tools/picture_rhythm.ts <picture-id> --geometry <file> --tiles 320 --out road.json
//   bun tools/picture_rhythm.ts <picture-id> --line --tiles 480 --out road.json   (along the picture's one-stroke line)
//   --grid: whole bars from a few rhythm patterns, each bar preferring to repeat the one before, so the rhythm can be
//   learnt by ear; the road keeps to the line less exactly. Where the last bars close into a loop, it may walk the
//   loop once more with the same rhythm, on over the very same tiles, as Last Fortress does (`repeats` in the output).
//   --no-loops: no loops and no repeat signs.
//   --midspin: where the line comes to a sharp point, a note may be a midspin (src/rhythm-road.ts): the crayon touches
//   the point and swings on around the tile before, so the road goes out to the point and back at no beat, and a plain
//   gap turns the road sharply. Allowed only where the line itself turns by `--sharp` degrees or more within a tile.
//   --breaths <fractions>: with --grid, a bar crossing one of these places on the line (where the song moves to its
//   next part) may end on a pause: its last note's rest is spent in an extra turn of the crayon (2 beats), so the
//   band can breathe there while the road turns as if there were no rest (`pauses` in the output).
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { buildRhythmPath } from "../src/rhythm-road";

const { positionals, values: args } = parseArgs({
  allowPositionals: true,
  options: {
    geometry: { type: "string" },
    tiles: { type: "string", default: "320" },
    out: { type: "string" },
    beam: { type: "string", default: "300" },
    reverse: { type: "boolean", default: false },
    line: { type: "boolean", default: false },
    grid: { type: "boolean", default: false },
    repeat: { type: "string", default: "1.2" },
    sign: { type: "string", default: "0" },
    "no-loops": { type: "boolean", default: false },
    midspin: { type: "boolean", default: false },
    sharp: { type: "string", default: "140" },
    "midspin-cost": { type: "string", default: "1" },
    breaths: { type: "string" },
    rests: { type: "string", default: "slow" },
  },
});
const pictureId = positionals[0];
if (pictureId === undefined || (args.geometry === undefined && !args.line)) throw new TypeError("usage: picture_rhythm.ts <picture-id> (--geometry <file> | --line)");

type P = { x: number; y: number };
type Mask = { cells: P[]; step: number };
async function maskOf(id: string): Promise<Mask> {
  const geometry = JSON.parse(await readFile(args.geometry!, "utf8")) as { pictures: { id: string; mask: Mask }[] };
  const picture = geometry.pictures.find((p) => p.id === id);
  if (picture === undefined) throw new RangeError(`no picture ${id}`);
  return picture.mask;
}

/** The outer outline of the filled cells, traced cell by cell and smoothed (as tools/picture_road.ts does). */
function silhouette({ cells, step }: Mask): P[] {
  const n = Math.round(100 / step) + 2;
  const on = new Uint8Array(n * n);
  for (const c of cells) on[(Math.floor(c.y / step) + 1) * n + Math.floor(c.x / step) + 1] = 1;
  const isOn = (x: number, y: number) => x >= 0 && y >= 0 && x < n && y < n && on[y * n + x] === 1;
  let sx = -1, sy = -1;
  for (let y = 0; y < n && sx < 0; y++) for (let x = 0; x < n; x++) if (isOn(x, y)) { sx = x; sy = y; break; }
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]] as const;
  const loop: P[] = [];
  let x = sx, y = sy, d = 6;
  do {
    loop.push({ x: (x - 0.5) * step, y: (y - 0.5) * step });
    let found = false;
    for (let k = 0; k < 8; k++) {
      const nd = (d + 6 + k) % 8;
      const [dx, dy] = dirs[nd]!;
      if (isOn(x + dx, y + dy)) { x += dx; y += dy; d = nd; found = true; break; }
    }
    if (!found) break;
  } while ((x !== sx || y !== sy) && loop.length < 20000);
  return loop.map((_, i) => {
    let ax = 0, ay = 0;
    for (let k = -4; k <= 4; k++) { const q = loop[(i + k + loop.length) % loop.length]!; ax += q.x; ay += q.y; }
    return { x: ax / 9, y: ay / 9 };
  });
}

/** The picture's one-stroke line (public/pictures/<id>.svg, M/L/C/Q commands) as a polyline, from its first point. */
async function strokeOf(id: string): Promise<P[]> {
  const svg = await readFile(new URL(`../public/pictures/${id}.svg`, import.meta.url), "utf8");
  const paths = [...svg.matchAll(/ d="([^"]+)"/g)];
  if (paths.length !== 1) throw new RangeError(`${id}: --line needs a picture drawn as one path, found ${paths.length}`);
  const tokens = paths[0]![1]!.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g)!;
  const points: P[] = [];
  let cur: P = { x: 0, y: 0 }, cmd = "", i = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i]!)) cmd = tokens[i++]!;
    if (cmd === "M" || cmd === "L") {
      cur = { x: num(), y: num() };
      points.push(cur);
      cmd = "L";
    } else if (cmd === "C" || cmd === "Q") {
      const c = Array.from({ length: cmd === "C" ? 6 : 4 }, num);
      const p0 = cur;
      for (let k = 1; k <= 20; k++) {
        const s = k / 20, u = 1 - s;
        points.push(cmd === "C"
          ? { x: u ** 3 * p0.x + 3 * u * u * s * c[0]! + 3 * u * s * s * c[2]! + s ** 3 * c[4]!, y: u ** 3 * p0.y + 3 * u * u * s * c[1]! + 3 * u * s * s * c[3]! + s ** 3 * c[5]! }
          : { x: u * u * p0.x + 2 * u * s * c[0]! + s * s * c[2]!, y: u * u * p0.y + 2 * u * s * c[1]! + s * s * c[3]! });
      }
      cur = { x: c.at(-2)!, y: c.at(-1)! };
    } else throw new RangeError(`${id}: path command ${cmd} not read`);
  }
  return points;
}

// With --line, the picture's own one-stroke line from its start; otherwise the outline as a closed polyline from its
// topmost point. Either way a polyline with arc lengths.
let outline: P[];
if (args.line) {
  outline = await strokeOf(pictureId);
  if (args.reverse) outline = outline.reverse();
} else {
  outline = silhouette(await maskOf(pictureId));
  if (args.reverse) outline = outline.reverse();
  const top = outline.reduce((best, p, i) => (p.y < outline[best]!.y ? i : best), 0);
  outline = [...outline.slice(top), ...outline.slice(0, top)];
  outline.push(outline[0]!);
}
const arc = [0];
for (let i = 1; i < outline.length; i++) arc.push(arc[i - 1]! + Math.hypot(outline[i]!.x - outline[i - 1]!.x, outline[i]!.y - outline[i - 1]!.y));
const length = arc.at(-1)!;
const z = length / Number(args.tiles);

/** The point of the outline `s` along it. */
function pointAt(s: number): P {
  const t = Math.max(0, Math.min(length, s));
  let lo = 0, hi = arc.length - 1;
  while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (arc[mid]! <= t) lo = mid; else hi = mid; }
  const a = outline[lo]!, b = outline[hi]!;
  const u = (t - arc[lo]!) / (arc[hi]! - arc[lo]! || 1);
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}
/** How sharply (degrees) the outline turns at `s`: between its heading over the tile before and the tile after. */
function sharpnessAt(s: number): number {
  const back = pointAt(s - z), here = pointAt(s), ahead = pointAt(s + z);
  const a = Math.atan2(here.y - back.y, here.x - back.x), b = Math.atan2(ahead.y - here.y, ahead.x - here.x);
  return Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a))) * 180 / Math.PI;
}
/** The sharpest turn of the outline within half a tile of `s`. */
function sharpestNear(s: number): number {
  let best = 0;
  for (let k = -2; k <= 2; k++) best = Math.max(best, sharpnessAt(s + k * z / 4));
  return best;
}
const SHARP = Number(args.sharp);
const MIDSPIN_COST = Number(args["midspin-cost"]);
const BREATHS = (args.breaths ?? "").split(",").filter(Boolean).map((f) => Number(f) * length);
/** A pause bar where the song needs a breath is wanted (it costs less than nothing); elsewhere it is not used. */
const BREATH_COST = -4;
/** What a bar with a rest costs anywhere else, with --rests pause: as much as a slow rest bar. */
const REST_COST = 3;

/** Turns as src/rhythm-road.ts sweeps them: a gap of `units` beats sweeps PI*units, halved until it is 2PI or less. */
function sweepAngle(units: number): number {
  let divisor = 1;
  while (units / divisor > 2) divisor *= 2;
  return (Math.PI * units) / divisor;
}

/**
 * Rhythm cells, each ending on an eighth note, triplets and sixteenths kept together until the beat is whole again.
 * With the crayon always turning the same way, a gap g turns (g - 1) * 180 degrees: 1/2 and 3/2 turn 90 one way or the
 * other, 3/4 and 5/4 turn 45, 2/3 and 4/3 turn 60, 1 goes straight. A whole number of beats over as many tiles can
 * only turn by half turns, so single eighths and dotted quarters are what let the road turn a quarter. `cost` keeps
 * the plain cells the easiest to choose; rests (gaps of 3 and 4 beats) cost the most.
 */
const CELLS: { gaps: number[]; cost: number }[] = [
  { gaps: [1], cost: 0 },
  { gaps: [1 / 2], cost: 0.05 },
  { gaps: [3 / 2], cost: 0.1 },
  { gaps: [3 / 4, 3 / 4], cost: 0.1 },
  { gaps: [5 / 4, 5 / 4], cost: 0.15 },
  { gaps: [1 / 2, 1 / 2], cost: 0.05 },
  { gaps: [1 / 2, 3 / 2], cost: 0.1 },
  { gaps: [3 / 2, 1 / 2], cost: 0.1 },
  { gaps: [2 / 3, 2 / 3, 2 / 3], cost: 0.1 },
  { gaps: [2 / 3, 4 / 3], cost: 0.15 },
  { gaps: [4 / 3, 2 / 3], cost: 0.15 },
  { gaps: [4 / 3, 4 / 3, 4 / 3], cost: 0.2 },
  { gaps: [3 / 4, 3 / 4, 1 / 2], cost: 0.1 },
  { gaps: [3 / 4, 5 / 4], cost: 0.1 },
  { gaps: [5 / 4, 3 / 4], cost: 0.1 },
  { gaps: [5 / 4, 5 / 4, 3 / 2], cost: 0.2 },
  { gaps: [3 / 2, 3 / 2, 1], cost: 0.2 },
  { gaps: [3], cost: 3 },
  { gaps: [4], cost: 3 },
];

/**
 * With --grid, whole bars (four beats) from these patterns only: halves, beats, dotted beats and the dotted-eighth
 * pairs that turn the road 45 degrees, plus bars with a rest. No triplets. A bar unlike the one before it costs
 * `--repeat` (`SWITCH_COST`), and unlike the one two bars before half as much again, so bars come in twos and fours.
 */
const BAR_PATTERNS: { gaps: number[]; cost: number }[] = [
  { gaps: [1, 1, 1, 1], cost: 0 },
  { gaps: [1, 1, 1 / 2, 1 / 2, 1], cost: 0.05 },
  { gaps: [1, 1 / 2, 1 / 2, 1, 1], cost: 0.05 },
  { gaps: [1 / 2, 1 / 2, 1, 1 / 2, 1 / 2, 1], cost: 0.05 },
  { gaps: [1 / 2, 1, 1 / 2, 1, 1], cost: 0.05 },
  { gaps: [1, 1, 1 / 2, 1 / 2, 1 / 2, 1 / 2], cost: 0.05 },
  { gaps: [1 / 2, 1 / 2, 1 / 2, 1 / 2, 1, 1], cost: 0.05 },
  { gaps: [1 / 2, 1 / 2, 1 / 2, 1 / 2, 1 / 2, 1 / 2, 1 / 2, 1 / 2], cost: 0.1 },
  { gaps: [3 / 2, 3 / 2, 1], cost: 0.1 },
  { gaps: [1, 3 / 2, 3 / 2], cost: 0.1 },
  { gaps: [3 / 2, 3 / 2, 1 / 2, 1 / 2], cost: 0.1 },
  { gaps: [1 / 2, 3 / 2, 1 / 2, 3 / 2], cost: 0.1 },
  { gaps: [3 / 2, 1 / 2, 3 / 2, 1 / 2], cost: 0.1 },
  { gaps: [3 / 2, 1 / 2, 1, 1], cost: 0.1 },
  { gaps: [1, 1, 3 / 2, 1 / 2], cost: 0.1 },
  { gaps: [3 / 4, 5 / 4, 3 / 4, 5 / 4], cost: 0.15 },
  { gaps: [5 / 4, 3 / 4, 5 / 4, 3 / 4], cost: 0.15 },
  { gaps: [3 / 4, 3 / 4, 1 / 2, 3 / 4, 3 / 4, 1 / 2], cost: 0.15 },
  { gaps: [3 / 4, 3 / 4, 1 / 2, 1, 1], cost: 0.15 },
  { gaps: [1, 1, 3 / 4, 3 / 4, 1 / 2], cost: 0.15 },
  { gaps: [1, 3 / 4, 5 / 4, 1], cost: 0.15 },
  { gaps: [3, 1], cost: 3 },
  { gaps: [1, 3], cost: 3 },
  { gaps: [1 / 2, 1 / 2, 3], cost: 3 },
];
/**
 * With --grid, loops as Last Fortress walks them: a bar that closes on itself (four half beats make a square, two
 * halves, a beat, two halves and a beat a two-by-one box), walked twice in a row, so the second time round the
 * crayon steps on the very tiles it just laid, with the road unbroken. The loop leaves the picture's line for its
 * length, so only the first round is measured against it.
 */
const LOOPS: { gaps: number[]; cost: number }[] = [
  { gaps: [1 / 2, 1 / 2, 1 / 2, 1 / 2], cost: 0.2 },
  { gaps: [1 / 2, 1 / 2, 1, 1 / 2, 1 / 2, 1], cost: 0.2 },
  { gaps: [1, 1 / 2, 1 / 2, 1, 1 / 2, 1 / 2], cost: 0.2 },
];
/** With --grid and --breaths: bars whose last note is a pause, its gap the rest of the bar (an extra turn, 2 beats). */
const PAUSE_BARS: { gaps: number[]; cost: number }[] = [
  { gaps: [1, 3], cost: 0 },
  { gaps: [1 / 2, 1 / 2, 3], cost: 0 },
  { gaps: [3 / 2, 5 / 2], cost: 0 },
  { gaps: [1 / 2, 7 / 2], cost: 0 },
  { gaps: [1, 1, 1 / 2, 5 / 2], cost: 0.05 },
  { gaps: [1, 1 / 2, 5 / 2], cost: 0.05 },
  { gaps: [1 / 2, 1, 5 / 2], cost: 0.05 },
  { gaps: [1 / 2, 1 / 2, 1 / 2, 5 / 2], cost: 0.05 },
];
const SWITCH_COST = Number(args.repeat);
const SWITCH_COST_TWO_BACK = SWITCH_COST / 2;
/**
 * A repeat sign walks the last `REPEAT_BARS` bars again; it costs `--sign` (less than nothing to ask for them) and
 * may follow the last one only after `REPEAT_GAP_BARS` fresh bars.
 */
const REPEAT_BARS = 2;
const REPEAT_GAP_BARS = 4;
const SIGN_COST = Number(args.sign);
/**
 * --rests, with --grid: "slow" keeps the bars with a rest, turned slowly; "none" drops them; "pause" drops them too,
 * and any bar may end on a pause instead, at what a rest bar costs, so a rest never slows the crayon or bends the road.
 */
const RESTS = args.rests;
if (!["slow", "none", "pause"].includes(RESTS)) throw new TypeError("--rests must be slow, none or pause");
const PIECES = args.grid ? BAR_PATTERNS.filter(({ gaps }) => RESTS === "slow" || gaps.every((gap) => gap <= 2)) : CELLS;

/** With --grid, what a bar costs beyond its own: more for one unlike the bar before, and the one before that. */
function switchCost(cells: number[], c: number): number {
  if (!args.grid) return 0;
  return (cells.at(-1) !== undefined && cells.at(-1) !== c ? SWITCH_COST : 0)
    + (cells.at(-2) !== undefined && cells.at(-2) !== c ? SWITCH_COST_TWO_BACK : 0);
}

const d2 = (a: P, b: P) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
/** The nearest point of the outline to `p` within arc lengths `from` to `to`, as [arc length, squared distance]. */
function nearest(p: P, from: number, to: number): [number, number] {
  let best: [number, number] = [from, Infinity];
  let lo = 0;
  while (lo < arc.length - 1 && arc[lo + 1]! < from) lo++;
  for (let i = lo; i < outline.length - 1 && arc[i]! <= to; i++) {
    const a = outline[i]!, b = outline[i + 1]!;
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    const q = { x: a.x + dx * t, y: a.y + dy * t };
    const dd = d2(p, q);
    if (dd < best[1]) best = [arc[i]! + (arc[i + 1]! - arc[i]!) * t, dd];
  }
  return best;
}

type Repeat = { from: number; count: number };
type State = {
  tiles: P[]; heading: number; along: number; gaps: number[]; cells: number[]; cost: number;
  barTiles: number[]; repeats: Repeat[]; freshBars: number;
  /** Note indices: midspins (with how sharp the line is there) and pauses. */
  midspins: { note: number; sharp: number }[]; pauses: number[];
};
// The game's first two tiles stand one tile apart along the outline's start.
const startHeading = Math.atan2(outline[5]!.y - outline[0]!.y, outline[5]!.x - outline[0]!.x);
const start: State = {
  tiles: [outline[0]!, { x: outline[0]!.x + z * Math.cos(startHeading), y: outline[0]!.y + z * Math.sin(startHeading) }],
  heading: startHeading,
  along: z,
  gaps: [],
  cells: [],
  cost: 0,
  barTiles: [],
  repeats: [],
  freshBars: 0,
  midspins: [],
  pauses: [],
};

/**
 * The state after walking the last bars once more, if they close into a loop: stepped on from the last tile with
 * the same gaps, the crayon lands on each of their tiles again, with no jump, as the road keeps going. One or two
 * bars, whichever closes.
 */
function repeated(state: State): State | null {
  if (!args.grid || args["no-loops"] || state.freshBars < REPEAT_GAP_BARS) return null;
  for (const bars of [1, REPEAT_BARS]) {
    if (state.barTiles.length < bars) continue;
    const count = state.barTiles.slice(-bars).reduce((sum, n) => sum + n, 0);
    const stretch = state.tiles.slice(-count);
    const gaps = state.gaps.slice(-count);
    let heading = state.heading;
    let at = state.tiles.at(-1)!;
    const closes = gaps.every((gap, k) => {
      heading += Math.PI + sweepAngle(gap);
      at = { x: at.x + z * Math.cos(heading), y: at.y + z * Math.sin(heading) };
      return Math.sqrt(d2(at, stretch[k]!)) < 0.02 * z;
    });
    if (closes) return walkAgain(state, bars, count, stretch, gaps, heading);
  }
  return null;
}

function walkAgain(state: State, bars: number, count: number, stretch: P[], gaps: number[], heading: number): State {
  return {
    ...state,
    heading,
    tiles: [...state.tiles, ...stretch],
    gaps: [...state.gaps, ...gaps],
    cells: [...state.cells, ...state.cells.slice(-bars)],
    cost: state.cost + SIGN_COST,
    barTiles: [...state.barTiles, ...state.barTiles.slice(-bars)],
    repeats: [...state.repeats, { from: state.tiles.length - count - 1, count }],
    freshBars: 0,
  };
}

let beam: State[] = [start];
const finished: State[] = [];
const BEAM = Number(args.beam);
let firstDone = -1;
for (let round = 0; round < 2000 && beam.length > 0; round++) {
  const next: State[] = [];
  for (const state of beam) {
    const again = repeated(state);
    if (again !== null) next.push(again);
    if (args.grid && !args["no-loops"] && state.freshBars >= REPEAT_GAP_BARS) {
      for (const loop of LOOPS) {
        let { heading } = state;
        const tiles = [...state.tiles];
        let cost = state.cost + loop.cost + SIGN_COST;
        for (const gap of loop.gaps) {
          heading += Math.PI + sweepAngle(gap);
          const pivot = tiles.at(-1)!;
          const tile = { x: pivot.x + z * Math.cos(heading), y: pivot.y + z * Math.sin(heading) };
          cost += 3 * nearest(tile, state.along - 2 * z, state.along + 2 * z)[1] / (z * z);
          tiles.push(tile);
        }
        const firstRound = tiles.slice(state.tiles.length);
        // The second round lands on the first round's tiles, with the same turns.
        for (const gap of loop.gaps) heading += Math.PI + sweepAngle(gap);
        const from = state.gaps.length + 1;
        const looped: State = {
          tiles: [...tiles, ...firstRound],
          heading,
          along: state.along,
          gaps: [...state.gaps, ...loop.gaps, ...loop.gaps],
          cells: [...state.cells, -1, -1],
          cost,
          barTiles: [...state.barTiles, loop.gaps.length, loop.gaps.length],
          repeats: [...state.repeats, { from, count: loop.gaps.length }],
          freshBars: 0,
          midspins: state.midspins,
          pauses: state.pauses,
        };
        next.push(looped);
      }
    }
    // A bar of this piece may end on a pause where it crosses a breath; any one note of it (none twice running) may
    // be a midspin where the line is sharp. Each piece is tried plain, and with each of those.
    const options: { c: number; cell: { gaps: number[]; cost: number }; spinAt: number; pause: boolean }[] = [];
    // A breath is near when its place on the line is within this bar, give or take two tiles; one pause per breath.
    const pausedLately = state.cells.slice(-4).some((c) => c >= PIECES.length);
    const crossesBreath = (end: number) => !pausedLately && BREATHS.some((b) => state.along - 2 * z < b && b <= end + 2 * z);
    for (const [c, cell] of PIECES.entries()) {
      options.push({ c, cell, spinAt: -1, pause: false });
      if (args.midspin) for (let j = 0; j < cell.gaps.length; j++) options.push({ c, cell, spinAt: j, pause: false });
    }
    if (args.grid && (BREATHS.length > 0 || RESTS === "pause")) {
      for (const [p, cell] of PAUSE_BARS.entries()) options.push({ c: PIECES.length + p, cell, spinAt: -1, pause: true });
    }
    for (const { c, cell, spinAt, pause } of options) {
      let { heading, along } = state;
      const tiles = [...state.tiles];
      let cost = state.cost + cell.cost + switchCost(state.cells, c);
      let ok = true;
      const midspins = state.midspins;
      let spun: { note: number; sharp: number } | null = null;
      for (const [j, gap] of cell.gaps.entries()) {
        let pivot = tiles.at(-1)!;
        if (j === spinAt) {
          // The note before this gap is touched in passing: the line must come to a point there, and the crayon
          // keeps turning around the tile before it.
          const note = state.gaps.length + j;
          const sharp = sharpestNear(nearest(pivot, along - 0.5 * z, along + 0.5 * z)[0]);
          if (note < 2 || sharp < SHARP || midspins.at(-1)?.note === note - 1) { ok = false; break; }
          spun = { note, sharp: Math.round(sharp) };
          pivot = tiles.at(-2)!;
          heading += sweepAngle(gap);
          cost += MIDSPIN_COST;
        } else {
          const last = pause && j === cell.gaps.length - 1;
          heading += Math.PI + sweepAngle(last ? gap - 2 : gap);
        }
        const tile = { x: pivot.x + z * Math.cos(heading), y: pivot.y + z * Math.sin(heading) };
        const [at, dd] = nearest(tile, along - 0.3 * z, along + 2.5 * z);
        const advance = at - along;
        if (advance < -0.2 * z) { ok = false; break; }
        cost += 3 * dd / (z * z) + 0.6 * (advance - 0.85 * z) ** 2 / (z * z);
        // Never stand on a spot the road has already passed: a second pass hides the first one's markers.
        for (let k = Math.max(0, tiles.length - 60); k < tiles.length - 1; k++) if (d2(tiles[k]!, tile) < 0.36 * z * z) { cost += 25; }
        tiles.push(tile);
        along = Math.max(along, at);
      }
      if (!ok) continue;
      if (pause) {
        if (crossesBreath(along)) cost += BREATH_COST;
        else if (RESTS === "pause") cost += REST_COST;
        else continue;
      }
      const done: State = {
        tiles, heading, along, gaps: [...state.gaps, ...cell.gaps], cells: [...state.cells, c], cost,
        barTiles: [...state.barTiles, cell.gaps.length], repeats: state.repeats, freshBars: state.freshBars + 1,
        midspins: spun === null ? midspins : [...midspins, spun],
        pauses: pause ? [...state.pauses, state.gaps.length + cell.gaps.length - 1] : state.pauses,
      };
      if (along >= length - 1.2 * z) finished.push(done);
      else next.push(done);
    }
  }
  // Keep the cheapest per progress, so slow-but-cheap states do not crowd out the ones that keep moving.
  next.sort((a, b) => a.cost / Math.max(1, a.along) - b.cost / Math.max(1, b.along));
  const seen = new Set<string>();
  beam = [];
  for (const s of next) {
    const p = s.tiles.at(-1)!;
    const key = `${Math.round(p.x / z * 3)},${Math.round(p.y / z * 3)},${Math.round((((s.heading % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) * 4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    beam.push(s);
    if (beam.length >= BEAM) break;
  }
  if (finished.length > 0 && firstDone < 0) firstDone = round;
  // Pause bars take four beats over two tiles, so a road with its breaths reaches the end some bars after the first.
  if (finished.length >= 20 && (BREATHS.length === 0 || round - firstDone >= 8)) break;
}
finished.sort((a, b) => a.cost - b.cost);
const best = finished[0];
if (best === undefined) throw new RangeError("no road reached the end of the outline");

// Check against the game: the same gaps at one beat a second, laid with no twirls, must give the same shape.
const times = [0];
for (const gap of best.gaps) times.push(times.at(-1)! + gap);
const played = buildRhythmPath(times, [[0, 60]], undefined, [], [], {
  pauses: best.pauses,
  midspins: best.midspins.map(({ note }) => note),
});
const a = played.tiles[0]!, b = played.tiles[1]!;
const A = best.tiles[0]!, B = best.tiles[1]!;
const scale = Math.hypot(B.x - A.x, B.y - A.y) / Math.hypot(b.x - a.x, b.y - a.y);
const angle = Math.atan2(B.y - A.y, B.x - A.x) - Math.atan2(b.y - a.y, b.x - a.x);
const cos = Math.cos(angle), sin = Math.sin(angle);
const x = A.x - scale * (a.x * cos - a.y * sin), y = A.y - scale * (a.x * sin + a.y * cos);
let worst = 0;
played.tiles.forEach((tile, i) => {
  const want = best.tiles[i]!;
  worst = Math.max(worst, Math.hypot(x + scale * (tile.x * cos - tile.y * sin) - want.x, y + scale * (tile.x * sin + tile.y * cos) - want.y));
});
if (played.tiles.length !== best.tiles.length || worst > 1e-6 * z) throw new RangeError(`game lays it differently: off by ${worst}`);

const offLine = best.tiles.map((t) => Math.sqrt(nearest(t, 0, length)[1])).reduce((s, v) => s + v, 0) / best.tiles.length / z;
const beats = best.gaps.reduce((s, g) => s + g, 0);
// How far along the line each tile stands (0 to 1), followed forward the way the search walked it.
let walked = 0;
const sourceOf = new Map<number, number>();
for (const { from, count } of best.repeats) for (let k = 0; k < count; k++) sourceOf.set(from + count + k + 1, from + k + 1);
const fractions: number[] = [];
best.tiles.forEach((t, i) => {
  const source = sourceOf.get(i);
  if (source !== undefined) {
    fractions.push(fractions[source]!);
    return;
  }
  walked = Math.max(walked, nearest(t, walked - 0.3 * z, walked + 2.5 * z)[0]);
  fractions.push(+(walked / length).toFixed(4));
});
const result = {
  picture: pictureId,
  tile: z,
  notes: best.gaps.length + 1,
  beats,
  offLineTiles: +offLine.toFixed(3),
  gaps: best.gaps,
  cells: best.cells.map((c) => PIECES[c]?.gaps ?? PAUSE_BARS[c - PIECES.length]?.gaps ?? "loop"),
  midspins: best.midspins,
  pauses: best.pauses,
  piece: { from: 0, scale, angle, x, y },
  tiles: best.tiles,
  fractions,
  repeats: best.repeats,
  outline,
};
console.log(`ROAD ${pictureId}: ${result.notes} notes over ${beats} beats, off the outline ${result.offLineTiles} tiles on average, ${best.repeats.length} repeat signs, `
  + `midspins ${JSON.stringify(best.midspins)}, pauses ${JSON.stringify(best.pauses)}`);
if (args.out !== undefined) await writeFile(args.out, JSON.stringify(result));
