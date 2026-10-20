import { describe, expect, test } from "bun:test";
import { backwards, routeOf } from "../src/drawing";

describe("routeOf", () => {
  test("joins strokes into one line, going on with the nearest end and reversing a stroke when needed", () => {
    const route = routeOf({
      name: "two",
      strokes: [
        { part: 0, color: "#111111", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
        // Its tail (3, 0) is nearer the pen at (1, 0) than its head, so it is sewn backwards.
        { part: 1, color: "#222222", points: [{ x: 3, y: 5 }, { x: 3, y: 0 }] },
      ],
    });
    expect(route.points).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 5 },
    ]);
    // The jump between strokes carries no thread.
    expect(route.colors).toEqual(["#111111", null, "#222222"]);
    expect(route.length).toBe(1 + 2 + 5);
  });

  test("picks the nearest stroke, not the next in the file", () => {
    const route = routeOf({
      name: "three",
      strokes: [
        { part: 0, color: "#111111", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
        { part: 1, color: "#222222", points: [{ x: 50, y: 0 }, { x: 51, y: 0 }] },
        { part: 2, color: "#333333", points: [{ x: 2, y: 0 }, { x: 3, y: 0 }] },
      ],
    });
    expect(route.colors).toEqual(["#111111", null, "#333333", null, "#222222"]);
  });

  test("backwards sews the same line from its other end", () => {
    const route = { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], colors: ["#111111", null], length: 2 };
    expect(backwards(route)).toEqual({
      points: [{ x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 0 }],
      colors: [null, "#111111"],
      length: 2,
    });
    expect(route.points[0]).toEqual({ x: 0, y: 0 });
  });
});
