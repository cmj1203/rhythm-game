// Picture first: lays a rhythm road along a picture's outline and reads the rhythm off the road. Every note's gap
// (in beats) sets the turn at its tile, as src/rhythm-road.ts turns it with no twirls, so the outline decides the
// rhythm; gaps come in cells that fill whole beats, so the bars stay whole. The result is a gap list to compose the
// song to, and the placement that puts the played road onto the picture for the result screen.
//   bun tools/picture_rhythm.ts <picture-id> --geometry <file> --tiles 320 --out road.json
//   bun tools/picture_rhythm.ts <picture-id> --line --tiles 480 --out road.json   (along the picture's one-stroke line)
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

type State = { tiles: P[]; heading: number; along: number; gaps: number[]; cells: number[]; cost: number };
// The game's first two tiles stand one tile apart along the outline's start.
const startHeading = Math.atan2(outline[5]!.y - outline[0]!.y, outline[5]!.x - outline[0]!.x);
const start: State = {
  tiles: [outline[0]!, { x: outline[0]!.x + z * Math.cos(startHeading), y: outline[0]!.y + z * Math.sin(startHeading) }],
  heading: startHeading,
  along: z,
  gaps: [],
  cells: [],
  cost: 0,
};

let beam: State[] = [start];
const finished: State[] = [];
const BEAM = Number(args.beam);
for (let round = 0; round < 2000 && beam.length > 0; round++) {
  const next: State[] = [];
  for (const state of beam) {
    for (const [c, cell] of CELLS.entries()) {
      let { heading, along } = state;
      const tiles = [...state.tiles];
      let cost = state.cost + cell.cost;
      let ok = true;
      for (const gap of cell.gaps) {
        heading += Math.PI + sweepAngle(gap);
        const pivot = tiles.at(-1)!;
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
      const done = { tiles, heading, along, gaps: [...state.gaps, ...cell.gaps], cells: [...state.cells, c], cost };
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
  if (finished.length >= 20) break;
}
finished.sort((a, b) => a.cost - b.cost);
const best = finished[0];
if (best === undefined) throw new RangeError("no road reached the end of the outline");

// Check against the game: the same gaps at one beat a second, laid with no twirls, must give the same shape.
const times = [0];
for (const gap of best.gaps) times.push(times.at(-1)! + gap);
const played = buildRhythmPath(times, [[0, 60]], undefined, [], []);
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
const result = {
  picture: pictureId,
  tile: z,
  notes: best.gaps.length + 1,
  beats,
  offLineTiles: +offLine.toFixed(3),
  gaps: best.gaps,
  cells: best.cells.map((c) => CELLS[c]!.gaps),
  piece: { from: 0, scale, angle, x, y },
  tiles: best.tiles,
  outline,
};
console.log(`ROAD ${pictureId}: ${result.notes} notes over ${beats} beats, off the outline ${result.offLineTiles} tiles on average`);
if (args.out !== undefined) await writeFile(args.out, JSON.stringify(result));
