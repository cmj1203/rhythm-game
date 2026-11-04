import { describe, expect, test } from "bun:test";
import { cameraAt, type Path, type Tile } from "../src/path";
import { standingAt } from "../src/walking-crayon";

// 코드 리뷰 2026-11-04 중복: "time 이하인 마지막 타일" 이분 탐색이 walking-crayon 과 path(카메라)에 따로 있었다.
const tiles = [0, 1, 1, 2, 4].map((time, i): Tile => ({ x: i, y: 0, time }) as Tile);

describe("standingAt", () => {
  test("time 이하인 마지막 타일, 첫 타일 전에는 0", () => {
    expect(standingAt(tiles, -1)).toBe(0);
    expect(standingAt(tiles, 0)).toBe(0);
    expect(standingAt(tiles, 0.99)).toBe(0);
    expect(standingAt(tiles, 1)).toBe(2);
    expect(standingAt(tiles, 3)).toBe(3);
    expect(standingAt(tiles, 4)).toBe(4);
    expect(standingAt(tiles, 99)).toBe(4);
    expect(standingAt([], 1)).toBe(0);
  });

  test("카메라도 같은 타일에서 출발해 움직인다(합치기 전 값)", () => {
    const path = { tiles } as unknown as Path;
    const at = [-1, 0, 0.5, 1, 1.5, 3, 4, 9].map((time) => cameraAt(path, time));
    expect(at.map(({ x, y }) => [Math.round(x * 1e9) / 1e9, Math.round(y * 1e9) / 1e9])).toEqual(CAMERA);
  });
});

const CAMERA = [[0, 0], [0.125, 0], [0.560185185, 0], [1.5, 0], [2.44212963, 0], [3.5, 0], [3.9375, 0], [4, 0]];
