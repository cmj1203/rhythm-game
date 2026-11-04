import { beforeAll, describe, expect, test } from "bun:test";
import { type Call, fakeContext, hashCalls, installFakeDom } from "./fake-canvas";
import { BREACH_TIMES, breachFrames } from "./road-frames";

beforeAll(() => {
  installFakeDom();
});

// 코드 리뷰 2026-11-04 중복: 멈춤 화살표(drawPauses)와 걷는 크레용 윤곽을 공용 함수로 합치기 전의 그리기 순서를 고정한다.
// 값은 합치기 전 코드로 잰 것이다. 그림을 일부러 바꾸면 같이 바꾼다.
// 접근성 감사로 느림 원을 점선으로 바꿨으므로(setLineDash) 그 호출은 빼고 비교한다(기준값도 바꾸기 전 코드에서 같이 빼고 잰 것).
// 점선은 아래 시험이 따로 본다.
const withoutDash = (calls: readonly Call[]): Call[] => calls.filter(([name]) => name !== "setLineDash");
describe("breach 리듬 길 그리기 순서", () => {
  test("길·멈춤 화살표·크레용(drawRoadOnly)", async () => {
    const { Painter } = await import("../src/canvas");
    const { drawRoadOnly } = await import("../src/track");
    const frames = await breachFrames(BREACH_TIMES);
    const logs = frames.map((frame) => {
      const { ctx, calls } = fakeContext(360, 640);
      drawRoadOnly(new Painter(ctx), frame, { width: 360, height: 640 });
      return [withoutDash(calls).length, hashCalls(withoutDash(calls))];
    });
    expect(logs).toEqual([
      [354, 1217753621], [830, 932231794], [870, 2497210888], [1178, 3060262816],
      [2150, 4019920034], [2196, 464872001], [2772, 683024963], [2834, 3636165814],
    ]);
  });

  test("걷는 크레용(drawWalkingCrayon), 맞힌 끝이 부풀고 빛날 때", async () => {
    const { Painter } = await import("../src/canvas");
    const { drawWalkingCrayon } = await import("../src/walking-crayon-draw");
    const frames = await breachFrames(BREACH_TIMES);
    const view = { tileSize: 40, camera: { x: 0, y: 0 }, anchor: { x: 180, y: 320 }, angle: 0.3 };
    const logs = frames.map((frame) => {
      const { ctx, calls } = fakeContext();
      drawWalkingCrayon(new Painter(ctx), frame, view, { landing: frame.play.resolvedCount, swell: 0.2, flash: 1 });
      return [withoutDash(calls).length, hashCalls(withoutDash(calls))];
    });
    expect(logs).toEqual([
      [177, 3855206336], [177, 1698610466], [177, 4157539056], [177, 666944860],
      [177, 4292545627], [177, 2995822345], [177, 3681329983], [177, 3383116356],
    ]);
  });
});

// 접근성 감사 2026-11-04 2절: 빠름(pink)·느림(sky) 원이 색으로만 구분됐다(서로 1.57:1).
describe("빠르기 원의 모양", () => {
  test("느림 원만 점선이고, 그린 뒤 점선을 되돌린다", async () => {
    const { Painter } = await import("../src/canvas");
    const { buildRhythmPath } = await import("../src/rhythm-road");
    const { drawWalkingCrayon } = await import("../src/walking-crayon-draw");
    // 120BPM 에서 0.5초 뒤 3초를 쉬는 노트: 둘째 칸은 느리게 돈다.
    const path = buildRhythmPath([0, 0.5, 3.5, 4], [[0, 120]]);
    const view = { tileSize: 40, camera: { x: 0, y: 0 }, anchor: { x: 180, y: 320 }, angle: 0 };
    const dashesAt = (songTime: number): unknown[] => {
      const { ctx, calls } = fakeContext();
      drawWalkingCrayon(new Painter(ctx), { path, songTime }, view, null);
      return calls.filter(([name]) => name === "setLineDash").map(([, dash]) => dash);
    };
    expect(path.sweeps.map(({ pace }) => pace)).toContain("slow");
    const slow = path.sweeps.findIndex(({ pace }) => pace === "slow");
    const normal = path.sweeps.findIndex(({ pace }) => pace === "normal");
    expect(dashesAt(path.tiles[slow]!.time + 0.1)).toEqual([[6, 5], []]);
    expect(dashesAt(path.tiles[normal]!.time + 0.01)).toEqual([[], []]);
  });
});
