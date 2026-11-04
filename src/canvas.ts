import type { Judgement } from "./judge";

/** Every value here mirrors a token in DESIGN.md section 2. */
export const COLOR = {
  background: "#0b0d12",
  surface: "#141826",
  separator: "#232838",
  text: "#f2f4f8",
  dim: "#8a93a6",
  sky: "#5ee1ff",
  pink: "#ff7ab8",
  violet: "#b79bff",
  thread: "#efe2c6",
} as const;

export const JUDGEMENT_COLOR = {
  perfect: "#ffe066",
  great: "#7dff9b",
  good: "#5ee1ff",
  miss: "#ff5c6c",
} as const satisfies Record<Judgement, string>;

/** The colour `share` of the way from `from` to `to`, both written "#rrggbb". */
export function mixColors(from: string, to: string, share: number): string {
  const channel = (hex: string, at: number): number => Number.parseInt(hex.slice(at, at + 2), 16);
  const mixed = [1, 3, 5].map((at) => Math.round(channel(from, at) + (channel(to, at) - channel(from, at)) * share));
  return `rgb(${mixed.join(" ")})`;
}

const FONT_FAMILY = 'system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif';

export type Point = { readonly x: number; readonly y: number };
export type Size = { readonly width: number; readonly height: number };
export type TextStyle = {
  readonly size: number;
  readonly color?: string;
  readonly weight?: number;
  readonly align?: CanvasTextAlign;
  /** 글자 둘레에 두를 색. 무늬 위에서도 글자가 읽히게 한다. */
  readonly outline?: string;
};

export class Painter {
  constructor(readonly ctx: CanvasRenderingContext2D) {}

  text(content: string, at: Point, style: TextStyle): void {
    const { ctx } = this;
    ctx.font = `${style.weight ?? 500} ${style.size}px ${FONT_FAMILY}`;
    ctx.fillStyle = style.color ?? COLOR.text;
    ctx.textAlign = style.align ?? "center";
    ctx.textBaseline = "middle";
    if (style.outline !== undefined) {
      ctx.save();
      ctx.strokeStyle = style.outline;
      ctx.lineWidth = Math.max(2, style.size * 0.2);
      ctx.lineJoin = "round";
      ctx.strokeText(content, at.x, at.y);
      ctx.restore();
    }
    ctx.fillText(content, at.x, at.y);
  }

  /** Starts a circular path; the caller fills or strokes it. */
  circle(center: Point, radius: number): void {
    this.ctx.beginPath();
    this.ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  }

  /** Starts a four-pointed star path, the sparkle shape of a hit effect. */
  sparkle(center: Point, size: number): void {
    const { ctx } = this;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const radius = i % 2 === 0 ? size : size * 0.28;
      const angle = (Math.PI / 4) * i - Math.PI / 2;
      ctx.lineTo(center.x + radius * Math.cos(angle), center.y + radius * Math.sin(angle));
    }
    ctx.closePath();
  }
}

/**
 * 컨텍스트마다 한 번만 만드는 반복 무늬. `cell` 픽셀 정사각형 타일에 `paint` 로 한 번 그린 뒤 그 컨텍스트에서 계속 쓴다.
 * 타일 캔버스를 만들 수 없으면 null.
 */
export function patternCache(
  cell: number,
  paint: (tile: CanvasRenderingContext2D) => void,
): (ctx: CanvasRenderingContext2D) => CanvasPattern | null {
  const made = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();
  return (ctx) => {
    const cached = made.get(ctx);
    if (cached !== undefined) return cached;
    const tile = document.createElement("canvas");
    tile.width = cell;
    tile.height = cell;
    const tileCtx = tile.getContext("2d");
    if (tileCtx === null) return null;
    paint(tileCtx);
    const pattern = ctx.createPattern(tile, "repeat");
    if (pattern !== null) made.set(ctx, pattern);
    return pattern;
  };
}
