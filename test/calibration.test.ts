import { describe, expect, test } from "bun:test";
import { CATCH_S, clampLag, MAX_LAG_S } from "../src/calibration";

// 코드 리뷰 2026-11-04 낮음: 저장된 lag 은 아무 값이나 통과했고, 박자 맞추기의 클램프는 하는 일이 없었다.
describe("clampLag", () => {
  test("저장된 박자 값은 ±0.3초로 자른다", () => {
    expect(clampLag(5)).toBe(MAX_LAG_S);
    expect(clampLag(-5)).toBe(-MAX_LAG_S);
    expect(clampLag(0.12)).toBe(0.12);
    expect(MAX_LAG_S).toBe(0.3);
  });

  test("박자 맞추기가 받는 누르기는 그 범위 안이라 잰 값은 따로 자르지 않아도 된다", () => {
    expect(CATCH_S).toBeLessThanOrEqual(MAX_LAG_S);
  });
});
