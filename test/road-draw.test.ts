import { beforeAll, describe, expect, test } from "bun:test";
import { fakeContext, hashCalls, installFakeDom } from "./fake-canvas";
import { BREACH_TIMES, breachFrames } from "./road-frames";

beforeAll(() => {
  installFakeDom();
});

// 코드 리뷰 2026-11-04 중복: 멈춤 화살표(drawPauses)와 걷는 크레용 윤곽을 공용 함수로 합치기 전의 그리기 순서를 고정한다.
// 값은 합치기 전 코드로 잰 것이다. 그림을 일부러 바꾸면 같이 바꾼다.
describe("breach 리듬 길 그리기 순서", () => {
  test("길·멈춤 화살표·크레용(drawRoadOnly)", async () => {
    const { Painter } = await import("../src/canvas");
    const { drawRoadOnly } = await import("../src/track");
    const frames = await breachFrames(BREACH_TIMES);
    const logs = frames.map((frame) => {
      const { ctx, calls } = fakeContext(360, 640);
      drawRoadOnly(new Painter(ctx), frame, { width: 360, height: 640 });
      return [calls.length, hashCalls(calls)];
    });
    expect(logs).toEqual([
      [355, 2018664767], [831, 2160237072], [871, 2572951283], [1179, 4115045218],
      [2151, 3042698040], [2197, 3190068628], [2773, 1887117528], [2835, 3138513979],
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
      return [calls.length, hashCalls(calls)];
    });
    expect(logs).toEqual([
      [177, 3855206336], [177, 1698610466], [177, 4157539056], [177, 666944860],
      [177, 4292545627], [177, 2995822345], [177, 3681329983], [177, 3383116356],
    ]);
  });
});
