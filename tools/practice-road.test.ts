import { describe, expect, test } from "bun:test";
import { cameraAt } from "../src/path";
import { PRACTICE_LAP, PracticeRoad } from "../src/practice-road";
import { standingAt } from "../src/walking-crayon";

const BURST_S = 0.45;

function standing(road: PracticeRoad, songTime: number): { readonly index: number; readonly x: number; readonly y: number } {
  const { tiles } = road.frameAt(songTime).path;
  const index = standingAt(tiles, songTime);
  const tile = tiles[index];
  if (tile === undefined) throw new RangeError("no standing tile");
  return { index, x: tile.x, y: tile.y };
}

/** The first moment from `from` on that the crayon's point touches the next ring, to the millisecond. */
function nextTouch(road: PracticeRoad, from: number): number {
  for (let t = from; t < from + 10; t += 0.001) if (road.touchedWithin(t, 0.0005)) return t;
  throw new RangeError("the crayon never touched the next ring");
}

describe("practice road", () => {
  test("without a press the crayon keeps turning on its tile", () => {
    // Given a fresh practice road.
    const road = new PracticeRoad(BURST_S);
    const start = road.songTimeAt(0);
    // When twenty seconds pass with no press.
    const stood = Array.from({ length: 81 }, (_, i) => standing(road, start + i * 0.25).index);
    // Then the crayon never leaves the tile it started on, though its point came round to the next ring.
    expect(stood.every((index) => index === stood[0])).toBe(true);
    expect(nextTouch(road, start)).toBeGreaterThan(start);
  });

  test("the camera glides while the crayon waits, with no jump as its point comes round", () => {
    // Given a crayon left waiting for ten seconds.
    const road = new PracticeRoad(BURST_S);
    const start = road.songTimeAt(0);
    // When the camera is followed every frame.
    const camera = Array.from({ length: 601 }, (_, i) => cameraAt(road.frameAt(start + i / 60).path, start + i / 60));
    // Then it never moves more than a twentieth of a tile in one frame.
    const steps = camera.slice(1).map((c, i) => Math.hypot(c.x - (camera[i]?.x ?? c.x), c.y - (camera[i]?.y ?? c.y)));
    expect(Math.max(...steps)).toBeLessThan(0.05);
  });

  test("a press as the point touches the next ring steps on, judged perfect", () => {
    // Given the moment the point first touches the next ring.
    const road = new PracticeRoad(BURST_S);
    const before = standing(road, road.songTimeAt(0));
    const touch = nextTouch(road, road.songTimeAt(0));
    // When the player presses then.
    const pressed = road.press(touch);
    // Then it is perfect and the crayon stands one tile on, one tile away.
    expect(pressed.judgement).toBe("perfect");
    const after = standing(road, touch + 0.01);
    expect(after.index).toBe(before.index + 1);
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeCloseTo(1, 9);
  });

  test("after a whole turn of waiting the next touch still lands", () => {
    // Given a player who let the first touch go by.
    const road = new PracticeRoad(BURST_S);
    const before = standing(road, road.songTimeAt(0)).index;
    const first = nextTouch(road, road.songTimeAt(0));
    const second = nextTouch(road, first + 0.05);
    // When they press on the next time the point comes round.
    const pressed = road.press(second);
    // Then that lands as perfect too.
    expect(second - first).toBeGreaterThan(0.5);
    expect(pressed.judgement).toBe("perfect");
    expect(standing(road, second + 0.01).index).toBe(before + 1);
  });

  test("a press far from any touch misses and the crayon stays", () => {
    // Given the first touch.
    const road = new PracticeRoad(BURST_S);
    const before = standing(road, road.songTimeAt(0)).index;
    const touch = nextTouch(road, road.songTimeAt(0));
    // When the player presses well before it.
    const pressed = road.press(touch - 0.3);
    // Then it is a miss and nothing moves on.
    expect(pressed.judgement).toBe("miss");
    expect(standing(road, touch - 0.29).index).toBe(before);
    expect(standing(road, touch + 0.2).index).toBe(before);
  });

  test("two laps hit in a row walk the same closed road with no jump", () => {
    // Given a player hitting every touch for two laps.
    const road = new PracticeRoad(BURST_S);
    let time = road.songTimeAt(0);
    const steps: { readonly x: number; readonly y: number }[] = [standing(road, time)];
    for (let i = 0; i < 2 * PRACTICE_LAP.length; i++) {
      time = nextTouch(road, time + 0.01);
      expect(road.press(time).judgement).toBe("perfect");
      steps.push(standing(road, time + 0.001));
    }
    // Then every step is one tile long, and each lap ends where it began.
    for (let i = 1; i < steps.length; i++) {
      const [a, b] = [steps[i - 1], steps[i]];
      if (a === undefined || b === undefined) throw new RangeError("missing step");
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(1, 9);
    }
    for (const lapEnd of [PRACTICE_LAP.length, 2 * PRACTICE_LAP.length]) {
      const [a, b] = [steps[0], steps[lapEnd]];
      if (a === undefined || b === undefined) throw new RangeError("missing lap end");
      expect(b.x).toBeCloseTo(a.x, 9);
      expect(b.y).toBeCloseTo(a.y, 9);
    }
  });
});
