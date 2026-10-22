// Lays a rhythm chart's road over a picture's silhouette, keeping every note time and turn angle:
// the road is cut at its rests, each piece gets its own size (a tile's length in picture units) and lands
// anywhere after its rest, and the crayon's twirls are chosen to follow the outline.
//   bun tools/picture_road.ts <song-id> --geometry <file> [--only a,b] [--out results.json]   ranks pictures
//   bun tools/picture_road.ts <song-id> --geometry <file> --write <picture-id>               sets chart.picture
// The geometry file comes from tools/picture_geometry.mjs (then --join). Pick the animal with the highest closeness
// among the clean drawings (inkRatio 3.3 or less: the spinosaurus at 3.2 left the road clear, the manatee at 3.43
// scribbled over it). Last Fortress got the hummingbird this way on 2026-10-22.
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { chartSchema } from "../src/chart";
import { buildRhythmPath } from "../src/rhythm-road";
import { beatsBetween } from "../src/tempo";

const { positionals, values: args } = parseArgs({
  allowPositionals: true,
  options: {
    geometry: { type: "string" },
    only: { type: "string" },
    out: { type: "string" },
    write: { type: "string" },
    cap: { type: "string", default: "30" },
    shard: { type: "string", default: "0" },
    shards: { type: "string", default: "1" },
  },
});
const songId = positionals[0];
if (songId === undefined || args.geometry === undefined) throw new TypeError("usage: picture_road.ts <song-id> --geometry <file>");
const chartFile = new URL(`../public/songs/${songId}/chart.json`, import.meta.url);
const data = JSON.parse(await readFile(chartFile, "utf8")) as Record<string, unknown>;

type P = { x: number; y: number };
const chart = chartSchema.parse(data);
type Mask = { cells: P[]; step: number; area: number };
type Geometry = { pictures: { id: string; strokes: { points: P[] }[]; mask: Mask; ink: number }[] };
const geometry = JSON.parse(await readFile(args.geometry, "utf8")) as Geometry;
const SHARD = Number(args.shard), SHARDS = Number(args.shards);
const ONLY = args.write !== undefined ? [args.write] : args.only?.split(",");
if (chart.road !== "rhythm") throw new TypeError("rhythm chart expected");
const base = buildRhythmPath(chart.notes, chart.tempo, chart.turnScale);
const N = base.tiles.length;
const angles = base.sweeps.slice(1, -1).map((s) => Math.abs(s.angle)); // angles[i]: turn placing tile i+2 from pivot i+1
const gaps = chart.notes.slice(1).map((t, i) => beatsBetween(chart.tempo, chart.notes[i]!, t));
const TAU = Math.PI * 2;
const CAP = Number(args.cap);

// Pieces: tiles between rests (gap >= 2 beats). A rest closer than 6 tiles to the end is not used.
const restAfter = gaps.map((g, i) => (g >= 2 - 0.02 && i + 1 < N - 6 ? i : -1)).filter((i) => i >= 0);
const pieces: { from: number; to: number }[] = [];
let start = 0;
for (const r of restAfter) { pieces.push({ from: start, to: r }); start = r + 1; }
pieces.push({ from: start, to: N - 1 });

const d2 = (a: P, b: P) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
function segD2(p: P, a: P, b: P) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2;
}
function cross(p: P, q: P, r: P, s: P) {
  const o = (a: P, b: P, c: P) => { const n = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); return Math.abs(n) < 1e-9 ? 0 : Math.sign(n); };
  return o(p, q, r) * o(p, q, s) < 0 && o(r, s, p) * o(r, s, q) < 0;
}

