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
  needle: "#cfd6e0",
} as const;

export const JUDGEMENT_COLOR = {
  perfect: "#ffe066",
  great: "#7dff9b",
  good: "#5ee1ff",
  miss: "#ff5c6c",
} as const satisfies Record<Judgement, string>;

const FONT_FAMILY = 'system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif';

export type Point = { readonly x: number; readonly y: number };
export type Size = { readonly width: number; readonly height: number };
export type TextStyle = {
  readonly size: number;
  readonly color?: string;
  readonly weight?: number;
  readonly align?: CanvasTextAlign;
};

export class Painter {
  constructor(readonly ctx: CanvasRenderingContext2D) {}

  text(content: string, at: Point, style: TextStyle): void {
    const { ctx } = this;
    ctx.font = `${style.weight ?? 500} ${style.size}px ${FONT_FAMILY}`;
    ctx.fillStyle = style.color ?? COLOR.text;
    ctx.textAlign = style.align ?? "center";
    ctx.textBaseline = "middle";
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
