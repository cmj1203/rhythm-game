import { describe, expect, test } from "bun:test";
import { COLOR, mixColors } from "../src/canvas";
import { blendViews, clothRect, fitView, threadAt, toScreen, type View } from "../src/embroidery";
import type { Path } from "../src/path";

describe("toScreen", () => {
  test("puts the camera at the anchor, scales by the tile size and turns around the anchor", () => {
    const view: View = { tileSize: 10, camera: { x: 1, y: 1 }, anchor: { x: 100, y: 50 }, angle: 0 };
    expect(toScreen(view, { x: 1, y: 1 })).toEqual({ x: 100, y: 50 });
    expect(toScreen(view, { x: 3, y: 0 })).toEqual({ x: 120, y: 40 });
    const turned = toScreen({ ...view, angle: Math.PI / 2 }, { x: 2, y: 1 });
    expect(turned.x).toBeCloseTo(100);
    expect(turned.y).toBeCloseTo(60);
  });
});

describe("blendViews", () => {
  test("goes evenly from one view to the other", () => {
    const from: View = { tileSize: 10, camera: { x: 0, y: 0 }, anchor: { x: 0, y: 0 }, angle: 0 };
    const to: View = { tileSize: 20, camera: { x: 4, y: 8 }, anchor: { x: 100, y: 200 }, angle: 1 };
    expect(blendViews(from, to, 0.25)).toEqual({ tileSize: 12.5, camera: { x: 1, y: 2 }, anchor: { x: 25, y: 50 }, angle: 0.25 });
  });
});

describe("clothRect", () => {
  test("the embroidery sits on the left of a wide screen and at the top of a narrow one", () => {
    expect(clothRect({ width: 1000, height: 500 })).toEqual({ x: 40, y: 50, width: 540, height: 400 });
    expect(clothRect({ width: 500, height: 1000 })).toEqual({ x: 30, y: 50, width: 440, height: 400 });
  });
});

describe("fitView", () => {
  test("centres the whole picture in the rectangle with a margin of 1.5 units", () => {
    const path = { guide: { bounds: { minX: -2, minY: 0, maxX: 2, maxY: 2 } } } as unknown as Path;
    expect(fitView(path, { x: 0, y: 0, width: 700, height: 500 })).toEqual({
      tileSize: Math.min(700 / 7, 500 / 5),
      camera: { x: 0, y: 1 },
      anchor: { x: 350, y: 250 },
      angle: 0,
    });
  });
});

describe("threadAt", () => {
  test("is the thread of the picture where the tile's stitch starts, dim where there is none", () => {
    const path = { anchors: [0, 2], guide: { colors: ["#111111", null, "#222222"] } } as unknown as Path;
    expect(threadAt(path, 0)).toBe("#111111");
    expect(threadAt(path, 1)).toBe("#222222");
    expect(threadAt({ ...path, anchors: [1] }, 0)).toBe(COLOR.dim);
  });
});

describe("mixColors", () => {
  test("mixes each channel and rounds it", () => {
    expect(mixColors("#000000", "#ffffff", 0.5)).toBe("rgb(128 128 128)");
    expect(mixColors("#ff0000", "#0000ff", 0)).toBe("rgb(255 0 0)");
    expect(mixColors("#ff0000", "#0000ff", 1)).toBe("rgb(0 0 255)");
  });
});
