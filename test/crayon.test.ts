import { beforeAll, describe, expect, test } from "bun:test";
import { Painter } from "../src/canvas";
import { type Call, fakeContext, hashCalls, installFakeDom } from "./fake-canvas";

let dom: ReturnType<typeof installFakeDom>;
beforeAll(() => {
  dom = installFakeDom();
});

// 코드 리뷰 2026-11-04 낮음: drawGrain 이 장치 픽셀 크기로 채워 DPR 2 에서 4배 넓이를 칠했다.
describe("drawGrain", () => {
  test("화면 크기(CSS 픽셀)만큼만 채운다", async () => {
    const { drawGrain } = await import("../src/crayon");
    // 장치 픽셀 캔버스 720×1280 = CSS 360×640 의 DPR 2.
    const { ctx, calls } = fakeContext(720, 1280);
    drawGrain(new Painter(ctx), { x: 3, y: 4 }, Math.PI / 2, { width: 360, height: 640 });
    expect(calls.filter(([name]) => name === "fillRect")).toEqual([["fillRect", 0, 0, 360, 640]]);
    expect(calls.find(([name]) => name === "pattern.setTransform")).toEqual(["pattern.setTransform", ["translate", 3, 4], ["rotate", 90]]);
  });
});

// 코드 리뷰 2026-11-04 중복: 패턴 캐시와 크레용 윤곽을 합치기 전의 그리기 순서를 고정한다.
describe("그리기 순서 고정", () => {
  test("한 컨텍스트의 무늬 패턴은 한 번만 만든다", async () => {
    const { drawGrain } = await import("../src/crayon");
    const { drawCloth } = await import("../src/embroidery");
    const { ctx, calls } = fakeContext();
    const before = dom.tiles.length;
    const painter = new Painter(ctx);
    const view = { tileSize: 10, camera: { x: 0, y: 0 }, anchor: { x: 0, y: 0 }, angle: 0 };
    for (let i = 0; i < 3; i++) {
      drawGrain(painter, { x: 0, y: 0 }, 0, { width: 10, height: 10 });
      drawCloth(painter, view, { width: 10, height: 10 });
    }
    expect(calls.filter(([name]) => name === "createPattern")).toHaveLength(2);
    expect(dom.tiles.length - before).toBe(2);
  });

  test("무늬 타일 그림(크레용 종이결, 천 결)이 바뀌지 않는다", async () => {
    const { drawGrain } = await import("../src/crayon");
    const { drawCloth } = await import("../src/embroidery");
    const { ctx } = fakeContext();
    const before = dom.tiles.length;
    drawGrain(new Painter(ctx), { x: 0, y: 0 }, 0, { width: 10, height: 10 });
    drawCloth(new Painter(ctx), { tileSize: 10, camera: { x: 0, y: 0 }, anchor: { x: 0, y: 0 }, angle: 0 }, { width: 10, height: 10 });
    const [grain, weave] = dom.tiles.slice(before) as [Call[], Call[]];
    expect(grain).toHaveLength(1801);
    expect(grain.slice(0, 3)).toEqual([["fillStyle=", "#0b0d12"], ["globalAlpha=", 0.300038349], ["fillRect", 18, 13, 2, 2]]);
    expect(hashCalls(grain)).toBe(1395011348);
    expect(weave).toEqual([
      ["fillStyle=", "rgba(255, 255, 255, 0.022)"],
      ["fillRect", 0, 0, 6, 1],
      ["fillStyle=", "rgba(255, 255, 255, 0.014)"],
      ["fillRect", 3, 0, 1, 6],
    ]);
  });

  test("크레용(타이틀·그림 길)의 윤곽·테두리·안개·채움 순서", async () => {
    const { drawCrayon } = await import("../src/crayon");
    const { ctx, calls } = fakeContext();
    drawCrayon(new Painter(ctx), { x: 10, y: 20 }, 0.5, 30, "#ff0000");
    expect(calls).toEqual(CRAYON_CALLS);
  });
});

const CRAYON_CALLS: Call[] = [
  ["save"], ["translate", 10, 20], ["rotate", 3.641592654],
  ["beginPath"], ["moveTo", 0, -1.7], ["lineTo", 9.6, -5.1], ["lineTo", 30, -5.1], ["lineTo", 30, 5.1], ["lineTo", 9.6, 5.1], ["lineTo", 0, 1.7], ["closePath"],
  ["lineJoin=", "round"], ["lineWidth=", 3], ["strokeStyle=", "#0b0d12"], ["shadowColor=", "#0b0d12"], ["shadowBlur=", 10.5], ["stroke"],
  ["shadowBlur=", 0], ["fillStyle=", "#ff0000"], ["fill"], ["restore"],
];
