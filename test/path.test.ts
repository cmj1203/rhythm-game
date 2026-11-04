import { describe, expect, test } from "bun:test";
import type { Route } from "../src/drawing";
import { routeOf } from "../src/drawing";
import { layCourse, layGuide } from "../src/guide";
import { buildPath, cameraAt, orbiterAngle, type Path, shareEnding, type Sweep } from "../src/path";

const square: Route = routeOf({
  name: "square",
  strokes: [
    {
      part: 0,
      color: "#ff0000",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
        { x: 0, y: 0 },
      ],
    },
  ],
});

/** Notes `gaps` seconds apart, from 1 s. */
function notesAt(gaps: readonly number[]): number[] {
  const times = [1];
  for (const gap of gaps) times.push((times[times.length - 1] ?? 0) + gap);
  return times;
}

const steady = notesAt(Array.from({ length: 39 }, () => 0.5));

describe("buildPath", () => {
  const path = buildPath(steady, square);

  test("one tile per note after a start tile, a sweep around every tile, a stitch per note", () => {
    expect(path.tiles).toHaveLength(steady.length + 1);
    expect(path.sweeps).toHaveLength(steady.length + 1);
    expect(path.anchors).toHaveLength(steady.length + 1);
    expect(path.weights).toHaveLength(steady.length);
    // The start tile comes one usual interval before the first note.
    expect(path.tiles[0]?.time).toBeCloseTo(0.5);
    for (const [i, time] of steady.entries()) expect(path.tiles[i + 1]?.time).toBe(time);
  });

  test("neighbouring tiles are one unit apart", () => {
    for (let i = 0; i + 1 < path.tiles.length; i++) {
      const [a, b] = [path.tiles[i], path.tiles[i + 1]];
      expect(Math.hypot((b?.x ?? 0) - (a?.x ?? 0), (b?.y ?? 0) - (a?.y ?? 0))).toBeCloseTo(1, 9);
    }
  });

  test("each sweep runs from its tile's time to the next and ends on the next tile", () => {
    for (let i = 0; i + 1 < path.tiles.length; i++) {
      const sweep = path.sweeps[i] as Sweep;
      const pivot = path.tiles[i];
      const next = path.tiles[i + 1];
      expect(sweep.startTime).toBe(pivot?.time ?? Number.NaN);
      expect(sweep.endTime).toBe(next?.time ?? Number.NaN);
      const end = orbiterAngle(sweep, sweep.endTime);
      expect((pivot?.x ?? 0) + Math.cos(end)).toBeCloseTo(next?.x ?? Number.NaN, 9);
      expect((pivot?.y ?? 0) + Math.sin(end)).toBeCloseTo(next?.y ?? Number.NaN, 9);
    }
  });

  test("a usual-length gap is half a turn at normal pace, sewn at weight 1", () => {
    for (const sweep of path.sweeps) {
      expect(Math.abs(sweep.angle)).toBeCloseTo(Math.PI, 9);
      expect(sweep.pace).toBe("normal");
    }
    expect(path.weights.every((weight) => weight === 1)).toBe(true);
  });

  test("the stitches move forward along the picture and the last note completes it", () => {
    for (let i = 1; i < path.anchors.length; i++) {
      expect(path.anchors[i] ?? 0).toBeGreaterThanOrEqual(path.anchors[i - 1] ?? 0);
    }
    expect(path.anchors[0]).toBe(0);
    expect(path.anchors[path.anchors.length - 1]).toBe(path.guide.endIndex);
  });

  test("a wait longer than 1.5 beats is a slow sweep, sewn thicker", () => {
    const times = notesAt([...Array.from({ length: 20 }, () => 0.5), 2, ...Array.from({ length: 20 }, () => 0.5)]);
    const slow = buildPath(times, square);
    // sweeps[i + 1] is the sweep from note i to note i + 1; the long gap follows note 20.
    expect(slow.sweeps[21]?.pace).toBe("slow");
    expect(Math.abs(slow.sweeps[21]?.angle ?? 0)).toBeCloseTo(Math.PI, 9);
    expect(slow.weights[21]).toBe(1.8);
    expect(slow.sweeps.filter((sweep) => sweep.pace === "slow")).toHaveLength(1);
  });

  test("a run of six or more half-beat gaps is turned through twice as fast; a run of five is not", () => {
    const quick = (run: number): Path =>
      buildPath(
        notesAt([
          ...Array.from({ length: 30 }, () => 0.5),
          ...Array.from({ length: run }, () => 0.25),
          ...Array.from({ length: 10 }, () => 0.5),
        ]),
        square,
      );
    const six = quick(6);
    const sixFast = six.sweeps.slice(31, 37);
    expect(sixFast.every((sweep) => sweep.pace === "fast")).toBe(true);
    expect(sixFast.every((sweep) => Math.abs(Math.abs(sweep.angle) - Math.PI) < 1e-9)).toBe(true);
    expect(six.sweeps.filter((sweep) => sweep.pace === "fast")).toHaveLength(6);
    expect(six.weights[31]).toBeCloseTo(Math.sqrt(0.5));

    const five = quick(5);
    expect(five.sweeps.some((sweep) => sweep.pace === "fast")).toBe(false);
    expect(Math.abs(five.sweeps[31]?.angle ?? 0)).toBeCloseTo(Math.PI / 2, 9);
  });

  test("a chart on thirds of a beat rounds gaps to twelfths, a straight one to quarters", () => {
    // Usual gap 0.6 s; the odd gap of 0.2 s is a third of it.
    const swing = buildPath(notesAt([...Array.from({ length: 30 }, () => 0.6), 0.2, 0.4, ...Array.from({ length: 10 }, () => 0.6)]), square);
    expect(Math.abs(swing.sweeps[31]?.angle ?? 0)).toBeCloseTo(Math.PI / 3, 9);
    expect(Math.abs(swing.sweeps[32]?.angle ?? 0)).toBeCloseTo((2 * Math.PI) / 3, 9);

    const straight = buildPath(notesAt([...Array.from({ length: 30 }, () => 0.6), 0.15, 0.45, ...Array.from({ length: 10 }, () => 0.6)]), square);
    expect(Math.abs(straight.sweeps[31]?.angle ?? 0)).toBeCloseTo(Math.PI / 4, 9);
    expect(Math.abs(straight.sweeps[32]?.angle ?? 0)).toBeCloseTo((3 * Math.PI) / 4, 9);
  });
});

