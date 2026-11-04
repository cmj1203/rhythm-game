import { beforeAll, describe, expect, test } from "bun:test";
import { COLOR, JUDGEMENT_COLOR, mixColors } from "../src/canvas";
import { installFakeDom } from "./fake-canvas";

/**
 * 접근성 감사 2026-11-04 2절의 대비값을 코드에 든 색으로 다시 잰다. WCAG 2.x 상대 휘도와 대비비,
 * 반투명은 sRGB 에서 아래 색과 합성한 값(감사와 같은 방법). 기준: 글자 4.5:1, 그래픽·UI 경계 3:1.
 */
function channels(color: string): number[] {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex !== null) return [0, 2, 4].map((at) => Number.parseInt(hex[1]!.slice(at, at + 2), 16));
  const rgb = /^rgb\((\d+) (\d+) (\d+)\)$/.exec(color);
  if (rgb !== null) return [rgb[1], rgb[2], rgb[3]].map(Number);
  throw new Error(`읽을 수 없는 색: ${color}`);
}

function luminance(color: string): number {
  const [r, g, b] = channels(color).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** `color` 를 `alpha` 만큼 `under` 위에 깐 색. 두 색이 모두 #rrggbb 면 코드와 같은 mixColors 를 쓴다. */
const over = (under: string, color: string, alpha: number): string => {
  if (under.startsWith("#") && color.startsWith("#")) return mixColors(under, color, alpha);
  const [a, b] = [channels(under), channels(color)];
  return `rgb(${a.map((c, i) => Math.round(c + ((b[i] ?? c) - c) * alpha)).join(" ")})`;
};

let track: typeof import("../src/track");
let embroidery: typeof import("../src/embroidery");
let css: string;
beforeAll(async () => {
  installFakeDom();
  track = await import("../src/track");
  embroidery = await import("../src/embroidery");
  css = await Bun.file(new URL("../src/style.css", import.meta.url)).text();
});

const cssAlpha = (pattern: RegExp): number => {
  const found = pattern.exec(css);
  if (found === null) throw new Error(`style.css 에 없음: ${pattern}`);
  return Number(found[1]) / 100;
};

describe("감사 2절 미달 항목의 고친 뒤 대비", () => {
  test("style.css 의 색 토큰은 canvas.ts 의 COLOR 와 같다", () => {
    for (const [name, value] of Object.entries({ background: COLOR.background, surface: COLOR.surface, text: COLOR.text, dim: COLOR.dim })) {
      expect(css).toContain(`--${name}: ${value};`);
    }
  });

  test("선택된 곡 행: 왼쪽 막대와 보조 글자", () => {
    const selected = over(COLOR.surface, COLOR.text, cssAlpha(/--wash-selected: rgb\(242 244 248 \/ (\d+)%\)/));
    expect(css).toContain("box-shadow: inset 3px 0 0 var(--text);");
    expect(contrast(COLOR.text, COLOR.surface)).toBeGreaterThanOrEqual(3);
    const secondary = over(selected, COLOR.text, cssAlpha(/\.song-meta \{\n {2}color: rgb\(242 244 248 \/ (\d+)%\)/));
    expect(contrast(secondary, selected)).toBeGreaterThanOrEqual(4.5);
  });

  test("난이도 탭·보조 버튼·미입력 박자 점의 --dim 테두리", () => {
    expect(css.match(/box-shadow: inset 0 0 0 1px var\(--dim\);/g)?.length).toBeGreaterThanOrEqual(3);
    expect(contrast(COLOR.dim, COLOR.background)).toBeGreaterThanOrEqual(3);
  });

  test("캔버스: 진행 막대, 놓친 칸, 게임 오버 덮개, 천 뒤 실", () => {
    expect(contrast(track.PROGRESS_TRACK, COLOR.background)).toBeGreaterThanOrEqual(3);
    expect(contrast(COLOR.text, track.PROGRESS_TRACK)).toBeGreaterThanOrEqual(3);
    expect(contrast(over(COLOR.background, COLOR.dim, track.MISS_DIM), COLOR.background)).toBeGreaterThanOrEqual(3);
    const coveredRoad = over(COLOR.text, COLOR.background, track.GAME_OVER_SHADE);
    expect(contrast(JUDGEMENT_COLOR.miss, coveredRoad)).toBeGreaterThanOrEqual(3);
    expect(contrast(over(COLOR.background, COLOR.dim, embroidery.BEHIND_ALPHA), COLOR.background)).toBeGreaterThanOrEqual(3);
  });
});
