import { COLOR, JUDGEMENT_COLOR, type Painter, type Point, type Size } from "./canvas";
import { GUIDE_STEP, type Guide } from "./guide";
import type { Judgement } from "./judge";
import type { Path } from "./path";

/**
 * Places road units on the screen: `camera` (in road units) is drawn at `anchor` (in pixels), and the road is
 * turned around that point by `angle` radians.
 */
export type View = {
  readonly tileSize: number;
  readonly camera: Point;
  readonly anchor: Point;
  readonly angle: number;
};
export type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

const FIT_PADDING = 1.5;
const WEAVE_CELL = 6;
const STITCH_WIDTH = 0.15;
const MIN_STITCH_PX = 1.5;
/** The finished picture is sewn at least this thick, as a share of its size, so a long song's picture is not faint. */
const FINISHED_WIDTH_SHARE = 0.008;
const GUIDE_WIDTH = 0.1;
/** While the song plays, the stitches sewn a while ago step back; this many of the latest stay in full view. */
const FRESH_STITCHES = 6;
const WIDE_LAYOUT_RATIO = 1.15;
/** How visible the thread is where it only passes behind the cloth, while the piece is still being sewn. */
const BEHIND_ALPHA = 0.3;

/** How far each stitch stops short of the holes, and how crooked it lies. A clean hit sews a clean stitch. */
const STITCH_SHAPE = {
  perfect: { inset: 0.12, tilt: 0, shift: 0 },
  great: { inset: 0.16, tilt: 0, shift: 0.05 },
  good: { inset: 0.22, tilt: 0.12, shift: 0 },
} as const satisfies Record<Exclude<Judgement, "miss">, { inset: number; tilt: number; shift: number }>;

export function toScreen(view: View, spot: Point): Point {
  const dx = (spot.x - view.camera.x) * view.tileSize;
  const dy = (spot.y - view.camera.y) * view.tileSize;
  const cos = Math.cos(view.angle);
  const sin = Math.sin(view.angle);
  return { x: view.anchor.x + dx * cos - dy * sin, y: view.anchor.y + dx * sin + dy * cos };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function blendViews(from: View, to: View, t: number): View {
  return {
    tileSize: lerp(from.tileSize, to.tileSize, t),
    camera: { x: lerp(from.camera.x, to.camera.x, t), y: lerp(from.camera.y, to.camera.y, t) },
    anchor: { x: lerp(from.anchor.x, to.anchor.x, t), y: lerp(from.anchor.y, to.anchor.y, t) },
    angle: lerp(from.angle, to.angle, t),
  };
}

export function isWideLayout({ width, height }: Size): boolean {
  return width >= height * WIDE_LAYOUT_RATIO;
}

/** Where the finished embroidery sits on the result screen: the left side when wide, the top when narrow. */
export function clothRect(size: Size): Rect {
  const { width, height } = size;
  return isWideLayout(size)
    ? { x: width * 0.04, y: height * 0.1, width: width * 0.54, height: height * 0.8 }
    : { x: width * 0.06, y: height * 0.05, width: width * 0.88, height: height * 0.4 };
}

/** The view that shows the whole finished picture inside `rect`. */
export function fitView({ guide }: Path, rect: Rect): View {
  const { minX, minY, maxX, maxY } = guide.bounds;
  const spanX = maxX - minX + FIT_PADDING * 2;
  const spanY = maxY - minY + FIT_PADDING * 2;
  return {
    tileSize: Math.min(rect.width / spanX, rect.height / spanY),
    camera: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    anchor: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
    angle: 0,
  };
}

/** The thread in use while the player stands on tile `tile`. */
export function threadAt({ anchors, guide }: Path, tile: number): string {
  return guide.colors[anchors[tile] ?? 0] ?? COLOR.dim;
}

const weaves = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();

function weaveFor(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const cached = weaves.get(ctx);
  if (cached !== undefined) return cached;
  const tile = document.createElement("canvas");
  tile.width = WEAVE_CELL;
  tile.height = WEAVE_CELL;
  const tileCtx = tile.getContext("2d");
  if (tileCtx === null) return null;
  tileCtx.fillStyle = "rgba(255, 255, 255, 0.022)";
  tileCtx.fillRect(0, 0, WEAVE_CELL, 1);
  tileCtx.fillStyle = "rgba(255, 255, 255, 0.014)";
  tileCtx.fillRect(WEAVE_CELL / 2, 0, 1, WEAVE_CELL);
  const pattern = ctx.createPattern(tile, "repeat");
  if (pattern !== null) weaves.set(ctx, pattern);
  return pattern;
}

/** A faint woven texture that slides with the road, so the screen reads as cloth without drawing attention. */
export function drawCloth(painter: Painter, view: View, { width, height }: Size): void {
  const { ctx } = painter;
  const pattern = weaveFor(ctx);
  if (pattern === null) return;
  const origin = toScreen(view, { x: 0, y: 0 });
  pattern.setTransform(new DOMMatrix().translate(origin.x, origin.y).rotate((view.angle * 180) / Math.PI));
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, width, height);
}

/**
 * The road still to sew from tile `from` to tile `to`, as a dashed line. `clarity` says how clearly the piece
 * that many tiles on from `from` shows, 0 to 1. Whatever transparency the caller has set applies to all of it.
 */
