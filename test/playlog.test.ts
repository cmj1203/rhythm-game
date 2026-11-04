import { describe, expect, test } from "bun:test";
import { loadPlaylog, recordPlay } from "../src/playlog";

// 코드 리뷰 2026-11-04 높음 4: getItem 이 SecurityError 를 던지면 설정 화면·기록이 모두 실패하던 문제.
const blocked = {
  getItem: () => {
    throw new DOMException("blocked", "SecurityError");
  },
  setItem: () => {
    throw new DOMException("blocked", "SecurityError");
  },
} as unknown as Storage;

const play = {
  songId: "a",
  day: "2026-11-04",
  difficulty: "easy",
  notes: 10,
  perfect: 10,
  great: 0,
  good: 0,
  missPressed: 0,
  missUnpressed: 0,
  maxStrain: 0,
  gameOver: false,
  lagMs: 0,
} as const;

describe("a blocked storage", () => {
  test("reads as no plays kept", () => {
    expect(loadPlaylog(blocked)).toEqual([]);
  });

  test("a play on it is not kept, without throwing", () => {
    expect(() => recordPlay(play, blocked)).not.toThrow();
  });
});