type Contour = { pts: P[]; s: number[]; length: number; size: number };
function contourOf(raw: P[]): Contour {
  const pts: P[] = [raw[0]!];
  for (const p of raw) if (d2(p, pts.at(-1)!) >= 0.25) pts.push(p);
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1]! + Math.sqrt(d2(pts[i]!, pts[i - 1]!)));
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const size = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  return { pts, s, length: s.at(-1)!, size };
}
const at = (c: Contour, s: number): P => {
  const v = Math.max(0, Math.min(c.length, s));
  let lo = 0, hi = c.s.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c.s[m]! <= v) lo = m; else hi = m; }
  const a = c.pts[lo]!, b = c.pts[hi]!, t = (v - c.s[lo]!) / ((c.s[hi]! - c.s[lo]!) || 1);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
};
/** Arc-length cut points: each piece gets a share of (length + turning) proportional to its note count. */
function cuts(c: Contour): number[] {
  const turn = [0];
  for (let i = 1; i < c.pts.length - 1; i++) {
    const a = Math.atan2(c.pts[i]!.y - c.pts[i - 1]!.y, c.pts[i]!.x - c.pts[i - 1]!.x);
    const b = Math.atan2(c.pts[i + 1]!.y - c.pts[i]!.y, c.pts[i + 1]!.x - c.pts[i]!.x);
    turn.push(Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a))));
  }
  turn.push(0);
  const totalTurn = turn.reduce((a, b) => a + b, 0);
  const beta = c.length / totalTurn;
  const w = [0];
  for (let i = 1; i < c.pts.length; i++) w.push(w[i - 1]! + (c.s[i]! - c.s[i - 1]!) + beta * turn[i]!);
  const W = w.at(-1)!;
  const out = [0];
  let acc = 0;
  for (const p of pieces) {
    acc += (p.to - p.from + 1) / N;
    const target = acc * W;
    const k = w.findIndex((v) => v >= target);
    out.push(k < 0 ? c.length : c.s[k]!);
  }
  out[out.length - 1] = c.length;
  return out;
}

type State = { tiles: P[]; heading: number; spin: number; flips: boolean[]; violet: number; cost: number };
function runPiece(c: Contour, k: number, s0: number, s1: number, z: number, entry: { pivot: P; heading: number; spin: number } | null, cap: number, prior: State | null) {
  const { from, to } = pieces[k]!;
  const n = to - from + 1;
  const arc: P[] = [];
  for (let j = 0; j <= 40; j++) arc.push(at(c, s0 + ((s1 - s0) * j) / 40));
  const target = (j: number) => at(c, s0 + ((s1 - s0) * j) / Math.max(1, n - 1));
  const arcD2 = (p: P) => { let b = Infinity; for (let i = 0; i < arc.length - 1; i++) b = Math.min(b, segD2(p, arc[i]!, arc[i + 1]!)); return b; };
  // Starting states.
  let beam: State[] = [];
  if (from === 0) {
    // Song start: first tile at the arc start, second tile one tile away in any direction.
    for (let h = 0; h < 12; h++) {
      const heading = (h / 12) * TAU, p0 = target(0);
      const p1 = { x: p0.x + z * Math.cos(heading), y: p0.y + z * Math.sin(heading) };
      beam.push({ tiles: [p0, p1], heading, spin: 1, flips: [], violet: 0, cost: 0 });
    }
  } else if (entry === null) {
    // Jump: land at the arc start; the first tile of the piece is the landing spot, the next one any direction.
    for (let h = 0; h < 12; h++) for (const spin of [prior!.spin]) {
      const p0 = target(0), heading = (h / 12) * TAU;
      beam.push({ tiles: [p0], heading, spin, flips: [], violet: 0, cost: 0 });
    }
  } else {
    beam.push({ tiles: [entry.pivot], heading: entry.heading, spin: entry.spin, flips: [], violet: 0, cost: 0 });
  }
  // Index of the first note this piece decides the turn for.
  const firstPlaced = from === 0 ? 2 : entry === null ? 1 : 0;
  for (let j = firstPlaced; j < n; j++) {
    const tileIndex = from + j;
    const cand: State[] = [];
    for (const st of beam) {
      const pivot = st.tiles.at(-1)!;
      // A jump's landing tile (j === 1 after a jump) has no fixed turn: the camera slid there.
      const free = entry === null && from !== 0 && j === 1;
      const opts: { heading: number; spin: number; flip: boolean }[] = [];
      if (free) {
        opts.push({ heading: st.heading, spin: st.spin, flip: false });
      } else {
        const a = angles[tileIndex - 2]!;
        for (const flip of [false, true]) {
          const spin = flip ? -st.spin : st.spin;
          opts.push({ heading: (st.heading + Math.PI + spin * a) % TAU, spin, flip });
        }
      }
      for (const o of opts) {
        // The game rings every twirl in violet, a turn back on a straight tile too, so every flip counts.
        const visible = o.flip;
        if (visible && st.violet >= cap) continue;
        const next = { x: pivot.x + z * Math.cos(o.heading), y: pivot.y + z * Math.sin(o.heading) };
        const recent = st.tiles.slice(-24);
        let visits = 0;
        for (const q of st.tiles) if (d2(q, next) < 0.25 * z * z) visits++;
        let crosses = 0;
        for (let i = Math.max(0, recent.length - 22); i < recent.length - 2; i++) if (cross(recent[i]!, recent[i + 1]!, pivot, next)) crosses++;
        const cost = 0.4 * d2(next, target(j)) / (z * z) + 2 * arcD2(next) / (z * z) + 6 * visits + 2 * crosses + (visible ? 1.5 : o.flip ? 0.05 : 0);
        cand.push({ tiles: [...st.tiles, next], heading: o.heading, spin: o.spin, flips: [...st.flips, o.flip && !free], violet: st.violet + +visible, cost: st.cost + cost });
      }
    }
    cand.sort((a, b) => a.cost - b.cost);
    const seen = new Set<string>();
    beam = [];
    for (const s of cand) {
      const p = s.tiles.at(-1)!;
      const key = `${Math.round(p.x / z * 100)},${Math.round(p.y / z * 100)},${Math.round(s.heading * 100)},${s.spin},${s.violet}`;
      if (seen.has(key)) continue;
      seen.add(key); beam.push(s);
      if (beam.length >= 96) break;
    }
  }
  const best = beam[0]!;
  // Piece fidelity: tiles to arc, arc to trail.
  const segs = best.tiles.slice(1).map((p, i) => [best.tiles[i]!, p] as const);
  const trailD2 = (p: P) => segs.length === 0 ? d2(p, best.tiles[0]!) : Math.min(...segs.map(([a, b]) => segD2(p, a, b)));
  const fit = Math.sqrt(best.tiles.reduce((a, p) => a + arcD2(p), 0) / best.tiles.length) + Math.sqrt(arc.reduce((a, p) => a + trailD2(p), 0) / arc.length);
  return { state: best, fit };
}

