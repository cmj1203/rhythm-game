import { describe, expect, test } from "bun:test";
import { chartSchema } from "../src/chart";
import type { Route } from "../src/drawing";
import { buildPath, cameraAt, orbiterAngle } from "../src/path";
import { buildRhythmPath } from "../src/rhythm-road";
import { beatsBetween } from "../src/tempo";
import { walkingCrayonAt } from "../src/walking-crayon";

const tempo = [[0, 120]] as const;
const wrap = (radians: number): number => Math.atan2(Math.sin(radians), Math.cos(radians));

describe("rhythm road", () => {
  test.each([
    [1, 0, 180],
    [1 / 2, 90, 90],
    [1 / 3, 120, 60],
    [2 / 3, 60, 120],
    [3 / 4, 45, 135],
    [1 / 4, 135, 45],
    [2, 180, 360],
  ])("gap %s keeps its geometric turn and sweep", (gap, turn, sweep) => {
    // Given a local half-second beat and just one gap.
    const times = [0, gap / 2];
    // When the rhythm road is laid without any picture.
    const path = buildRhythmPath(times, tempo);
    // Then its interior angle is 180-turn, and its orbit sweeps PI*units.
    const from = path.tiles[1];
    const to = path.tiles[2];
    expect(from).toBeDefined();
    expect(to).toBeDefined();
    if (from === undefined || to === undefined) return;
    expect(Math.abs(wrap(Math.atan2(to.y - from.y, to.x - from.x))) * 180 / Math.PI).toBeCloseTo(turn, 8);
    expect(Math.abs(path.sweeps[1]?.angle ?? 0) * 180 / Math.PI).toBeCloseTo(sweep, 8);
    expect(path.sweeps[1]?.pace).toBe("normal");
  });

  test("dotted eighth and sixteenth retain 135/45 degree interiors", () => {
    // Given a dotted pair.
    const times = [0, 0.375, 0.5];
    // When both gaps are laid.
    const path = buildRhythmPath(times, tempo);
    // Then the two sweeps are distinct, with no double-speed marker.
    expect(path.sweeps.slice(1, 3).map(({ angle }) => Math.abs(angle) * 180 / Math.PI)).toEqual([135, 45]);
    expect(path.sweeps.some(({ pace }) => pace === "fast")).toBe(false);
  });

  test("one beat stays straight for any length of run", () => {
    // Given 40 equal beats.
    const times = Array.from({ length: 40 }, (_, i) => i / 2);
    // When the road is laid.
    const path = buildRhythmPath(times, tempo);
    // Then no compass corner or picture steering interrupts the line.
    expect(path.tiles.every((tile, i) => Math.abs(tile.y) < 1e-10 && Math.abs(tile.x - i) < 1e-10)).toBe(true);
    expect(path.sweeps.some(({ isTwirl }) => isTwirl)).toBe(false);
  });

  test("long rests alone use a slower sweep", () => {
    // Given a three-beat rest.
    const times = [0, 1.5];
    // When the road is laid.
    const path = buildRhythmPath(times, tempo);
    // Then the orbit is halved rather than doubled.
    expect(path.sweeps[1]?.pace).toBe("slow");
    expect(Math.abs(path.sweeps[1]?.angle ?? 0)).toBeCloseTo(1.5 * Math.PI);
  });

  test("tempo changes local units and orbit speed without moving note times", () => {
    // Given two BPM sections, with a note at the change.
    const map = [[0, 120], [1, 240]] as const;
    const times = [0, 0.5, 1, 1.25, 1.5];
    // When the road is laid.
    const path = buildRhythmPath(times, map);
    // Then both sections are straight, but the later orbit is twice as quick.
    expect(path.tiles.slice(1).map(({ time }) => time)).toEqual(times);
    expect(path.tiles.every(({ y }) => Math.abs(y) < 1e-10)).toBe(true);
    const slow = path.sweeps[1];
    const fast = path.sweeps[3];
    if (slow === undefined || fast === undefined) throw new RangeError("missing sweep");
    expect(orbiterAngle(slow, 0.25) - slow.startAngle).toBeCloseTo(Math.PI / 2);
    expect(orbiterAngle(fast, 1.125) - fast.startAngle).toBeCloseTo(Math.PI / 2);
    expect(path.rhythm.marks).toEqual([null, null, null, "faster", null, null]);
  });

  test("a turn scale bends the same half beats at another angle without moving note times", () => {
    // Given half beats at 120 BPM, with the crayon turning 4/3 as fast from the second second on.
    const times = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5];
    const scale = [[0, 1], [1, 4 / 3]] as const;
    // When the road is laid with and without the scale.
    const plain = buildRhythmPath(times, tempo);
    const scaled = buildRhythmPath(times, tempo, scale);
    const turn = (path: typeof plain, i: number): number => {
      const [a, b, c] = [path.tiles[i - 1], path.tiles[i], path.tiles[i + 1]];
      if (a === undefined || b === undefined || c === undefined) throw new RangeError("missing tile");
      return Math.abs(wrap(Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x))) * 180 / Math.PI;
    };
    // Then note times stay, half beats turn 90 degrees before the change and 60 after, and the change is marked.
    expect(scaled.tiles.slice(1).map(({ time }) => time)).toEqual(times);
    expect(turn(plain, 6)).toBeCloseTo(90, 8);
    expect(turn(scaled, 3)).toBeCloseTo(90, 8);
    expect(turn(scaled, 6)).toBeCloseTo(60, 8);
    expect(scaled.rhythm.tempo).toEqual(tempo);
    expect(scaled.rhythm.marks.filter((mark) => mark !== null)).toEqual(["faster"]);
  });

  test("a twirl set by hand turns the crayon back after that note only", () => {
    // Given beats on a straight road, with a twirl set at the third note.
    const times = [0, 0.5, 1, 1.5, 2];
    // When the road is laid with and without it.
    const plain = buildRhythmPath(times, tempo);
    const twirled = buildRhythmPath(times, tempo, undefined, [1]);
    // Then only the sweep after that note twirls, the spin turns over from there, and note times stay.
    expect(plain.sweeps.map(({ isTwirl }) => isTwirl)).toEqual([false, false, false, false, false, false]);
    expect(twirled.sweeps.map(({ isTwirl }) => isTwirl)).toEqual([false, false, false, true, false, false]);
    expect(Math.sign(twirled.sweeps[4]?.angle ?? 0)).toBe(-Math.sign(plain.sweeps[4]?.angle ?? 0));
    expect(twirled.tiles.slice(1).map(({ time }) => time)).toEqual(times);
  });

  test("a sweep crossing a tempo boundary follows both local speeds", () => {
    // Given one gap crossing 120 -> 240 BPM.
    const map = [[0, 120], [0.25, 240]] as const;
    // When its sweep is evaluated on both sides.
    const path = buildRhythmPath([0, 0.5], map);
    const sweep = path.sweeps[1];
    if (sweep === undefined) throw new RangeError("missing sweep");
    // Then each quarter second contributes the correct number of beats.
    expect(beatsBetween(map, 0, 0.5)).toBe(1.5);
    expect(orbiterAngle(sweep, 0.25) - sweep.startAngle).toBeCloseTo(Math.PI / 2);
    expect(orbiterAngle(sweep, 0.5) - orbiterAngle(sweep, 0.25)).toBeCloseTo(Math.PI);
  });

  test("twirls only prevent a recent tile overlap", () => {
    // Given a half-beat riff which would repeatedly close a square.
    const times = Array.from({ length: 65 }, (_, i) => i / 8);
    // When the road chooses spins.
    const path = buildRhythmPath(times, [[0, 240]]);
    // Then every flip is necessary and its alternative is clear.
    let flips = 0;
    for (let i = 1; i < times.length; i++) {
      const sweep = path.sweeps[i];
      const previous = path.sweeps[i - 1];
      const pivot = path.tiles[i];
      const destination = path.tiles[i + 1];
      if (sweep === undefined || previous === undefined || pivot === undefined || destination === undefined) continue;
      const heading = sweep.startAngle + sweep.angle;
      const keptHeading = heading - 2 * sweep.angle;
      const kept = { x: pivot.x + Math.cos(keptHeading), y: pivot.y + Math.sin(keptHeading) };
      const recent = path.tiles.slice(Math.max(0, i + 1 - 6), i).filter((tile) => pivot.time - tile.time <= 0.5);
      if (sweep.isTwirl) {
        flips++;
        expect(recent.some((tile) => Math.hypot(tile.x - kept.x, tile.y - kept.y) < 0.95)).toBe(true);
        expect(recent.some((tile) => Math.hypot(tile.x - destination.x, tile.y - destination.y) < 0.95)).toBe(false);
      } else {
        expect(Math.sign(sweep.angle)).toBe(Math.sign(previous.angle));
      }
    }
    expect(flips).toBeGreaterThan(0);
  });

  test("repeated riffs reproduce their signed relative turns", () => {
    // Given eight bars of half-beat notes.
    const times = Array.from({ length: 65 }, (_, i) => i / 8);
    // When earlier nonoverlapping phrases are reused.
    const path = buildRhythmPath(times, [[0, 240]]);
    // Then all recorded replays have the same relative shape, including twirls.
    expect(path.rhythm.phrases.length).toBeGreaterThan(0);
    for (const { from, to, count } of path.rhythm.phrases) {
      const source = path.sweeps.slice(from + 1, from + count + 1);
      const repeated = path.sweeps.slice(to + 1, to + count + 1);
      expect(repeated.map(({ isTwirl, angle }) => [isTwirl, angle])).toEqual(source.map(({ isTwirl, angle }) => [isTwirl, angle]));
    }
  });

  test("a passed square can be travelled again after its stitches are old", () => {
    // Given a half-beat square whose old corner is more than half a second behind.
    const times = [0, 0.25, 0.5, 0.75, 1];
    // When its rhythm returns to that corner.
    const path = buildRhythmPath(times, tempo);
    // Then it closes the square instead of adding a twirl to escape old history.
    const corner = path.tiles[1];
    const returned = path.tiles[5];
    if (corner === undefined || returned === undefined) throw new RangeError("missing corner");
    expect(Math.hypot(corner.x - returned.x, corner.y - returned.y)).toBeLessThan(1e-10);
    expect(path.sweeps.some(({ isTwirl }) => isTwirl)).toBe(false);
  });

  test("a two-beat U-turn does not flip when both spins return to the same tile", () => {
    // Given two notes two local beats apart.
    const times = [0, 1];
    // When the full-circle sweep is laid.
    const path = buildRhythmPath(times, tempo);
    // Then it accepts the unavoidable return rather than adding a useless violet marker.
    expect(path.tiles[2]?.x).toBeCloseTo(path.tiles[0]?.x ?? 0);
    expect(path.tiles[2]?.y).toBeCloseTo(path.tiles[0]?.y ?? 0);
    expect(path.sweeps[1]?.isTwirl).toBe(false);
  });

  test("Last Fortress keeps sparse twirls without changing its note times", async () => {
    // Given the unchanged opt-in song.
    const chart = chartSchema.parse(await Bun.file(new URL("../public/songs/last-fortress/chart.json", import.meta.url)).json());
    if (chart.road !== "rhythm") throw new RangeError("missing rhythm chart");
    // When its road is laid with fresh-stitch clearance, with and without the twirls set by hand.
    const own = buildRhythmPath(chart.notes, chart.tempo, chart.turnScale);
    const path = buildRhythmPath(chart.notes, chart.tempo, chart.turnScale, chart.twirls);
    const violets = (laid: typeof path): number => laid.sweeps.filter(({ isTwirl }) => isTwirl).length;
    // Then its own twirls stay within the violet budget, the hand-set ones add no more than their count,
    // and it lands on every original note.
    expect(violets(own)).toBeLessThanOrEqual(20);
    expect(violets(path)).toBeLessThanOrEqual(violets(own) + (chart.twirls?.length ?? 0));
    expect(path.tiles.slice(1).map(({ time }) => time)).toEqual(chart.notes);
  });

  test("a repeat sign walks the same tiles again, from the tile before them, with no line across the jump", () => {
    // Given notes a beat, a half and a beat apart, then a jump of a beat and the half and beat again, then on.
    const times = [0, 1, 1.5, 2.5, 3, 4, 5, 6];
    // When the road is laid with notes 1 and 2 repeated by notes 3 and 4.
    const path = buildRhythmPath(times, [[0, 60]], undefined, [], undefined, [{ from: 1, count: 2 }]);
    const same = (a: number, b: number): boolean =>
      Math.hypot((path.tiles[a]?.x ?? 0) - (path.tiles[b]?.x ?? 0), (path.tiles[a]?.y ?? 0) - (path.tiles[b]?.y ?? 0)) < 1e-9;
    // Then the second pass stands on the first pass's tiles, the exit goes somewhere new, the jump is recorded,
    // the guide does not cross the jump, and at the jump the crayon turns around the tile before the stretch.
    expect(same(4, 2) && same(5, 3)).toBe(true);
    expect(same(6, 2) || same(6, 3) || same(6, 4)).toBe(false);
    expect(path.rhythm.jumps).toEqual([3]);
    const landed = path.tiles[3]!;
    for (const point of path.guide.points.slice(path.anchors[3], path.anchors[4])) {
      expect(Math.hypot(point.x - landed.x, point.y - landed.y)).toBeLessThan(1e-9);
    }
    const jumping = walkingCrayonAt(path, 2)!;
    expect(jumping.standing).toBe(3);
    expect(jumping.pivot).toEqual({ x: path.tiles[1]!.x, y: path.tiles[1]!.y });
    // And the camera does not glide across the jump: just before it, it is near the stretch's end; soon after, near
    // the stretch's start.
    const before = cameraAt(path, 1.49);
    const after = cameraAt(path, 2.7);
    expect(Math.hypot(before.x - landed.x, before.y - landed.y)).toBeLessThan(1.5);
    expect(Math.hypot(after.x - path.tiles[4]!.x, after.y - path.tiles[4]!.y)).toBeLessThan(1.5);
  });

  test("the finished guide is exactly the travelled road", () => {
    // Given a winding riff.
    const times = Array.from({ length: 24 }, (_, i) => i / 4);
    // When it becomes a sewing.
    const path = buildRhythmPath(times, tempo);
    // Then every stitch endpoint remains in place when pulled taut on the result screen.
    expect(path.anchors).toHaveLength(path.tiles.length);
    for (const [i, tile] of path.tiles.entries()) {
      const point = path.guide.points[path.anchors[i] ?? -1];
      expect(point).toEqual({ x: tile.x, y: tile.y });
    }
    expect(path.guide.colors.every((color) => color !== null)).toBe(true);
  });
});