describe("shareEnding", () => {
  const base = buildPath(steady, square);
  const end = base.guide.endIndex;

  test("notes left at the end of the picture share its last stretch", () => {
    const early: Path = { ...base, anchors: [0, end - 30, end, end, end] };
    expect(shareEnding(early).anchors).toEqual([0, end - 30, end - 20, end - 10, end]);
  });

  test("a road whose last note alone completes the picture is left as it is", () => {
    const done: Path = { ...base, anchors: [0, end - 30, end] };
    expect(shareEnding(done)).toBe(done);
  });
});

describe("orbiterAngle", () => {
  test("turns at a steady speed, before and after the sweep too", () => {
    const sweep: Sweep = { startAngle: 1, angle: -Math.PI, startTime: 2, endTime: 3, pace: "normal", isTwirl: false };
    expect(orbiterAngle(sweep, 2)).toBe(1);
    expect(orbiterAngle(sweep, 2.5)).toBeCloseTo(1 - Math.PI / 2);
    expect(orbiterAngle(sweep, 3)).toBeCloseTo(1 - Math.PI);
    expect(orbiterAngle(sweep, 4)).toBeCloseTo(1 - 2 * Math.PI);
  });
});

describe("cameraAt", () => {
  // A straight road walked at one unit a second.
  const line = { tiles: Array.from({ length: 11 }, (_, i) => ({ x: i, y: 2 * i, time: i })) } as unknown as Path;

  test("on a straight, steady stretch the camera is where the walker is", () => {
    const at = cameraAt(line, 5.3);
    expect(at.x).toBeCloseTo(5.3, 9);
    expect(at.y).toBeCloseTo(10.6, 9);
  });

  test("well before the first tile and after the last, the camera stands on it", () => {
    expect(cameraAt(line, -5)).toEqual({ x: expect.closeTo(0, 9), y: expect.closeTo(0, 9) });
    expect(cameraAt(line, 20)).toEqual({ x: expect.closeTo(10, 9), y: expect.closeTo(20, 9) });
  });

  test("at a corner the camera cuts inside it by a sixth of its 0.75 s reach", () => {
    const corner = {
      tiles: [
        { x: 0, y: 0, time: 0 },
        { x: 1, y: 0, time: 1 },
        { x: 1, y: 1, time: 2 },
      ],
    } as unknown as Path;
    // The moments within 0.75 s weigh less the further they are, evenly down to nothing.
    const at = cameraAt(corner, 1);
    expect(at.x).toBeCloseTo(1 - 0.75 / 6, 9);
    expect(at.y).toBeCloseTo(0.75 / 6, 9);
  });
});

describe("layGuide / layCourse", () => {
  const route: Route = {
    points: [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 8, y: 0 },
    ],
    colors: [null, "#123456"],
    length: 8,
  };

  test("the guide is resized to the length asked for, with a point every quarter unit", () => {
    const guide = layGuide(route, 4);
    expect(guide.points).toHaveLength(17);
    expect(guide.endIndex).toBe(16);
    expect(guide.length).toBe(4);
    expect(guide.points[1]).toEqual({ x: 0.25, y: 0 });
    expect(guide.points[16]?.x).toBeCloseTo(4);
    expect(guide.colors[0]).toBeNull();
    expect(guide.colors[9]).toBe("#123456");
  });

  test("the bounds leave out where the thread only passes behind the cloth", () => {
    const guide = layGuide(
      { points: [{ x: 0, y: 0 }, { x: 0, y: 4 }, { x: 4, y: 4 }], colors: [null, "#123456"], length: 8 },
      8,
    );
    // The corner point at (0, 4) still ends the hidden piece, so the sewn line starts a step after it.
    expect(guide.bounds).toEqual({ minX: 0.25, minY: 4, maxX: 4, maxY: 4 });
  });

  test("the course starts and ends where the guide does and runs on past its end", () => {
    const guide = layGuide(route, 4);
    const course = layCourse(guide);
    expect(course.points[0]).toEqual({ x: 0, y: 0 });
    expect(course.points[course.endIndex]?.x).toBeCloseTo(4);
    expect(course.marks[course.endIndex]).toBe(guide.endIndex);
    expect(course.points).toHaveLength(course.endIndex + 1 + 32);
    expect(course.points[course.points.length - 1]?.x).toBeCloseTo(4 + 32 * 0.25);
    expect(course.marks.slice(course.endIndex).every((mark) => mark === guide.endIndex)).toBe(true);
  });
});