function draw(c: Contour, mode: "zoom" | "jump") {
  const cut = cuts(c);
  const out: { tiles: P[]; z: number; flips: boolean[]; violet: number; from: number }[] = [];
  let prior: State | null = null;
  let violet = 0;
  for (let k = 0; k < pieces.length; k++) {
    const { from, to } = pieces[k]!;
    const n = to - from + 1;
    const L = cut[k + 1]! - cut[k]!;
    const cap = Math.max(0, Math.round((CAP * (to + 1)) / N) - violet);
    let best: { state: State; fit: number; z: number } | null = null;
    for (const e of [0.3, 0.4, 0.5, 0.6, 0.75, 0.9]) {
      const z = Math.max(L / (n * e), 1e-3);
      let entry: { pivot: P; heading: number; spin: number } | null = null;
      if (k > 0 && mode === "zoom") entry = { pivot: prior!.tiles.at(-1)!, heading: prior!.heading, spin: prior!.spin };
      // Zoom-only: the rest tile is the last tile of the previous piece; this piece's first tile follows its turn.
      let r;
      if (entry !== null) {
        // Place the first tile of this piece from the previous pivot with the fixed turn, at this piece's size.
        r = runPiece(c, k, cut[k]!, cut[k + 1]!, z, entry, cap, prior);
        r.state.tiles.shift();
      } else {
        r = runPiece(c, k, cut[k]!, cut[k + 1]!, z, null, cap, prior);
      }
      if (best === null || r.fit < best.fit) best = { ...r, z };
    }
    prior = best!.state;
    violet += best!.state.violet;
    out.push({ tiles: best!.state.tiles, z: best!.z, flips: best!.state.flips, violet: best!.state.violet, from });
  }
  return out;
}

function check(pieceTiles: { tiles: P[]; z: number; from: number }[], mode: string) {
  const tiles = pieceTiles.flatMap((p) => p.tiles);
  if (tiles.length !== N) throw new RangeError(`${mode}: ${tiles.length} tiles, expected ${N}`);
  let maxTurn = 0, maxEdge = 0;
  for (const p of pieceTiles) {
    const t = p.tiles;
    for (let i = 1; i < t.length; i++) maxEdge = Math.max(maxEdge, Math.abs(Math.sqrt(d2(t[i]!, t[i - 1]!)) / p.z - 1));
    for (let i = 2; i < t.length; i++) {
      const g = p.from + i; // global index of tile t[i]
      if (mode === "jump" && p.from !== 0 && i === 1) continue;
      const a = t[i - 2]!, b = t[i - 1]!, c = t[i]!;
      const dot = ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)) / (p.z * p.z);
      const want = Math.acos(Math.max(-1, Math.min(1, Math.cos(Math.PI + angles[g - 2]!))));
      maxTurn = Math.max(maxTurn, Math.abs(Math.acos(Math.max(-1, Math.min(1, dot))) - want));
    }
  }
  // acos loses precision near a straight turn, so tiny tiles miss by a few microradians.
  if (maxTurn > 1e-4 || maxEdge > 1e-9) throw new RangeError(`${mode}: rhythm broken turn=${maxTurn} edge=${maxEdge}`);
  return { maxTurn, maxEdge };
}

