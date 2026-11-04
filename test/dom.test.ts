import { beforeAll, describe, expect, test } from "bun:test";

// 코드 리뷰 2026-11-04 중복: 버튼 생성 + type="button" + pointerdown 전파 막기가 반복됐다.
type FakeButton = { className: string; textContent: string; type: string; listeners: Map<string, (event: unknown) => void> };

beforeAll(() => {
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string): FakeButton & { tag: string; addEventListener: (name: string, f: (event: unknown) => void) => void } => {
      const listeners = new Map<string, (event: unknown) => void>();
      return { tag, className: "", textContent: "", type: "submit", listeners, addEventListener: (name, f) => void listeners.set(name, f) };
    },
  };
});

describe("screenButton", () => {
  test("type=button 이고 누르면 onClick 을 부른다", async () => {
    const { screenButton } = await import("../src/dom");
    let clicks = 0;
    const button = screenButton("start", "다시 하기", () => clicks++) as unknown as FakeButton;
    expect([button.className, button.textContent, button.type]).toEqual(["start", "다시 하기", "button"]);
    button.listeners.get("click")?.({});
    expect(clicks).toBe(1);
    expect(button.listeners.has("pointerdown")).toBe(false);
  });

  test("게임 화면 위 버튼은 pointerdown 이 노트 누름으로 번지지 않게 막는다", async () => {
    const { screenButton } = await import("../src/dom");
    const button = screenButton("start secondary", "일시정지", () => {}, { overGame: true }) as unknown as FakeButton;
    let stopped = 0;
    button.listeners.get("pointerdown")?.({ stopPropagation: () => stopped++ });
    expect(stopped).toBe(1);
  });
});
