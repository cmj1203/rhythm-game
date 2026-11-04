import { COLOR, type Painter, patternCache, type Point, type Size } from "./canvas";

/**
 * Half the thickness of a crayon and how much of it is the point, as shares of its length. The point is cut a little
 * blunt: its flat end is `TIP_SHARE` of the crayon's thickness.
 */
const HALF_WIDTH = 0.17;
const POINT = 0.32;
const TIP_SHARE = 1 / 3;
/** The dark edge round the crayon and the haze beyond it, as shares of its length. */
const EDGE = 0.1;
const HAZE = 0.35;
/** The paper's grain repeats every this many pixels and has this many specks in each repeat. */
const GRAIN_CELL = 64;
const GRAIN_SPECKS = 900;
const GRAIN_SEED = 7;
const GRAIN_ALPHA_FROM = 0.3;

/** A crayon of `color`, `length` long, lying along `heading` with its slightly blunt point at `tip`. */
export function drawCrayon(painter: Painter, tip: Point, heading: number, length: number, color: string): void {
  const { ctx } = painter;
  const halfWidth = length * HALF_WIDTH;
  ctx.save();
  // From here x runs from the point back along the crayon.
  ctx.translate(tip.x, tip.y);
  ctx.rotate(heading + Math.PI);

  const tipHalf = halfWidth * TIP_SHARE;
  // A dark edge and a dark haze around it keep the crayon apart from the line of its own colour that it lies
  // on, and from the sparkles of a hit around it.
  sealCrayon(
    ctx,
    [[0, -tipHalf], [length * POINT, -halfWidth], [length, -halfWidth], [length, halfWidth], [length * POINT, halfWidth], [0, tipHalf]],
    { edge: Math.max(3, length * EDGE), haze: length * HAZE, color },
  );
  ctx.restore();
}

/**
 * 크레용 윤곽(`outline` 꼭짓점)을 어두운 테두리(`edge` 굵기)와 그 밖의 어두운 안개(`haze`)로 두른 뒤 `color` 로 채운다.
 * 타이틀·그림 길의 크레용과 리듬 길의 걷는 크레용이 함께 쓴다. 윤곽은 현재 경로로 남아 이어서 clip 할 수 있다.
 */
export function sealCrayon(
  ctx: CanvasRenderingContext2D,
  outline: readonly (readonly [number, number])[],
  { edge, haze, color }: { readonly edge: number; readonly haze: number; readonly color: string },
): void {
  ctx.beginPath();
  outline.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.lineJoin = "round";
  ctx.lineWidth = edge;
  ctx.strokeStyle = COLOR.background;
  ctx.shadowColor = COLOR.background;
  ctx.shadowBlur = haze;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  ctx.fill();
}

/** Specks of the background colour, scattered the same way every time so the texture never flickers. */
const grainFor = patternCache(GRAIN_CELL, (tileCtx) => {
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
});

/**
 * The tooth of the paper showing through the wax: specks of the background colour over everything drawn so far,
 * so crayon lines look grainy and rough at the edges while the bare background stays as it is. The specks are
 * fixed to the paper at `origin`, turned by `angle`, so they move with the picture instead of across it.
 * 채우는 넓이는 화면 크기(`size`, CSS 픽셀)다. ctx 에는 이미 devicePixelRatio 배율이 걸려 있어 캔버스의 장치 픽셀
 * 크기로 채우면 DPR 2 에서 4배 넓이를 칠한다.
 */
export function drawGrain(painter: Painter, origin: Point, angle: number, { width, height }: Size): void {
  const { ctx } = painter;
  const pattern = grainFor(ctx);
  if (pattern === null) return;
  pattern.setTransform(new DOMMatrix().translate(origin.x, origin.y).rotate((angle * 180) / Math.PI));
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, width, height);
}
