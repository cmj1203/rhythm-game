import { assertNever } from "./assert";
import { COLOR, Painter } from "./canvas";
import { drawResult, type ResultFrame } from "./result-screen";
import { drawPlaying, type PlayingFrame } from "./stage";

/** "idle" clears the canvas while the song list covers it. */
export type Frame = { readonly kind: "idle" } | PlayingFrame | ResultFrame;

export class CanvasUnsupportedError extends Error {
  constructor() {
    super("2D canvas is not available in this browser");
    this.name = "CanvasUnsupportedError";
  }
}

export class Renderer {
  private readonly painter: Painter;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new CanvasUnsupportedError();
    this.painter = new Painter(ctx);
  }

  draw(frame: Frame): void {
    this.matchWindowSize();
    const size = { width: window.innerWidth, height: window.innerHeight };
    this.painter.ctx.fillStyle = COLOR.background;
    this.painter.ctx.fillRect(0, 0, size.width, size.height);

    switch (frame.kind) {
      case "idle":
        return;
      case "playing":
        drawPlaying(this.painter, frame, size);
        return;
      case "result":
        drawResult(this.painter, frame, size);
        return;
      default:
        assertNever(frame);
    }
  }

  private matchWindowSize(): void {
    const ratio = window.devicePixelRatio;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.painter.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
}