export function drawGuide(
  painter: Painter,
  { tiles }: Path,
  view: View,
  from: number,
  to: number,
  clarity: (steps: number) => number,
): void {
  const { ctx } = painter;
  const opacity = ctx.globalAlpha;
  ctx.save();
  // Tiles are one unit apart and the dashes repeat three times a unit, so they run on evenly from piece to piece.
  ctx.setLineDash([view.tileSize / 6, view.tileSize / 6]);
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1.5, view.tileSize * GUIDE_WIDTH);
  ctx.strokeStyle = COLOR.text;
  for (let i = from; i < to; i++) {
    const tile = tiles[i];
    const next = tiles[i + 1];
    if (tile === undefined || next === undefined) continue;
    const start = toScreen(view, tile);
    const end = toScreen(view, next);
    ctx.globalAlpha = opacity * clarity(i - from);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }
  ctx.restore();
}

/** A missed note leaves no stitch, only a tangled knot of loose thread. */
function drawKnot(painter: Painter, at: Point, size: number, seed: number): void {
  const { ctx } = painter;
  ctx.strokeStyle = JUDGEMENT_COLOR.miss;
  ctx.lineWidth = Math.max(1, size * 0.05);
  for (let k = 0; k < 3; k++) {
    const angle = seed * 1.7 + k * 2.1;
    painter.circle({ x: at.x + Math.cos(angle) * size * 0.07, y: at.y + Math.sin(angle) * size * 0.07 }, size * 0.09);
    ctx.stroke();
  }
}

function guidePoint({ points }: Guide, index: number): Point {
  const low = points[Math.floor(index)];
  const high = points[Math.ceil(index)];
  if (low === undefined) return { x: 0, y: 0 };
  if (high === undefined) return low;
  const t = index - Math.floor(index);
  return { x: lerp(low.x, high.x, t), y: lerp(low.y, high.y, t) };
}

function strokeLine(ctx: CanvasRenderingContext2D, line: readonly Point[]): void {
  ctx.beginPath();
  for (const [i, point] of line.entries()) {
    if (i === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();
}

/**
 * One stitch per judged note. `taut` 0 draws every stitch where it was sewn, straight between its two tiles.
 * `taut` 1 pulls the thread tight onto the picture's own lines: the detours made for rhythm straighten out,
 * and the thread that only passed behind the cloth between two strokes no longer shows.
 * `past` is how clearly the stitches sewn a while ago show, 0 to 1; the latest few always show in full.
 * Whatever transparency the caller has set applies to all of it.
 */
export function drawStitches(
  painter: Painter,
  { tiles, anchors, weights, guide }: Path,
  history: readonly Judgement[],
  view: View,
  taut: number,
  past: number,
): void {
  const { ctx } = painter;
  const size = view.tileSize;
  const opacity = ctx.globalAlpha;
  const behind = BEHIND_ALPHA * (1 - taut);
  const { minX, minY, maxX, maxY } = guide.bounds;
  const finishedWidth = Math.max(maxX - minX, maxY - minY) * FINISHED_WIDTH_SHARE * size * taut;
  const width = Math.max(MIN_STITCH_PX, size * STITCH_WIDTH, finishedWidth);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  history.forEach((judgement, note) => {
    const fromTile = tiles[note];
    const toTile = tiles[note + 1];
    const start = anchors[note];
    const end = anchors[note + 1];
    if (fromTile === undefined || toTile === undefined || start === undefined || end === undefined) return;

    const spot = (along: number): Point => {
      const tight = guidePoint(guide, lerp(start, end, along));
      return toScreen(view, {
        x: lerp(lerp(fromTile.x, toTile.x, along), tight.x, taut),
        y: lerp(lerp(fromTile.y, toTile.y, along), tight.y, taut),
      });
    };
    const threadOf = (along: number): string | null =>
      guide.colors[Math.min(end, Math.floor(lerp(start, end, along)))] ?? null;
    const freshness = Math.max(0, 1 - (history.length - 1 - note) / FRESH_STITCHES);
    const shown = opacity * lerp(past, 1, freshness);
    const alphaOf = (thread: string | null): number => shown * (thread === null ? behind : 1);

    if (judgement === "miss") {
      const alpha = alphaOf(threadOf(0.5));
      if (alpha <= 0) return;
      ctx.globalAlpha = alpha;
      drawKnot(painter, spot(0.5), size, note);
      return;
    }

    const { inset, tilt, shift } = STITCH_SHAPE[judgement];
    const head = spot(0);
    const tail = spot(1);
    const chord = Math.hypot(tail.x - head.x, tail.y - head.y) || 1;
    const across = { x: -(tail.y - head.y) / chord, y: (tail.x - head.x) / chord };
    const side = note % 2 === 0 ? 1 : -1;
    const pieces = Math.max(1, end - start);
    // Pulled tight, a stitch that covers a long piece of the picture leaves no wider a gap than a short one.
    const gap = inset * lerp(1, Math.min(1, 1 / (pieces * GUIDE_STEP)), taut);
    const corner = (piece: number): Point => {
      const along = Math.min(1 - gap, Math.max(gap, piece / pieces));
      const at = spot(along);
      const offset = (shift + tilt * (1 - 2 * along)) * side * size;
      return { x: at.x + across.x * offset, y: at.y + across.y * offset };
    };

    // Pieces of the same thread are drawn as one line; the thread may change where one stroke ends.
    ctx.lineWidth = width * (weights[note] ?? 1);
    let line: Point[] = [];
    let lineThread: string | null = null;
    const finishLine = (): void => {
      const alpha = alphaOf(lineThread);
      if (line.length < 2 || alpha <= 0) return;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = lineThread ?? COLOR.dim;
      strokeLine(ctx, line);
    };
    for (let piece = 0; piece < pieces; piece++) {
      const thread = threadOf((piece + 0.5) / pieces);
      if (piece === 0 || thread !== lineThread) {
        finishLine();
        line = [corner(piece)];
        lineThread = thread;
      }
      line.push(corner(piece + 1));
    }
    finishLine();
  });
  ctx.restore();
}
