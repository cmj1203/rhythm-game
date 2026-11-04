import { describe, expect, test } from "bun:test";
import { easeInOutCubic, easeInOutQuad, easeOutCubic } from "../src/easing";

// 코드 리뷰 2026-11-04 중복: 같은 이름 easeInOut 이 track 에서는 3차, sections 에서는 2차 곡선이었다.
describe("완급 곡선", () => {
  test("3차·2차 easeInOut 은 끝과 가운데가 같고 그 사이 모양이 다르다", () => {
    for (const ease of [easeInOutCubic, easeInOutQuad]) {
      expect(ease(0)).toBe(0);
      expect(ease(0.5)).toBe(0.5);
      expect(ease(1)).toBe(1);
    }
    expect(easeInOutCubic(0.25)).toBe(4 * 0.25 ** 3);
    expect(easeInOutQuad(0.25)).toBe(2 * 0.25 * 0.25);
    expect(easeInOutCubic(0.75)).toBe(1 - (-2 * 0.75 + 2) ** 3 / 2);
    expect(easeInOutQuad(0.75)).toBe(1 - (-2 * 0.75 + 2) ** 2 / 2);
  });

  test("easeOutCubic", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(0.5)).toBe(1 - 0.5 ** 3);
    expect(easeOutCubic(1)).toBe(1);
  });
});
