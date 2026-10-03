import { COLOR, JUDGEMENT_COLOR, type Painter, type Point, type Size } from "./canvas";
import { drawCrayon, drawGrain } from "./crayon";
import { loadDrawing } from "./drawing";
import type { Rect } from "./embroidery";

/** The title is public/pictures/logo.svg: one shape per syllable, each a few strokes of the crayon. */
const LOGO_ID = "logo";
/** A syllable takes `WRITE_S` to write, and the next one begins `SYLLABLE_S` after it began. */
const SYLLABLE_S = 0.6;
const WRITE_S = 0.4;
/** How thick the title is written, in the units of its own drawing, and the thinnest it gets on a small screen. */
const TITLE_WIDTH = 3;
const MIN_LINE_PX = 2.5;
/** The crayon points down and to the left as it writes, so its body leans away to the upper right. */
const PEN_HEADING = (Math.PI * 3) / 4;

type Line = readonly Point[];
type Bounds = { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number };
/** One syllable of the title: its strokes in the order they are written, and how long they are together. */
type Syllable = { readonly lines: readonly Line[]; readonly length: number };
type Title = { readonly syllables: readonly Syllable[]; readonly bounds: Bounds };

export type IntroFrame = {
  readonly kind: "intro";
  readonly title: Title;
  /** How much of each syllable is written, 0 to 1. */
  readonly written: readonly number[];
  readonly isLive: boolean;
};

export type IntroOptions = {
  /** The player asked for less motion: the title is shown already written. */
  readonly isCalm: boolean;
  /** The title is written, so the start button may show. */
  readonly onReady: () => void;
};

/** Mutable by design: the opening of the game, in which a crayon writes the title syllable by syllable. */
export class Intro {
  private isWritten: boolean;
  /** When the writing began, which is the first frame drawn. */
  private sinceMs: number | null = null;

  constructor(
    private readonly options: IntroOptions,
    private readonly title: Title,
  ) {
    this.isWritten = options.isCalm;
  }

  /** True once the title is written and nothing is left but to start. */
  get isOver(): boolean {
    return this.isWritten;
  }

  /** Shows the title finished at once, for a player who does not want to watch it being written. */
  skip(): void {
    if (this.isWritten) return;
    this.isWritten = true;
    this.options.onReady();
  }

  /** Moves the intro on to `nowMs` and says what to draw. */
  advance(nowMs: number): IntroFrame {
    this.sinceMs ??= nowMs;
    const elapsed = (nowMs - this.sinceMs) / 1000;
    const { syllables } = this.title;
    if (elapsed >= (syllables.length - 1) * SYLLABLE_S + WRITE_S) this.skip();
    return {
      kind: "intro",
      title: this.title,
      written: syllables.map((_, i) =>
        this.isWritten ? 1 : Math.min(1, Math.max(0, (elapsed - i * SYLLABLE_S) / WRITE_S)),
      ),
      isLive: this.isWritten,
    };
  }
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function between(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function lengthOf(line: Line): number {
  return line.reduce((length, point, i) => length + distance(line[i - 1] ?? point, point), 0);
}

function boundsOf(points: Line): Bounds {
  return points.reduce(
    (bounds, { x, y }) => ({
      minX: Math.min(bounds.minX, x),
      minY: Math.min(bounds.minY, y),
      maxX: Math.max(bounds.maxX, x),
      maxY: Math.max(bounds.maxY, y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

export async function loadIntro(options: IntroOptions): Promise<Intro> {
  const logo = await loadDrawing(LOGO_ID);
  const strokes = new Map<number, Line[]>();
  for (const { part, points } of logo.strokes) strokes.set(part, [...(strokes.get(part) ?? []), points]);
  return new Intro(options, {
    syllables: [...strokes.values()].map((lines) => ({
      lines,
      length: lines.reduce((length, line) => length + lengthOf(line), 0),
    })),
    bounds: boundsOf(logo.strokes.flatMap(({ points }) => points)),
  });
}

/** Where the title sits: the upper part of the screen, leaving the lower part to the words and the start button. */
function titleRect({ width, height }: Size): Rect {
  return { x: width * 0.08, y: height * 0.14, width: width * 0.84, height: height * 0.26 };
}

/** Puts a drawing on the screen: a point of it is drawn at `scale` times itself plus (`x`, `y`). */
type Placement = { readonly scale: number; readonly x: number; readonly y: number };

/** The placement that shows everything inside `bounds` as large as fits in `rect`, in the middle of it. */
function placeIn({ minX, minY, maxX, maxY }: Bounds, rect: Rect): Placement {
  const scale = Math.min(rect.width / Math.max(1, maxX - minX), rect.height / Math.max(1, maxY - minY));
  return {
    scale,
    x: rect.x + rect.width / 2 - ((minX + maxX) / 2) * scale,
    y: rect.y + rect.height / 2 - ((minY + maxY) / 2) * scale,
  };
}

function put({ scale, x, y }: Placement, point: Point): Point {
  return { x: point.x * scale + x, y: point.y * scale + y };
}

/** The crayon that writes the title, held the way a right hand holds it, its point at the end of the line. */
function drawPen(painter: Painter, at: Point, { width, height }: Size): void {
  const length = Math.min(46, Math.max(30, Math.min(width, height) * 0.06));
  drawCrayon(painter, at, PEN_HEADING, length, COLOR.thread);
}

/** The first `share` of a syllable, stroke after stroke. Returns where the crayon is while the syllable is unfinished. */
function drawSyllable(painter: Painter, { lines, length }: Syllable, share: number, place: Placement): Point | null {
  if (share <= 0) return null;
  const { ctx } = painter;
  let left = length * share;
  let pen: Point | null = null;
  ctx.beginPath();
  for (const line of lines) {
    let previous: Point | null = null;
    for (const point of line) {
      if (previous === null) {
        const start = put(place, point);
        ctx.moveTo(start.x, start.y);
      } else {
        const span = distance(previous, point);
        pen = put(place, span > left ? between(previous, point, left / span) : point);
        ctx.lineTo(pen.x, pen.y);
        left -= span;
        if (left <= 0) break;
      }
      previous = point;
    }
    if (left <= 0) break;
  }
  ctx.strokeStyle = COLOR.thread;
  ctx.lineWidth = Math.max(MIN_LINE_PX, place.scale * TITLE_WIDTH);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  return share < 1 ? pen : null;
}

/** The lamp of a live show, in the corner: it comes on when the title is written. */
function drawLamp(painter: Painter, isLive: boolean): void {
  const { ctx } = painter;
  painter.circle({ x: 28, y: 28 }, 5);
  if (isLive) {
    ctx.fillStyle = JUDGEMENT_COLOR.miss;
    ctx.fill();
  } else {
    ctx.strokeStyle = COLOR.dim;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  painter.text("LIVE", { x: 41, y: 29 }, { size: 13, weight: 700, align: "left", color: isLive ? COLOR.text : COLOR.dim });
}

export function drawIntro(painter: Painter, frame: IntroFrame, size: Size): void {
  const place = placeIn(frame.title.bounds, titleRect(size));
  const pens = frame.title.syllables.map((syllable, i) => drawSyllable(painter, syllable, frame.written[i] ?? 0, place));
  drawGrain(painter, { x: 0, y: 0 }, 0);
  for (const pen of pens) if (pen !== null) drawPen(painter, pen, size);
  drawLamp(painter, frame.isLive);
}
