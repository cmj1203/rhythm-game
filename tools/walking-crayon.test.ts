import { expect, test } from "bun:test";
import { chartSchema } from "../src/chart";
import { PlayState } from "../src/judge";
import { orbiterAngle, type Path } from "../src/path";
import { buildRhythmPath } from "../src/rhythm-road";
import { standingAt, walkingCrayonAt } from "../src/walking-crayon";

function pose(path: Path, time: number) {
  const result = walkingCrayonAt(path, time);
  if (result === null) throw new RangeError("missing pose");
  return result;
}

test.each([
  [0, 0.5, 1, 1.5],
  [0, 0.25, 0.5, 0.75, 1],
  [0, 1 / 6, 0.5, 2 / 3, 1],
  [0, 0.375, 0.5, 0.875, 1],
  [0, 1, 1.25, 2.75, 3],
].map((times) => ({ times })))("both physical ends are continuous at every boundary in %j", ({ times }) => {
  // Given straight, half-beat, triplet, dotted and U-turn/rest roads.
  const path = buildRhythmPath(times, [[0, 120]]);
  // When the clock crosses each landing, independently of any input.
  const pairs = times.map((time) => [pose(path, time - 1e-9), pose(path, time + 1e-9)] as const);
  // Then pointed and flat ends each stay on their own continuous trajectory.
  for (const [before, after] of pairs) {
    expect(Math.hypot(before.tip.x - after.tip.x, before.tip.y - after.tip.y)).toBeLessThan(1e-6);
    expect(Math.hypot(before.flat.x - after.flat.x, before.flat.y - after.flat.y)).toBeLessThan(1e-6);
  }
});

test("the pointed and flat ends take turns standing on tiles", () => {
  // Given a road with several half-beat corners.
  const path = buildRhythmPath([0, 0.25, 0.5, 0.75, 1], [[0, 120]]);
  // When each tile's exact landing is evaluated.
  const landings = path.tiles.slice(1).map((tile) => pose(path, tile.time));
  // Then parity switches the standing physical end, with length always one tile.
  for (const p of landings) {
    const standing = p.standing % 2 === 0 ? p.flat : p.tip;
    expect(standing).toEqual(p.pivot);
    expect(Math.hypot(p.tip.x - p.flat.x, p.tip.y - p.flat.y)).toBeCloseTo(1, 12);
  }
});

test("rotation stays linear while landing pressure rises and settles", () => {
  // Given a 250ms sweep at a constant local beat.
  const path = buildRhythmPath([0, 0.25, 0.5], [[0, 120]]);
  const sweep = path.sweeps[1];
  if (sweep === undefined) throw new RangeError("missing sweep");
  const times = [0.005, 0.02, 0.04, 0.07, 0.1, 0.2];
  // When poses are sampled through the whole settle window.
  const poses = times.map((time) => pose(path, time));
  // Then the free end follows the unchanged linear orbit, with no catch-up easing.
  for (const [i, p] of poses.entries()) {
    const free = p.standing % 2 === 0 ? p.tip : p.flat;
    const angle = orbiterAngle(sweep, times[i] ?? 0);
    expect(free.x - p.pivot.x).toBeCloseTo(Math.cos(angle), 12);
    expect(free.y - p.pivot.y).toBeCloseTo(Math.sin(angle), 12);
  }
  expect(pose(path, 0).settle).toBe(0);
  expect(pose(path, 0.02).settle).toBeGreaterThan(0);
  expect(pose(path, 0.1).settle).toBe(0);
});

test("an early perfect press does not move the standing end ahead of the clock", () => {
  // Given a player who already hit the next note 20ms early.
  const times = [1, 1.25, 1.5];
  const path = buildRhythmPath(times, [[0, 120]]);
  const play = new PlayState(times);
  play.press(1);
  play.press(1.23);
  // When drawing before that note's scheduled landing.
  const p = pose(path, 1.24);
  // Then motion remains on the clock's tile, not the input counter's next tile.
  expect(p.standing).toBe(1);
  expect(p.standing).not.toBe(play.resolvedCount);
});

test("a missed note does not hold the crayon back on an old tile", () => {
  // Given missed input and a still-pending next note.
  const times = [1, 1.25, 1.5];
  const path = buildRhythmPath(times, [[0, 120]]);
  const play = new PlayState(times);
  play.advance(1.3);
  // When the song has already passed the second landing.
  const p = pose(path, 1.3);
  // Then the crayon stands on tile two despite the lagging judgement counter.
  expect(p.standing).toBe(2);
  expect(p.standing).not.toBe(play.resolvedCount);
});

test("Last Fortress has no boundary jumps or unexplained 60fps movement", async () => {
  // Given the real variable-tempo rhythm road, including 196 BPM riffs and long rests.
  const chart = chartSchema.parse(await Bun.file(new URL("../public/songs/last-fortress/chart.json", import.meta.url)).json());
  if (chart.road !== "rhythm") throw new RangeError("missing rhythm chart");
  const path = buildRhythmPath(chart.notes, chart.tempo, chart.turnScale);
  // When both physical ends are evaluated every frame and across every landing.
  const frames = Array.from({ length: 5600 }, (_, i) => pose(path, i / 60));
  const pairs = chart.notes.map((time) => [pose(path, time - 1e-9), pose(path, time + 1e-9)] as const);
  // Then all motion fits the fastest local angular speed, with no tile-sized discontinuity.
  const frameBound = Math.PI * Math.max(...path.rhythm.turns.map(([, bpm]) => bpm)) / 60 / 60 * 1.003;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1];
    const b = frames[i];
    if (a === undefined || b === undefined) throw new RangeError("missing frame");
    expect(Math.hypot(a.tip.x - b.tip.x, a.tip.y - b.tip.y)).toBeLessThanOrEqual(frameBound);
    expect(Math.hypot(a.flat.x - b.flat.x, a.flat.y - b.flat.y)).toBeLessThanOrEqual(frameBound);
  }
  for (const [a, b] of pairs) {
    expect(Math.hypot(a.tip.x - b.tip.x, a.tip.y - b.tip.y)).toBeLessThan(1e-6);
    expect(Math.hypot(a.flat.x - b.flat.x, a.flat.y - b.flat.y)).toBeLessThan(1e-6);
  }
  expect(standingAt(path.tiles, -3)).toBe(0);
  expect(standingAt(path.tiles, 100)).toBe(path.tiles.length - 1);
});