function metrics(pieceTiles: { tiles: P[]; z: number; violet: number }[], c: Contour, joined: boolean) {
  const segs: [P, P][] = [];
  const all = pieceTiles.flatMap((p) => p.tiles);
  if (joined) for (let i = 1; i < all.length; i++) segs.push([all[i - 1]!, all[i]!]);
  else for (const p of pieceTiles) for (let i = 1; i < p.tiles.length; i++) segs.push([p.tiles[i - 1]!, p.tiles[i]!]);
  const D = c.size;
  const contourD = (p: P) => { let b = Infinity; for (let i = 0; i < c.pts.length - 1; i += 2) b = Math.min(b, segD2(p, c.pts[i]!, c.pts[Math.min(i + 2, c.pts.length - 1)]!)); return Math.sqrt(b); };
  const trailD = (p: P) => { let b = Infinity; for (const [a, q] of segs) b = Math.min(b, segD2(p, a, q)); return Math.sqrt(b); };
  const samples: P[] = []; for (const [a, b] of segs) for (const t of [0, 0.5]) samples.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const offLine = samples.map(contourD).reduce((a, b) => a + b, 0) / samples.length / D;
  let covered = 0, total = 0;
  for (let s = 0; s < c.length; s += c.length / 400) { total++; if (trailD(at(c, s)) <= 0.02 * D) covered++; }
  // Screen-side: passes and crossings measured in each piece's own tile size.
  let maxPasses = 1, crossWindows = 0;
  for (const p of pieceTiles) {
    for (const a of p.tiles) maxPasses = Math.max(maxPasses, p.tiles.filter((b) => d2(a, b) < 1e-6 * p.z * p.z).length);
    for (let s = 0; s + 2 < p.tiles.length; s++) {
      const w = p.tiles.slice(s, s + 21);
      let hit = false;
      for (let i = 0; i + 1 < w.length && !hit; i++) for (let j = i + 2; j + 1 < w.length; j++) if (cross(w[i]!, w[i + 1]!, w[j]!, w[j + 1]!)) { hit = true; break; }
      crossWindows += +hit;
    }
  }
  const zs = pieceTiles.map((p) => p.z);
  return {
    offLinePct: +(offLine * 100).toFixed(2), coveredPct: +(covered / total * 100).toFixed(1),
    violet: pieceTiles.reduce((a, p) => a + p.violet, 0), maxPasses, crossWindows,
    zoomRange: +(Math.max(...zs) / Math.min(...zs)).toFixed(2),
  };
}

function silhouette(cells: P[], step: number): P[] {
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
  loop.push(loop[0]!);
  const smooth = loop.map((_, i) => {
    let ax = 0, ay = 0, m = 0;
    for (let k = -4; k <= 4; k++) { const q = loop[Math.min(loop.length - 1, Math.max(0, i + k))]!; ax += q.x; ay += q.y; m++; }
    return { x: ax / m, y: ay / m };
  });
  return smooth;
}
/** Higher is closer: the share of the outline the road runs along, less how far its lines stray from it. */
const closeness = (m: { coveredPct: number; offLinePct: number }) => +(m.coveredPct - 5 * m.offLinePct).toFixed(2);
/**
 * The picture's line length over the length of its outer outline. A clean outline drawing is near 2.5 to 3; one that
 * scribbles all over the inside (whose lines would hide the road on the result screen) goes past 3.3.
 */