const route: Route = {
  points: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 9 }, { x: 0, y: 9 }, { x: 0, y: 0 }],
  colors: ["#efe2c6", "#efe2c6", "#efe2c6", "#efe2c6"],
  length: 42,
};

test.each([
  ["sunday-dub", "07135e7600b326a11365001559bb2737def690e194fd0945930cdbe59e02faa1"],
  ["adventures-of-yuki", "4d1c1c60c51af4aaacc68bf90e08dcab6839bdd2d755deacdaa50bf6c0c38642"],
  ["blippy-trance", "8648ec52fd226f702a6d454bb8b01240d4bc7862ae1c13fbf142b5f0180c588d"],
])("unflagged %s retains every legacy tile, sweep and guide point", async (id, expected) => {
  // Given a real legacy chart and a fixed guide, with the pre-change path fingerprint.
  const chart = chartSchema.parse(await Bun.file(new URL(`../public/songs/${id}/chart.json`, import.meta.url)).json());
  // When it uses the unchanged picture-path builder.
  const path = buildPath(chart.notes, route);
  // Then its complete output still equals the legacy result.
  expect(chart.road).toBeUndefined();
  expect(path.rhythm).toBeUndefined();
  expect(new Bun.CryptoHasher("sha256").update(JSON.stringify(path)).digest("hex")).toBe(expected);
});

test("rhythm charts require an ordered tempo map starting at zero", () => {
  // Given the fields of a chart at the JSON boundary.
  const base = { version: 4, title: "test", audio: "song.mp3", bpm: 120, offset: 0, duration: 10, anchors: [], difficulty: "hard", notes: [0, 0.5], road: "rhythm" };
  // When malformed tempo maps are parsed.
  const results = [undefined, [], [[1, 120]], [[0, 120], [0, 150]], [[0, 120], [1, 0]]]
    .map((map) => chartSchema.safeParse({ ...base, tempo: map }).success);
  // Then none reaches the layout as a rhythm chart.
  expect(results).toEqual([false, false, false, false, false]);
});
