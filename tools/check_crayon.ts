// bun tools/check_crayon.ts: world-space endpoint displacement at a uniform 60 fps.
import { chartSchema } from "../src/chart";
import type { Point } from "../src/canvas";
import { orbiterAngle, type Path } from "../src/path";
import { buildRhythmPath } from "../src/rhythm-road";
import { standingAt, walkingCrayonAt } from "../src/walking-crayon";
import { beforeEnds } from "./crayon-before";

type Ends = { readonly tip: Point; readonly flat: Point };
type Model = { readonly name: string; readonly radius: number; readonly at: (path: Path, time: number) => Ends | null };
type Span = { readonly name: string; readonly start: number; readonly end: number };

/** The angular travel available between frames, split at real sweep/tempo boundaries. */
function rotationBudget(path: Path, from: number, to: number): number {
  let cursor = from;
  let index = standingAt(path.tiles, cursor);
  let budget = 0;
  while (cursor < to) {
    const sweep = path.sweeps[index];
    if (sweep === undefined) throw new RangeError("missing sweep");
    const end = Math.min(to, path.tiles[index + 1]?.time ?? to);
    budget += Math.abs(orbiterAngle(sweep, end) - orbiterAngle(sweep, cursor));
    cursor = end;
    index++;
  }
  return budget;
}

function measure(path: Path, span: Span, model: Model) {
  let last = model.at(path, span.start);
  if (last === null) throw new RangeError("missing pose");
  let maxTip = 0;
  let maxFlat = 0;
  let maxExcess = 0;
  let maxAllowed = 0;
  let unexplainedFrames = 0;
  const rows: string[] = [];
  for (let frame = 1; frame <= Math.round((span.end - span.start) * 60); frame++) {
    const time = span.start + frame / 60;
    const current = model.at(path, time);
    if (current === null) throw new RangeError("missing pose");
    const tip = Math.hypot(current.tip.x - last.tip.x, current.tip.y - last.tip.y);
    const flat = Math.hypot(current.flat.x - last.flat.x, current.flat.y - last.flat.y);
    const allowed = rotationBudget(path, time - 1 / 60, time) * model.radius;
    const excess = Math.max(0, tip - allowed, flat - allowed);
    maxTip = Math.max(maxTip, tip);
    maxFlat = Math.max(maxFlat, flat);
    maxExcess = Math.max(maxExcess, excess);
    maxAllowed = Math.max(maxAllowed, allowed);
    if (excess > 1e-8) unexplainedFrames++;
    rows.push([model.name, span.name, time, tip, flat, allowed, excess].join(","));
    last = current;
  }
  return {
    result: { ...span, maxTip, maxFlat, maxAllowed, maxExcess, unexplainedFrames },
    rows,
  };
}

const chart = chartSchema.parse(await Bun.file("public/songs/last-fortress/chart.json").json());
if (chart.road !== "rhythm") throw new RangeError("missing rhythm chart");
const path = buildRhythmPath(chart.notes, chart.tempo, chart.turnScale, chart.twirls, chart.picture?.flips, chart.repeats);
let dense = { start: 0, end: 7, count: 0 };
for (const start of chart.notes) {
  const count = chart.notes.filter((time) => time >= start && time < start + 7).length;
  if (count > dense.count) dense = { start, end: start + 7, count };
}
const spans: readonly Span[] = [
  { name: "densest-7s", start: dense.start, end: dense.end },
  { name: "196-riff-into-stop", start: 70, end: 77 },
  { name: "tempo-150", start: 45.98, end: 47.98 },
  { name: "tempo-196", start: 65.18, end: 67.18 },
  { name: "whole-song", start: 0, end: 93 },
];
const models: readonly Model[] = [
  { name: "before", radius: Math.hypot(1, 0.56 * 0.55), at: beforeEnds },
  { name: "after", radius: 1, at: walkingCrayonAt },
];
const measurements = models.map((model) => ({
  name: model.name,
  spans: spans.map((span) => measure(path, span, model)),
}));
let boundaryTip = 0;
let boundaryFlat = 0;
for (const time of chart.notes) {
  const before = walkingCrayonAt(path, time - 1e-8);
  const after = walkingCrayonAt(path, time + 1e-8);
  if (before === null || after === null) throw new RangeError("missing boundary pose");
  boundaryTip = Math.max(boundaryTip, Math.hypot(before.tip.x - after.tip.x, before.tip.y - after.tip.y));
  boundaryFlat = Math.max(boundaryFlat, Math.hypot(before.flat.x - after.flat.x, before.flat.y - after.flat.y));
}
const report = {
  fps: 60,
  units: "tile",
  endpoints: "physical pointed end and physical flat end",
  densestNotesInSevenSeconds: dense.count,
  measurements: measurements.map((model) => ({ name: model.name, spans: model.spans.map(({ result }) => result) })),
  boundary: { sampleOffsetSeconds: 1e-8, maxTip: boundaryTip, maxFlat: boundaryFlat },
  noteTimesSha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(chart.notes)).digest("hex"),
  violet: path.sweeps.filter(({ isTwirl }) => isTwirl).length,
};
await Bun.write("/tmp/livecanvas-crayon/continuity.json", JSON.stringify(report, null, 2));
await Bun.write("/tmp/livecanvas-crayon/frame-movement.csv", [
  "model,span,time,pointed_distance,flat_distance,rotation_bound,unexplained_excess",
  ...measurements.flatMap((model) => model.spans.flatMap(({ rows }) => rows)),
].join("\n"));
console.log(JSON.stringify(report, null, 2));
if (measurements[1]?.spans.some(({ result }) => result.unexplainedFrames > 0) ||
    Math.max(boundaryTip, boundaryFlat) > 1e-6) {
  throw new RangeError("crayon continuity exceeds the rotation budget");
}
