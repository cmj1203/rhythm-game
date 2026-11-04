import { describe, expect, test } from "bun:test";
import { FRAME_MISS_GRACE_S, judgementOf, missesAtFrame, PlayState, pressAt } from "../src/judge";

describe("judgementOf", () => {
  test("hit windows are ±60 / ±100 / ±140 ms, inclusive at the edge", () => {
    expect(judgementOf(0)).toBe("perfect");
    expect(judgementOf(0.06)).toBe("perfect");
    expect(judgementOf(-0.06)).toBe("perfect");
    expect(judgementOf(0.061)).toBe("great");
    expect(judgementOf(-0.1)).toBe("great");
    expect(judgementOf(0.101)).toBe("good");
    expect(judgementOf(0.14)).toBe("good");
    expect(judgementOf(-0.14)).toBe("good");
    expect(judgementOf(0.141)).toBeNull();
    expect(judgementOf(-0.141)).toBeNull();
  });
});

describe("PlayState.press", () => {
  test("a hit judges the note due, scores base + combo bonus and moves on", () => {
    const play = new PlayState([1, 2]);
    expect(play.press(1.03)).toEqual({ judgement: "perfect", index: 0, offsetMs: expect.closeTo(30, 6) });
    expect(play.score).toBe(1000 + 10);
    expect(play.press(1.88)).toEqual({ judgement: "good", index: 1, offsetMs: expect.closeTo(-120, 6) });
    expect(play.score).toBe(1010 + 300 + 20);
    expect(play.counts).toEqual({ perfect: 1, great: 0, good: 1, miss: 0 });
    expect(play.combo).toBe(2);
    expect(play.resolvedCount).toBe(2);
    expect(play.history).toEqual(["perfect", "good"]);
  });

  test("a press too far off counts for nothing and leaves the note due", () => {
    const play = new PlayState([1]);
    expect(play.press(0.5)).toBeNull();
    expect(play.resolvedCount).toBe(0);
    expect(play.score).toBe(0);
    expect(play.press(1)?.judgement).toBe("perfect");
  });

  test("a press after the last note is ignored", () => {
    const play = new PlayState([1]);
    play.press(1);
    expect(play.press(2)).toBeNull();
    expect(play.resolvedCount).toBe(1);
  });

  test("the combo bonus stops growing at a combo of 100", () => {
    const times = Array.from({ length: 101 }, (_, i) => i);
    const play = new PlayState(times);
    for (const time of times) play.press(time);
    // 101 perfects: 1000 each, bonus 10 × combo for combos 1..100, then capped at 10 × 100.
    expect(play.score).toBe(101 * 1000 + 10 * 5050 + 1000);
    expect(play.maxCombo).toBe(101);
  });
});

describe("PlayState.advance", () => {
  test("a note is missed only once more than 140 ms have passed", () => {
    const play = new PlayState([1, 2]);
    expect(play.advance(1.139)).toEqual([]);
    expect(play.advance(1.15)).toEqual([{ judgement: "miss", index: 0, offsetMs: 0 }]);
    expect(play.counts.miss).toBe(1);
    expect(play.history).toEqual(["miss"]);
    expect(play.resolvedCount).toBe(1);
  });

  test("several notes can be missed at once, and a miss breaks the combo but keeps the max combo", () => {
    const play = new PlayState([1, 2, 3, 4]);
    play.press(1);
    play.press(2);
    expect(play.advance(4.5).map((event) => event.index)).toEqual([2, 3]);
    expect(play.combo).toBe(0);
    expect(play.maxCombo).toBe(2);
  });

  test("a miss after a press costs less strain than a miss with no press", () => {
    const pressed = new PlayState([1, 2]);
    pressed.press(0.5); // too early to count, but it was a press for note 0
    pressed.advance(1.5);
    expect(pressed.missPressed).toBe(1);
    expect(pressed.missUnpressed).toBe(0);
    expect(pressed.danger).toBeCloseTo(4 / 20);

    const unpressed = new PlayState([1, 2]);
    unpressed.advance(1.5);
    expect(unpressed.missPressed).toBe(0);
    expect(unpressed.missUnpressed).toBe(1);
    expect(unpressed.danger).toBeCloseTo(6 / 20);
  });

  test("the press that hit the previous note does not count as a press for the next one", () => {
    const play = new PlayState([1, 2]);
    play.press(1);
    play.advance(3);
    expect(play.missUnpressed).toBe(1);
    expect(play.missPressed).toBe(0);
  });

  test("each hit takes one away from the strain; the peak is kept", () => {
    const play = new PlayState([1, 2, 3]);
    play.advance(1.5);
    play.press(2);
    expect(play.danger).toBeCloseTo(5 / 20);
    expect(play.maxStrain).toBe(6);
  });

  test("five pressed misses in a row end the game; after that nothing is judged", () => {
    const times = [1, 2, 3, 4, 5, 6];
    const play = new PlayState(times);
    for (const time of times.slice(0, 4)) {
      play.press(time - 0.5);
      play.advance(time + 0.5);
    }
    expect(play.overAt).toBeNull();
    play.press(4.5);
    play.advance(5.5);
    expect(play.overAt).toBeCloseTo(5.14);
    expect(play.danger).toBe(1);
    expect(play.press(6)).toBeNull();
    expect(play.advance(10)).toEqual([]);
    expect(play.resolvedCount).toBe(5);
  });

  test("four unpressed misses end the game, even inside one advance", () => {
    const play = new PlayState([1, 2, 3, 4, 5, 6]);
    const events = play.advance(100);
    expect(events).toHaveLength(4);
    expect(play.overAt).toBeCloseTo(4.14);
    expect(play.counts.miss).toBe(4);
  });
});

