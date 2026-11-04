import { afterEach, describe, expect, test } from "bun:test";
import { readStored, readStoredJson, readStoredNumber, removeStored, writeStored } from "../src/storage";

// 코드 리뷰 2026-11-04 높음 3·4: 저장소 접근을 한 곳에서 안전하게 한다.
const saved = new Map<string, string>();
const working = {
  getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => void saved.set(key, value),
  removeItem: (key: string) => void saved.delete(key),
} as unknown as Storage;
const refusing = {
  getItem: () => {
    throw new DOMException("blocked", "SecurityError");
  },
  setItem: () => {
    throw new DOMException("full", "QuotaExceededError");
  },
  removeItem: () => {
    throw new DOMException("blocked", "SecurityError");
  },
} as unknown as Storage;

afterEach(() => saved.clear());

describe("readStored and writeStored", () => {
  test("a working storage keeps and gives back what was written", () => {
    expect(writeStored("k", "v", working)).toBe(true);
    expect(readStored("k", working)).toBe("v");
    removeStored("k", working);
    expect(readStored("k", working)).toBeNull();
  });

  test("a storage the browser refuses reads as nothing kept and writes report failure without throwing", () => {
    expect(readStored("k", refusing)).toBeNull();
    expect(writeStored("k", "v", refusing)).toBe(false);
    expect(() => removeStored("k", refusing)).not.toThrow();
  });

  test("errors other than the browser refusing come through", () => {
    const broken = {
      getItem: () => {
        throw new TypeError("bug");
      },
    } as unknown as Storage;
    expect(() => readStored("k", broken)).toThrow(TypeError);
  });
});

describe("readStoredNumber", () => {
  test("a kept number reads back; none kept, a non-number or a refused read gives the fallback", () => {
    saved.set("n", "0.4");
    expect(readStoredNumber("n", 1, working)).toBe(0.4);
    expect(readStoredNumber("none", 1, working)).toBe(1);
    saved.set("bad", "abc");
    expect(readStoredNumber("bad", 1, working)).toBe(1);
    expect(readStoredNumber("n", 1, refusing)).toBe(1);
  });
});

// 코드 리뷰 2026-11-04 낮음: 빈 문자열은 0 이 아니라 저장값 없음이다.
describe("readStoredNumber 의 빈 값", () => {
  test("빈 문자열이나 공백만 있는 값은 fallback 이다", () => {
    saved.set("empty", "");
    expect(readStoredNumber("empty", 1, working)).toBe(1);
    saved.set("blank", "  ");
    expect(readStoredNumber("blank", 1, working)).toBe(1);
    saved.set("zero", "0");
    expect(readStoredNumber("zero", 1, working)).toBe(0);
  });
});

// 코드 리뷰 2026-11-04 중복: best·playlog 의 JSON 읽기를 한 곳으로.
describe("readStoredJson", () => {
  test("저장된 JSON 을 읽고, 없거나 깨졌거나 읽기가 거절되면 각각 알려 준다", () => {
    saved.set("j", '{"a":1}');
    expect(readStoredJson("j", working)).toEqual({ kind: "value", value: { a: 1 } });
    expect(readStoredJson("none", working)).toEqual({ kind: "none" });
    saved.set("broken", "{not json");
    expect(readStoredJson("broken", working)).toEqual({ kind: "broken", raw: "{not json" });
    expect(readStoredJson("j", refusing)).toEqual({ kind: "none" });
  });
});
