import { COLOR, type Painter, type Point } from "./canvas";

/** Half the thickness of a crayon and how much of it is the bare point, as shares of its length. */
const HALF_WIDTH = 0.17;
const POINT = 0.32;
/** The dark edge round the crayon and the haze beyond it, as shares of its length. */
const EDGE = 0.1;
const HAZE = 0.35;
/** The paper wrapper covers this stretch of the crayon, measured from the point, as shares of its length. */
const WRAPPER_FROM = 0.46;
const WRAPPER_TO = 0.86;
const WRAPPER_SHADE = 0.35;
/** The paper's grain repeats every this many pixels and has this many specks in each repeat. */
const GRAIN_CELL = 64;
const GRAIN_SPECKS = 900;
const GRAIN_SEED = 7;
const GRAIN_ALPHA_FROM = 0.3;

/** A crayon of `color`, `length` long, lying along `heading` with its point at `tip`. */
export function drawCrayon(painter: Painter, tip: Point, heading: number, length: number, color: string): void {
  const { ctx } = painter;
  const halfWidth = length * HALF_WIDTH;
  ctx.save();
  // From here x runs from the point back along the crayon.
  ctx.translate(tip.x, tip.y);
  ctx.rotate(heading + Math.PI);

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(length * POINT, -halfWidth);
  ctx.lineTo(length, -halfWidth);
  ctx.lineTo(length, halfWidth);
  ctx.lineTo(length * POINT, halfWidth);
  ctx.closePath();
  // A dark edge and a dark haze around it keep the crayon apart from the line of its own colour that it lies
  // on, and from the sparkles of a hit around it.
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, length * EDGE);
  ctx.strokeStyle = COLOR.background;
  ctx.shadowColor = COLOR.background;
  ctx.shadowBlur = length * HAZE;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  ctx.fill();

  ctx.globalAlpha *= WRAPPER_SHADE;
  ctx.fillStyle = COLOR.background;
  ctx.fillRect(length * WRAPPER_FROM, -halfWidth, length * (WRAPPER_TO - WRAPPER_FROM), halfWidth * 2);
  ctx.restore();
}

const grains = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();

/** Specks of the background colour, scattered the same way every time so the texture never flickers. */
function grainFor(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const cached = grains.get(ctx);
  if (cached !== undefined) return cached;
  const tile = document.createElement("canvas");
  tile.width = GRAIN_CELL;
  tile.height = GRAIN_CELL;
  const tileCtx = tile.getContext("2d");
  if (tileCtx === null) return null;
  let seed = GRAIN_SEED;
  const random = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  tileCtx.fillStyle = COLOR.background;
  for (let i = 0; i < GRAIN_SPECKS; i++) {
    tileCtx.globalAlpha = GRAIN_ALPHA_FROM + (1 - GRAIN_ALPHA_FROM) * random();
    const speck = random() < 0.75 ? 1 : 2;
    tileCtx.fillRect(Math.floor(random() * GRAIN_CELL), Math.floor(random() * GRAIN_CELL), speck, speck);
  }
  const pattern = ctx.createPattern(tile, "repeat");
  if (pattern !== null) grains.set(ctx, pattern);
  return pattern;
}

/**
 * The tooth of the paper showing through the wax: specks of the background colour over everything drawn so far,
 * so crayon lines look grainy and rough at the edges while the bare background stays as it is. The specks are
 * fixed to the paper at `origin`, turned by `angle`, so they move with the picture instead of across it.
 */
export function drawGrain(painter: Painter, origin: Point, angle: number): void {
  const { ctx } = painter;
  const pattern = grainFor(ctx);
  if (pattern === null) return;
  pattern.setTransform(new DOMMatrix().translate(origin.x, origin.y).rotate((angle * 180) / Math.PI));
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}
