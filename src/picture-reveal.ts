import type { Point } from "./canvas";
import type { Path } from "./path";
import type { RoadPicture } from "./rhythm-road";

/** On the result screen: a pause, then the road's pieces move into the picture, then its lines come in over them. */
export const REVEAL_DELAY_MS = 500;
export const REVEAL_MOVE_MS = 1800;
export const REVEAL_LINES_MS = 1000;

export type RevealStage = { readonly move: number; readonly lines: number };

/** How much of the way a traced road is pulled onto the picture's own line once it has settled. */
export const SETTLE_SHARE = 0.65;
/** How far back and ahead along the picture's line (in tiles) a settling point looks for its spot. */
const SETTLE_BACK_TILES = 0.5;
const SETTLE_AHEAD_TILES = 3;

/** How far the pieces have moved (0 to 1, eased) and how clearly the picture's lines show, `elapsedMs` in. */
export function revealStage(elapsedMs: number): RevealStage {
  const move = Math.min(1, Math.max(0, (elapsedMs - REVEAL_DELAY_MS) / REVEAL_MOVE_MS));
  const lines = Math.min(1, Math.max(0, (elapsedMs - REVEAL_DELAY_MS - REVEAL_MOVE_MS) / REVEAL_LINES_MS));
  return { move: move * move * (3 - 2 * move), lines };
}

type Placement = (spot: Point) => Point;

function shortAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/**
 * Where each tile stands `move` of the way from the road as played to its place in the picture. Each piece moves as
 * one rigid shape: its middle slides, it turns, and it grows or shrinks, so it never bends on the way.
 */
function placements(path: Path, picture: RoadPicture, move: number): Placement[] {
  return picture.pieces.map((piece, k) => {
    const to = picture.pieces[k + 1]?.from ?? path.tiles.length;
    const own = path.tiles.slice(piece.from, to);
    const middle = {
      x: own.reduce((sum, { x }) => sum + x, 0) / Math.max(1, own.length),
      y: own.reduce((sum, { y }) => sum + y, 0) / Math.max(1, own.length),
    };
    const angle = shortAngle(piece.angle);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const target = {
      x: piece.x + piece.scale * (middle.x * cos - middle.y * sin),
      y: piece.y + piece.scale * (middle.x * sin + middle.y * cos),
    };
    const scale = piece.scale ** move;
    const turnCos = Math.cos(angle * move);
    const turnSin = Math.sin(angle * move);
    const centre = { x: middle.x + (target.x - middle.x) * move, y: middle.y + (target.y - middle.y) * move };
    return ({ x, y }: Point): Point => {
      const dx = x - middle.x;
      const dy = y - middle.y;
      return { x: centre.x + scale * (dx * turnCos - dy * turnSin), y: centre.y + scale * (dx * turnSin + dy * turnCos) };
    };
  });
}

const settledSpots = new WeakMap<Path, readonly Point[]>();

/**
 * Where each guide point of a traced road, in its picture, lands on the picture's own line: walking the line forward
 * the way the road was laid along it, so a point never snaps onto another part of the line that happens to pass near.
 */
function settledTargets(path: Path, picture: RoadPicture): readonly Point[] {
  const known = settledSpots.get(path);
  if (known !== undefined) return known;
  const placed = revealedPath(path, picture, 1).guide.points;
  const segments: { a: Point; b: Point; from: number; to: number }[] = [];
  let length = 0;
  for (const { points } of picture.strokes) {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      const step = Math.hypot(b.x - a.x, b.y - a.y);
      segments.push({ a, b, from: length, to: length + step });
      length += step;
    }
  }
  const tile = picture.pieces[0]?.scale ?? 1;
  let walked = 0;
  let first = 0;
  const targets = placed.map((point) => {
    while (first < segments.length - 1 && segments[first]!.to < walked - SETTLE_BACK_TILES * tile) first++;
    let best = { spot: point, along: walked, d2: Number.POSITIVE_INFINITY };
    for (let i = first; i < segments.length && segments[i]!.from <= walked + SETTLE_AHEAD_TILES * tile; i++) {
      const { a, b, from, to } = segments[i]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      const spot = { x: a.x + dx * t, y: a.y + dy * t };
      const d2 = (point.x - spot.x) ** 2 + (point.y - spot.y) ** 2;
      if (d2 < best.d2) best = { spot, along: from + (to - from) * t, d2 };
    }
    walked = Math.max(walked, best.along);
    return best.spot;
  });
  settledSpots.set(path, targets);
  return targets;
}

/**
 * The road `move` of the way into its picture. The strokes that join one piece to the next are left uncoloured, so
 * the result screen does not draw them: the picture is made of the pieces only. The bounds grow with the move to take
 * in the picture's own lines too, so the finished screen shows all of them.
 */
export function revealedPath(path: Path, picture: RoadPicture, move: number, settle = 0): Path {
  const place = placements(path, picture, move);
  const pieceOf = (tile: number): number => {
    let k = 0;
    while ((picture.pieces[k + 1]?.from ?? Infinity) <= tile) k++;
    return k;
  };
  const tiles = path.tiles.map((tile, i) => ({ ...tile, ...place[pieceOf(i)]!(tile) }));
  const { anchors, guide } = path;
  const tileOfPoint = (index: number): number => {
    let tile = 0;
    while ((anchors[tile + 1] ?? Infinity) <= index) tile++;
    return tile;
  };
  const joins = new Set(picture.pieces.slice(1).map(({ from }) => from - 1));
  const points: Point[] = [];
  const colors: (string | null)[] = [];
  let tile = 0;
  for (const [index, point] of guide.points.entries()) {
    while ((anchors[tile + 1] ?? Infinity) <= index) tile++;
    points.push(place[pieceOf(tile)]!(point));
    colors.push(joins.has(tile) ? null : (guide.colors[index] ?? null));
  }
  if (picture.traced === true && settle > 0) {
    // Once in place, a traced road is pulled part of the way onto the line it was laid along, smoothing its corners.
    const targets = settledTargets(path, picture);
    const pull = SETTLE_SHARE * settle;
    points.forEach((point, index) => {
      const target = targets[index] ?? point;
      points[index] = { x: point.x + (target.x - point.x) * pull, y: point.y + (target.y - point.y) * pull };
    });
  }
  const shown = points.filter((_, index) => !joins.has(tileOfPoint(index)));
  const lines = picture.strokes.flatMap(({ points: stroke }) => stroke);
  const road = {
    minX: Math.min(...shown.map(({ x }) => x)),
    minY: Math.min(...shown.map(({ y }) => y)),
    maxX: Math.max(...shown.map(({ x }) => x)),
    maxY: Math.max(...shown.map(({ y }) => y)),
  };
  const toward = (from: number, to: number): number => from + (to - from) * move;
  return {
    ...path,
    tiles,
    guide: {
      ...guide,
      points,
      colors,
      bounds: {
        minX: toward(road.minX, Math.min(road.minX, ...lines.map(({ x }) => x))),
        minY: toward(road.minY, Math.min(road.minY, ...lines.map(({ y }) => y))),
        maxX: toward(road.maxX, Math.max(road.maxX, ...lines.map(({ x }) => x))),
        maxY: toward(road.maxY, Math.max(road.maxY, ...lines.map(({ y }) => y))),
      },
    },
  };
}