describe("PlayState accuracy and grade", () => {
  test("accuracy weighs perfect 1, great 0.7, good 0.4, miss 0 over all notes; the grade is rounded down", () => {
    const play = new PlayState([1, 2, 3, 4]);
    play.press(1);
    play.press(2.08);
    play.press(3.12);
    play.advance(5);
    expect(play.accuracy).toBeCloseTo(2.1 / 4);
    expect(play.grade).toBe(52);
  });

  test("only all perfects give 100; an empty chart gives 0", () => {
    const play = new PlayState([1, 2]);
    play.press(1);
    play.press(2);
    expect(play.grade).toBe(100);
    expect(new PlayState([]).accuracy).toBe(0);
  });

  test("notes not yet judged count as nothing", () => {
    const play = new PlayState([1, 2]);
    play.press(1);
    expect(play.grade).toBe(50);
  });
});

// 코드 리뷰 2026-11-04 높음 1·2: 누르기와 프레임이 서로 다른 시각으로 놓침을 정하던 문제.
describe("pressAt and missesAtFrame", () => {
  test("a press first misses the notes whose window closed before it, then judges the next note", () => {
    // 노트 [1.0, 1.2]. 마지막 프레임은 1.13 에서 놓침을 확인했고, 다음 프레임 전에 1.15 에 눌렀다.
    const play = new PlayState([1.0, 1.2]);
    expect(missesAtFrame(play, 1.13)).toEqual([]);
    const { misses, hit } = pressAt(play, 1.15);
    expect(misses).toEqual([{ judgement: "miss", index: 0, offsetMs: 0 }]);
    expect(hit).toEqual({ judgement: "perfect", index: 1, offsetMs: expect.closeTo(-50, 6) });
    // 노트 0 은 누름이 있었으나 늦게 확인된 것이 아니라, 누르기 전에 이미 창이 닫혀 있었다.
    expect(play.counts).toEqual({ perfect: 1, great: 0, good: 0, miss: 1 });
  });

  test("a frame does not miss a note a press delivered after it can still hit", () => {
    // 노트 [1.0, 1.5]. 프레임이 1.145 에 돌고, 그 뒤에 timeStamp 가 1.135 인 누르기가 배달된다.
    const play = new PlayState([1.0, 1.5]);
    expect(missesAtFrame(play, 1.145)).toEqual([]);
    expect(pressAt(play, 1.135).hit).toEqual({ judgement: "good", index: 0, offsetMs: expect.closeTo(135, 6) });
  });

  test("the frame still misses a note once its window and the grace after it are over", () => {
    const play = new PlayState([1.0, 1.5]);
    expect(missesAtFrame(play, 1.14 + FRAME_MISS_GRACE_S - 0.001)).toEqual([]);
    expect(missesAtFrame(play, 1.14 + FRAME_MISS_GRACE_S + 0.001)).toEqual([{ judgement: "miss", index: 0, offsetMs: 0 }]);
  });

  test("a press after a game over neither misses nor hits", () => {
    const play = new PlayState([1, 2, 3, 4, 5, 6]);
    missesAtFrame(play, 10);
    expect(play.overAt).not.toBeNull();
    expect(pressAt(play, 6)).toEqual({ misses: [], hit: null });
  });
});

// 코드 리뷰 2026-11-04 낮음: 창 경계와 카운트인 누르기.
describe("창 경계의 부동소수 오차", () => {
  test("노트 시각을 빼서 나온 오차가 정확히 창 경계면 그 창에 든다", () => {
    expect(judgementOf(1.06 - 1)).toBe("perfect");
    expect(judgementOf(1.1 - 1)).toBe("great");
    expect(judgementOf(3.14 - 3)).toBe("good");
    expect(judgementOf(100.14 - 100)).toBe("good");
    expect(judgementOf(0.86 - 1)).toBe("good");
  });

  test("누르기 판정도 같은 경계를 쓴다", () => {
    expect(new PlayState([1]).press(1.06)?.judgement).toBe("perfect");
    expect(new PlayState([1]).press(1.1)?.judgement).toBe("great");
    expect(new PlayState([3]).press(3.14)?.judgement).toBe("good");
    expect(new PlayState([100]).press(100.14)?.judgement).toBe("good");
  });

  test("경계 시각의 advance 는 아직 놓침으로 정하지 않아, 같은 시각의 누르기가 맞는다", () => {
    const play = new PlayState([100]);
    expect(play.advance(100.14)).toEqual([]);
    expect(pressAt(play, 100.14).hit?.judgement).toBe("good");
  });

  test("경계를 1µs 라도 넘으면 창 밖이다", () => {
    expect(judgementOf(0.140001)).toBeNull();
    expect(new PlayState([1]).advance(1.140001)).toHaveLength(1);
  });
});

describe("노트보다 한참 이른 누르기", () => {
  test("카운트인 중의 누르기는 첫 노트를 '눌렀는데 놓침'으로 만들지 않는다", () => {
    const play = new PlayState([1]);
    play.press(-2);
    play.advance(2);
    expect(play.missPressed).toBe(0);
    expect(play.missUnpressed).toBe(1);
  });

  test("노트 0.5초 전부터의 누르기는 그 노트를 누른 것으로 센다", () => {
    const play = new PlayState([1]);
    play.press(0.5);
    play.advance(2);
    expect(play.missPressed).toBe(1);
    expect(play.missUnpressed).toBe(0);
  });

  test("0.5초보다 이른 누르기 뒤에 다시 가까이 누르면 누른 것으로 센다", () => {
    const play = new PlayState([2]);
    play.press(1.2);
    play.press(1.7);
    play.advance(3);
    expect(play.missPressed).toBe(1);
  });
});