function inkRatio(ink: number, { cells, step }: Mask): number {
  const n = Math.round(100 / step) + 2;
  const on = new Uint8Array(n * n);
  for (const c of cells) on[(Math.floor(c.y / step) + 1) * n + Math.floor(c.x / step) + 1] = 1;
  const outside = new Uint8Array(n * n);
  const stack = [0];
  outside[0] = 1;
  const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  while (stack.length > 0) {
    const i = stack.pop()!;
    const x = i % n, y = (i - x) / n;
    for (const [dx, dy] of sides) {
      const nx = x + dx, ny = y + dy, j = ny * n + nx;
      if (nx >= 0 && ny >= 0 && nx < n && ny < n && on[j] === 0 && outside[j] === 0) { outside[j] = 1; stack.push(j); }
    }
  }
  let edges = 0;
  for (let i = 0; i < n * n; i++) {
    if (on[i] === 0) continue;
    const x = i % n, y = (i - x) / n;
    for (const [dx, dy] of sides) if (outside[(y + dy) * n + x + dx] === 1) edges++;
  }
  // Cell edges walk a staircase; pi/4 of it is about the length of the smooth outline.
  return ink / ((edges * step * Math.PI) / 4);
}

type Laid = { pictureId: string; pieceTiles: ReturnType<typeof draw> };
const laid: Laid[] = [];
const ranking: Record<string, unknown>[] = [];
for (const [pi, pic] of geometry.pictures.entries()) {
  if (ONLY ? !ONLY.includes(pic.id) : pi % SHARDS !== SHARD) continue;
  if (pic.mask.cells.length < 50) continue;
  const c = contourOf(silhouette(pic.mask.cells, pic.mask.step));
  const pieceTiles = draw(c, "jump");
  try {
    check(pieceTiles, "jump");
  } catch (error) {
    console.log(`FAILED ${pic.id}: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }
  const m = metrics(pieceTiles, c, false);
  const flips = pieceTiles.reduce((a, p) => a + p.flips.filter(Boolean).length, 0);
  laid.push({ pictureId: pic.id, pieceTiles });
  ranking.push({ picture: pic.id, closeness: closeness(m), inkRatio: +inkRatio(pic.ink, pic.mask).toFixed(2), ...m, flips });
  console.log(`RESULT ${pic.id} closeness=${closeness(m)} ${JSON.stringify(m)} flips=${flips}`);
}
if (args.out !== undefined) await writeFile(args.out, JSON.stringify({ cap: CAP, ranking }));

if (args.write !== undefined) {
  const chosen = laid[0];
  if (chosen === undefined) throw new RangeError(`no picture ${args.write} in the geometry file`);
  // The sim decides each turn while placing tile `from + j`; that turn comes after note `from + j - 2`.
  const flips: number[] = [];
  for (const [k, piece] of chosen.pieceTiles.entries()) {
    const firstPlaced = k === 0 ? 2 : 1;
    piece.flips.forEach((flip, n) => { if (flip) flips.push(piece.from + firstPlaced + n - 2); });
  }
  const played = buildRhythmPath(chart.notes, chart.tempo, chart.turnScale, [], flips);
  const placed: { from: number; scale: number; angle: number; x: number; y: number }[] = [];
  for (const piece of chosen.pieceTiles) {
    const a = played.tiles[piece.from]!, b = played.tiles[piece.from + 1]!;
    const A = piece.tiles[0]!, B = piece.tiles[1]!;
    const scale = Math.hypot(B.x - A.x, B.y - A.y) / Math.hypot(b.x - a.x, b.y - a.y);
    const angle = Math.atan2(B.y - A.y, B.x - A.x) - Math.atan2(b.y - a.y, b.x - a.x);
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const x = A.x - scale * (a.x * cos - a.y * sin), y = A.y - scale * (a.x * sin + a.y * cos);
    piece.tiles.forEach((want, j) => {
      const tile = played.tiles[piece.from + j]!;
      const got = { x: x + scale * (tile.x * cos - tile.y * sin), y: y + scale * (tile.x * sin + tile.y * cos) };
      if (Math.hypot(got.x - want.x, got.y - want.y) > 1e-6 * piece.z) {
        throw new RangeError(`piece from ${piece.from}: tile ${piece.from + j} lands off the picture`);
      }
    });
    placed.push({ from: piece.from, scale, angle, x, y });
  }
  data["picture"] = { name: chosen.pictureId, flips, pieces: placed };
  chartSchema.parse(data);
  // Written as tools/make_chart.py writes charts.
  await writeFile(chartFile, JSON.stringify(data, null, 1));
  console.log(`WROTE ${chosen.pictureId}: ${flips.length} flips, ${placed.length} pieces -> ${chartFile.pathname}`);
}
