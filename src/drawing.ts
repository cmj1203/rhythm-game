import { COLOR, type Point } from "./canvas";

/** One line of a picture, in the picture's own units. `part` counts the shapes of the file: which one the line is from. */
export type Stroke = { readonly points: readonly Point[]; readonly color: string; readonly part: number };
/** `name` is what the result screen calls the picture. */
export type Drawing = { readonly name: string; readonly strokes: readonly Stroke[] };

/**
 * A drawing joined into one unbroken line. `colors[i]` is the thread of the piece from `points[i]` to
 * `points[i + 1]`; null where the line only travels from the end of one stroke to the start of the next.
 */
export type Route = {
  readonly points: readonly Point[];
  readonly colors: readonly (string | null)[];
  readonly length: number;
};

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const SHAPES = "path, line, polyline, polygon, circle, ellipse, rect";
const GEOMETRY_ATTRIBUTES = [
  "d",
  "points",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "width",
  "height",
] as const;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const SAMPLE_STEP = 0.5;
const PATH_COMMAND = /(?=[MLHVCQAZmlhvcqaz])/;
/** A smooth-curve command leans on the command before it and a relative move lifts the pen, so a path with either is measured whole. */
const UNSPLITTABLE = /[SsTtm]/;

export class DrawingLoadError extends Error {
  constructor(
    readonly url: string,
    readonly reason: string,
  ) {
    super(`${url} (${reason})`);
    this.name = "DrawingLoadError";
  }
}

/**
 * Points a fixed distance apart along one shape. Only the geometry is copied into the page, so nothing else in
 * the file can run or show.
 */
function measure(bench: SVGSVGElement, tag: string, geometry: readonly (readonly [string, string])[]): Point[] {
  const copy = document.createElementNS(SVG_NAMESPACE, tag);
  if (!(copy instanceof SVGGeometryElement)) return [];
  for (const [name, value] of geometry) copy.setAttribute(name, value);
  bench.append(copy);
  const length = copy.getTotalLength();
  const steps = Math.ceil(length / SAMPLE_STEP);
  if (steps === 0) return [];
  return Array.from({ length: steps + 1 }, (_, i) => {
    const { x, y } = copy.getPointAtLength((length * i) / steps);
    return { x, y };
  });
}

/**
 * The points of one pen-down run of a path. A browser takes longer to find a point the longer the path is, and a
 * one-line drawing is one very long path, so the run is measured command by command, each from where the last
 * one ended.
 */
function trace(bench: SVGSVGElement, outline: string): Point[] {
  const [move, ...commands] = outline.trim().split(PATH_COMMAND);
  if (move === undefined || UNSPLITTABLE.test(outline)) return measure(bench, "path", [["d", outline]]);
  const points: Point[] = [];
  let from = move;
  for (const command of commands) {
    const start = points[0];
    const drawn = start !== undefined && /^z/i.test(command) ? `L ${start.x} ${start.y}` : command;
    const piece = measure(bench, "path", [["d", `${from} ${drawn}`]]);
    points.push(...(points.length === 0 ? piece : piece.slice(1)));
    const pen = points[points.length - 1];
    if (pen !== undefined) from = `M ${pen.x} ${pen.y}`;
  }
  return points;
}

function strokesOf(shape: Element, part: number, bench: SVGSVGElement): Stroke[] {
  const stroke = shape.closest("[stroke]")?.getAttribute("stroke") ?? "";
  const color = HEX_COLOR.test(stroke) ? stroke : COLOR.thread;
  // A path that lifts the pen (a second "M") is several strokes, not one.
  const lines =
    shape.localName === "path"
      ? (shape.getAttribute("d") ?? "").split(/(?=M)/).map((outline) => trace(bench, outline))
      : [
          measure(
            bench,
            shape.localName,
            GEOMETRY_ATTRIBUTES.flatMap((name) => {
              const value = shape.getAttribute(name);
              return value === null ? [] : [[name, value] as const];
            }),
          ),
        ];
  return lines.filter((points) => points.length > 1).map((points) => ({ points, color, part }));
}

/**
 * Reads the line drawing public/pictures/<id>.svg. Every shape becomes a stroke, sewn in its nearest `stroke`
 * colour; the picture's name is the file's <title>. Shapes must not use `transform`.
 */
export async function loadDrawing(id: string): Promise<Drawing> {
  const url = `${import.meta.env.BASE_URL}pictures/${id}.svg`;
  const response = await fetch(url);
  if (!response.ok) throw new DrawingLoadError(url, `HTTP ${response.status}`);
  const source = new DOMParser().parseFromString(await response.text(), "image/svg+xml");
  if (source.querySelector("parsererror") !== null) throw new DrawingLoadError(url, "not an SVG file");

  // The browser only measures shapes that are part of the page, so they are laid out on an invisible bench.
  const bench = document.createElementNS(SVG_NAMESPACE, "svg");
  bench.setAttribute("style", "position:absolute;width:0;height:0;overflow:hidden");
  document.body.append(bench);
  try {
    const strokes = [...source.querySelectorAll(SHAPES)].flatMap((shape, part) => strokesOf(shape, part, bench));
    if (strokes.length === 0) throw new DrawingLoadError(url, "no lines in it");
    return { name: source.querySelector("title")?.textContent?.trim() || id, strokes };
  } finally {
    bench.remove();
  }
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * The drawing as one line. A one-line drawing is already that; a drawing of several strokes is sewn stroke
 * after stroke, always going on with the stroke whose nearer end is closest to the pen.
 */
export function routeOf({ strokes }: Drawing): Route {
  const waiting = [...strokes];
  const points: Point[] = [];
  const colors: (string | null)[] = [];
  let length = 0;

  while (waiting.length > 0) {
    const pen = points[points.length - 1];
    let nextIndex = 0;
    let isReversed = false;
    let shortest = Number.POSITIVE_INFINITY;
    if (pen !== undefined) {
      for (const [index, stroke] of waiting.entries()) {
        const head = stroke.points[0];
        const tail = stroke.points[stroke.points.length - 1];
        if (head === undefined || tail === undefined) continue;
        if (distance(pen, head) < shortest) {
          shortest = distance(pen, head);
          nextIndex = index;
          isReversed = false;
        }
        if (distance(pen, tail) < shortest) {
          shortest = distance(pen, tail);
          nextIndex = index;
          isReversed = true;
        }
      }
    }

    const [stroke] = waiting.splice(nextIndex, 1);
    if (stroke === undefined) break;
    const line = isReversed ? [...stroke.points].reverse() : stroke.points;
    for (const [i, point] of line.entries()) {
      const previous = points[points.length - 1];
      if (previous !== undefined) {
        colors.push(i === 0 ? null : stroke.color);
        length += distance(previous, point);
      }
      points.push(point);
    }
  }
  return { points, colors, length };
}

/** The same line sewn from its other end. */
export function backwards({ points, colors, length }: Route): Route {
  return { points: [...points].reverse(), colors: [...colors].reverse(), length };
}
