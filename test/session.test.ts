import { describe, expect, test } from "bun:test";
import { sessionOf } from "../src/session";

// 코드 리뷰 2026-11-04 중복: 화면을 바꿀 때마다 Session 필드를 손으로 복사했다.
describe("sessionOf", () => {
  test("곡 한 판에 딸린 필드만 옮기고 화면 고유 필드는 두고 온다", () => {
    const playing = {
      kind: "playing",
      song: { id: "a" },
      difficulty: "easy",
      pictureName: "whale",
      sections: [],
      play: { score: 1 },
      path: { tiles: [] },
      duration: 9,
      bursts: [1],
      source: { kind: "ready" },
      feedback: null,
      paused: false,
    } as never;
    const carried = sessionOf(playing);
    expect(Object.keys(carried).sort()).toEqual(["difficulty", "path", "pictureName", "play", "sections", "song"]);
    expect(carried).toMatchObject({ song: { id: "a" }, difficulty: "easy", pictureName: "whale", path: { tiles: [] } });
    expect((carried as { play: unknown }).play).toBe((playing as { play: unknown }).play);
  });
});
