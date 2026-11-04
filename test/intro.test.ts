import { describe, expect, test } from "bun:test";
import { Intro } from "../src/intro";

// 접근성 감사 2026-11-04 3절: 타이틀은 부팅 때 움직임 줄이기 설정을 한 번만 읽었다.
const title = { syllables: [{ lines: [], length: 1 }, { lines: [], length: 1 }], bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 } };

describe("타이틀 글자 쓰기와 움직임 줄이기", () => {
  test("처음부터 움직임 줄이기면 다 쓴 채로 시작한다", () => {
    const intro = new Intro({ isCalm: () => true, onReady: () => {} }, title);
    expect(intro.isOver).toBe(true);
  });

  test("쓰는 도중에 움직임 줄이기를 켜면 다음 프레임에 다 쓴 상태가 된다", () => {
    let calm = false;
    let ready = 0;
    const intro = new Intro({ isCalm: () => calm, onReady: () => ready++ }, title);
    expect(intro.advance(0).written).toEqual([0, 0]);
    calm = true;
    const frame = intro.advance(10);
    expect(intro.isOver).toBe(true);
    expect(frame.written).toEqual([1, 1]);
    expect(ready).toBe(1);
  });
});
