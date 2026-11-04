import { afterEach, beforeEach, describe, expect, test } from "bun:test";
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

// 코드 리뷰 2026-11-04 높음 3·4: 브라우저가 저장소를 막거나 가득 찼을 때 예외가 화면을 멈추던 문제.
describe("a storage the browser refuses", () => {
  const working = globalThis.localStorage;
  afterEach(() => {
    globalThis.localStorage = working;
  });
  const refusing = (name: "QuotaExceededError" | "SecurityError", what: "getItem" | "setItem"): Storage =>
    ({
      getItem: (key: string) => {
        if (what === "getItem") throw new DOMException("refused", name);
        return saved.get(key) ?? null;
      },
      setItem: () => {
        throw new DOMException("refused", name);
      },
    }) as unknown as Storage;

  test("a full storage does not stop a finished play from giving its best", () => {
    globalThis.localStorage = refusing("QuotaExceededError", "setItem");
    expect(recordBest("a", { grade: 70, score: 5000 })).toEqual({
      best: { grade: 70, score: 5000 },
      isNew: true,
      previous: null,
    });
  });

  test("a blocked storage reads as no bests, and a play on it still gives its best", () => {
    globalThis.localStorage = refusing("SecurityError", "getItem");
    expect(loadBests().size).toBe(0);
    expect(recordBest("a", { grade: 70, score: 5000 }).isNew).toBe(true);
  });

  test("an error that is not the browser refusing still comes through", () => {
    globalThis.localStorage = {
      getItem: () => {
        throw new TypeError("bug");
      },
    } as unknown as Storage;
    expect(() => loadBests()).toThrow(TypeError);
  });
});

// 코드 리뷰 2026-11-04 낮음: 손상된 저장값과 배열 저장값.
describe("손상되거나 모양이 다른 저장값", () => {
  test("저장값이 배열이면 인덱스를 곡 id 로 읽지 않는다", () => {
    saved.set(KEY, JSON.stringify([{ grade: 1, score: 2 }]));
    expect(loadBests().size).toBe(0);
  });

  test("잘린 저장값을 덮어쓰기 전에 원본을 따로 옮겨 둔다", () => {
    const broken = '{"a":{"grade":90,"score":5},"b":{"grade":80,"score":3}';
    saved.set(KEY, broken);
    recordBest("c", { grade: 10, score: 1 });
    expect(saved.get(`${KEY}.corrupt`)).toBe(broken);
    expect(JSON.parse(saved.get(KEY) ?? "")).toEqual({ c: { grade: 10, score: 1 } });
  });

  test("멀쩡한 저장값은 옮겨 두지 않는다", () => {
    recordBest("a", { grade: 10, score: 1 });
    recordBest("b", { grade: 10, score: 1 });
    expect(saved.has(`${KEY}.corrupt`)).toBe(false);
  });
});
