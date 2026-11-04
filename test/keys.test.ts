import { describe, expect, test } from "bun:test";
import { startsSong } from "../src/keys";

// 코드 리뷰 2026-11-04 낮음: 준비 화면에서 Shift·CapsLock 단독으로도 곡이 시작됐다.
const key = (over: Partial<Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey">>) => ({
  key: "a",
  code: "KeyA",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  ...over,
});

describe("startsSong", () => {
  test("글자·Space·Enter 는 곡을 시작한다", () => {
    expect(startsSong(key({}))).toBe(true);
    expect(startsSong(key({ key: " ", code: "Space" }))).toBe(true);
    expect(startsSong(key({ key: "Enter", code: "Enter" }))).toBe(true);
  });

  test("수식키·잠금키 단독과 Tab 은 시작하지 않는다", () => {
    for (const [name, code] of [
      ["Shift", "ShiftLeft"],
      ["Control", "ControlRight"],
      ["Alt", "AltLeft"],
      ["Meta", "MetaLeft"],
      ["CapsLock", "CapsLock"],
      ["NumLock", "NumLock"],
      ["Tab", "Tab"],
    ] as const) {
      expect(startsSong(key({ key: name, code }))).toBe(false);
    }
  });

  test("Cmd·Ctrl·Alt 조합(브라우저 단축키)은 시작하지 않는다", () => {
    expect(startsSong(key({ metaKey: true }))).toBe(false);
    expect(startsSong(key({ ctrlKey: true }))).toBe(false);
    expect(startsSong(key({ altKey: true }))).toBe(false);
  });

  test("Shift 와 함께 누른 글자는 시작한다(지금과 같음)", () => {
    expect(startsSong(key({ key: "A" }))).toBe(true);
  });
});
