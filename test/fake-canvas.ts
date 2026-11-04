/**
 * 그리기 함수가 캔버스에 무엇을 시켰는지 적어 두는 가짜 2D 컨텍스트. 같은 그림을 그리는지는 적힌 순서가 같은지로 본다.
 * 브라우저가 없는 bun 에서 `document.createElement("canvas")` 와 `DOMMatrix` 도 흉내 낸다.
 */
export type Call = readonly [name: string, ...args: unknown[]];

const round = (value: unknown): unknown => (typeof value === "number" ? Math.round(value * 1e9) / 1e9 : value);

export function fakeContext(width = 300, height = 150): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const canvas = { width, height };
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(
    {},
    {
      get(_, key) {
        if (key === "canvas") return canvas;
        if (typeof key !== "string") return undefined;
        if (key in state) return state[key];
        return (...args: unknown[]) => {
          calls.push([key, ...args.map(round)]);
          if (key === "createPattern") return fakePattern(calls);
          return undefined;
        };
      },
      set(_, key, value) {
        if (typeof key !== "string") return false;
        state[key] = value;
        calls.push([`${key}=`, typeof value === "object" && value !== null && "tag" in value ? value.tag : round(value)]);
        return true;
      },
    },
  ) as CanvasRenderingContext2D;
  return { ctx, calls };
}

function fakePattern(calls: Call[]): CanvasPattern {
  return { tag: "pattern", setTransform: (matrix: { steps: unknown[] }) => calls.push(["pattern.setTransform", ...matrix.steps]) } as unknown as CanvasPattern;
}

/** 패턴 타일용 오프스크린 캔버스와 DOMMatrix 를 전역에 둔다. 만들어진 타일 컨텍스트의 기록을 돌려준다. */
export function installFakeDom(): { tiles: Call[][] } {
  const tiles: Call[][] = [];
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => {
      if (tag !== "canvas") throw new Error(`가짜 document 는 canvas 만 만든다: ${tag}`);
      const element = { width: 0, height: 0, getContext: () => {
        const { ctx, calls } = fakeContext();
        tiles.push(calls);
        return ctx;
      } };
      return element;
    },
  };
  class FakeMatrix {
    readonly steps: unknown[] = [];
    translate(x: number, y: number): this {
      this.steps.push(["translate", round(x), round(y)]);
      return this;
    }
    rotate(degrees: number): this {
      this.steps.push(["rotate", round(degrees)]);
      return this;
    }
  }
  (globalThis as { DOMMatrix?: unknown }).DOMMatrix = FakeMatrix;
  if ((globalThis as { window?: unknown }).window === undefined) {
    (globalThis as { window?: unknown }).window = { matchMedia: () => ({ matches: false, addEventListener: () => {} }) };
  }
  return { tiles };
}

/** 기록을 수 하나로 줄인 것. 긴 기록(무늬 타일 수천 번 칠하기)이 같은지 볼 때 쓴다. */
export function hashCalls(calls: readonly Call[]): number {
  let hash = 0;
  for (const call of calls) for (const ch of JSON.stringify(call)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash;
}
