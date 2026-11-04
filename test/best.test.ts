import { beforeEach, describe, expect, test } from "bun:test";
import { loadBests, recordBest } from "../src/best";

const KEY = "livecanvas.best";
const saved = new Map<string, string>();
// best.ts reads the browser's localStorage; this one keeps it in memory for each test.
globalThis.localStorage = {
  getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => void saved.set(key, value),
} as unknown as Storage;

beforeEach(() => saved.clear());

describe("recordBest", () => {
  test("the first play of a song is its best", () => {
    expect(recordBest("a", { grade: 70, score: 5000 })).toEqual({
      best: { grade: 70, score: 5000 },
      isNew: true,
      previous: null,
    });
    expect(loadBests().get("a")).toEqual({ grade: 70, score: 5000 });
  });

  test("a higher mark wins even with a lower score; the same mark needs a higher score", () => {
    recordBest("a", { grade: 70, score: 5000 });
    expect(recordBest("a", { grade: 71, score: 100 })).toMatchObject({ isNew: true, previous: { grade: 70, score: 5000 } });
    expect(recordBest("a", { grade: 71, score: 100 })).toMatchObject({ isNew: false, best: { grade: 71, score: 100 } });
    expect(recordBest("a", { grade: 71, score: 101 }).isNew).toBe(true);
    expect(recordBest("a", { grade: 70, score: 99999 })).toEqual({
      best: { grade: 71, score: 101 },
      isNew: false,
      previous: { grade: 71, score: 101 },
    });
  });

  test("each song keeps its own best", () => {
    recordBest("a", { grade: 90, score: 1 });
    recordBest("b", { grade: 10, score: 1 });
    expect([...loadBests().entries()]).toEqual([
      ["a", { grade: 90, score: 1 }],
      ["b", { grade: 10, score: 1 }],
    ]);
  });
});

describe("loadBests", () => {
  test("nothing saved, a broken save or a save that is not an object reads as no bests", () => {
    expect(loadBests().size).toBe(0);
    saved.set(KEY, "{not json");
    expect(loadBests().size).toBe(0);
    saved.set(KEY, "null");
    expect(loadBests().size).toBe(0);
  });

  test("entries that do not read as a best are left out", () => {
    saved.set(KEY, JSON.stringify({ ok: { grade: 50, score: 10 }, noScore: { grade: 50 }, text: { grade: "50", score: 1 }, bare: 3 }));
    expect([...loadBests().keys()]).toEqual(["ok"]);
  });
});
