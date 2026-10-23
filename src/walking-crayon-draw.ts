import { COLOR, mixColors, type Painter } from "./canvas";
import { toScreen, type View } from "./embroidery";
import type { Pace, Path } from "./path";
import { poseOn, walkingCrayonAt, type WalkingCrayon } from "./walking-crayon";

/**
 * The crayon, in tiles from its point end (0) to its butt (1): this thick, its point tapering over the first
 * `POINT` of its length to a small flat face `TIP_HALF` either side, its butt the last stretch from `BUTT` on.
 */
const HALF = 0.12;
const TIP_HALF = 0.04;
const POINT = 0.32;
const BUTT = 0.82;
/** The dark edge round the crayon, in pixels, and the dark haze beyond it, in tiles. */
const EDGE_PX = 3;
const HAZE = 0.06;
/** A lit landed end is mixed this far toward white. */
const FLASH_WHITE = 0.4;
/**
 * The swinging end leaves a fading tail along the arc it just swept, this long, drawn in this many pieces, at most
 * this opaque and this wide (in tiles) right behind the crayon, thinning and fading to nothing at its far end.
 */
const TRAIL_S = 0.22;
const TRAIL_STEPS = 14;
const TRAIL_OPACITY = 0.8;
const TRAIL_WIDTH = 0.16;
/** Two poses further apart than this (in tiles) are on either side of a repeat sign's jump: no tail between them. */
const JUMP_TILES = 1.5;
/**
 * At a repeat sign the crayon is back on the tile before the stretch the moment it lands on the stretch's last one.
 * From this long before, a faint still copy of it lies there where it is about to be; for this long after, the
 * crayon it was fades out where it landed.
 */
const ECHO_LEAD_S = 0.7;
const ECHO_OPACITY = 0.35;
const CROSSFADE_S = 0.1;
const PACE_RING = { normal: COLOR.separator, fast: COLOR.pink, slow: COLOR.sky } as const satisfies Record<Pace, string>;
/** The crayon is one colour, but while a note it stepped on has changed its speed it takes that note's colour. */
const PACE_COLOR = { normal: COLOR.thread, fast: COLOR.pink, slow: COLOR.sky } as const satisfies Record<Pace, string>;
const TEMPO_COLOR = { faster: COLOR.pink, slower: COLOR.sky } as const;
const PACE_WIDTH = { normal: 1, fast: 2, slow: 2 } as const satisfies Record<Pace, number>;
const CALM = window.matchMedia("(prefers-reduced-motion: reduce)");

type ClockedRoad = { readonly path: Path; readonly songTime: number };

/** The crayon's colour while it stands on tile `standing`. */
function crayonColor(path: Path, standing: number): string {
  const pace = path.sweeps[standing]?.pace ?? "normal";
  if (pace !== "normal") return PACE_COLOR[pace];
  const mark = path.rhythm?.marks[standing];
  return mark === undefined || mark === null ? PACE_COLOR.normal : TEMPO_COLOR[mark];
}

/**
 * How a hit shows on the crayon right now: the end standing on tile `landing` is `swell` wider (as a share of its
 * width) and lit `flash` of the way (0 to 1).
 */
export type HitOnCrayon = { readonly landing: number; readonly swell: number; readonly flash: number };

/** The crayon's body in `color` at `pose`, `swell` wider at its standing end and lit `flash` of the way there. */
function drawBody(painter: Painter, view: View, pose: WalkingCrayon, color: string, swell: number, flash: number): void {
  const { ctx } = painter;
  const size = view.tileSize;
  const tip = toScreen(view, pose.tip);
  const pointStands = pose.standing % 2 === 1;
  ctx.save();
  // From here x runs in tiles from the point end back to the butt; both ends stay where the clock puts them.
  ctx.translate(tip.x, tip.y);
  ctx.rotate(pose.heading + view.angle + Math.PI);
  ctx.scale(size, size);
  const pointHalf = HALF * (pointStands ? 1 + swell : 1);
  const buttHalf = HALF * (pointStands ? 1 : 1 + swell);
  ctx.beginPath();
  ctx.moveTo(0, -TIP_HALF);
  ctx.lineTo(POINT, -pointHalf);
  ctx.lineTo(BUTT, -HALF);
  ctx.lineTo(1, -buttHalf);
  ctx.lineTo(1, buttHalf);
  ctx.lineTo(BUTT, HALF);
  ctx.lineTo(POINT, pointHalf);
  ctx.lineTo(0, TIP_HALF);
  ctx.closePath();
  // A dark edge and a little dark haze keep the crayon apart from the road and the effects of a hit.
  ctx.lineJoin = "round";
  ctx.lineWidth = EDGE_PX / size;
  ctx.strokeStyle = COLOR.background;
  ctx.shadowColor = COLOR.background;
  ctx.shadowBlur = size * HAZE;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  ctx.fill();
  if (flash > 0) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = mixColors(color, COLOR.text, FLASH_WHITE * flash);
    const reach = 1 - BUTT;
    ctx.fillRect(pointStands ? 0 : BUTT, -HALF * 2, reach, HALF * 4);
    ctx.restore();
  }
  ctx.restore();
}

/** The tail the swinging end leaves along its arc up to `songTime`, in `color`; none across a repeat sign's jump. */
function drawTrail(painter: Painter, { path, songTime }: ClockedRoad, view: View, color: string): void {
  const { ctx } = painter;
  const size = view.tileSize;
  // Keep the identities of the two ends through a landing. The old arc fades in place.
  const opacity = ctx.globalAlpha;
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  for (let step = TRAIL_STEPS; step > 0; step--) {
    const fade = 1 - (step - 0.5) / TRAIL_STEPS;
    ctx.lineWidth = Math.max(1.5, size * TRAIL_WIDTH * fade);
    const before = walkingCrayonAt(path, songTime - TRAIL_S * step / TRAIL_STEPS);
    const after = walkingCrayonAt(path, songTime - TRAIL_S * (step - 1) / TRAIL_STEPS);
    if (before === null || after === null) continue;
    if (Math.hypot(before.pivot.x - after.pivot.x, before.pivot.y - after.pivot.y) > JUMP_TILES) continue;
    ctx.globalAlpha = opacity * TRAIL_OPACITY * fade;
    for (const end of ["tip", "flat"] as const) {
      const from = toScreen(view, before[end]);
      const to = toScreen(view, after[end]);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = opacity;
}

/** The tile the road next jumps back from, from `standing` on, if its landing is within `ECHO_LEAD_S`. */
function jumpAhead(path: Path, standing: number, songTime: number): number | null {
  for (let i = standing + 1; i < path.sweeps.length; i++) {
    const time = path.tiles[i]?.time;
    if (time === undefined || time - songTime > ECHO_LEAD_S) return null;
    if (path.sweeps[i]?.from !== undefined) return i;
  }
  return null;
}

/** The crayon moves by the clock alone, never by presses; a hit only widens and lights the end it landed on. */
export function drawWalkingCrayon(
  painter: Painter,
  { path, songTime }: ClockedRoad,
  view: View,
  hit: HitOnCrayon | null,
): void {
  const pose = walkingCrayonAt(path, songTime);
  if (pose === null) return;
  const { ctx } = painter;
  const size = view.tileSize;
  const center = toScreen(view, pose.pivot);
  const color = crayonColor(path, pose.standing);
  const landed = hit !== null && hit.landing === pose.standing ? hit : null;
  const swell = landed === null || CALM.matches ? 0 : landed.swell;
  ctx.save();

  const sweep = path.sweeps[pose.standing];
  if (sweep !== undefined) {
    painter.circle(center, size);
    ctx.strokeStyle = PACE_RING[sweep.pace];
    ctx.lineWidth = PACE_WIDTH[sweep.pace];
    ctx.stroke();
  }

  if (!CALM.matches) drawTrail(painter, { path, songTime }, view, color);

  const opacity = ctx.globalAlpha;
  // Before a repeat sign: a faint copy lies where the crayon is about to be set back to.
  const jump = jumpAhead(path, pose.standing, songTime);
  const jumpTime = jump === null ? null : path.tiles[jump]?.time;
  if (jump !== null && jumpTime !== undefined && jumpTime !== null && !CALM.matches) {
    const waiting = poseOn(path, jump, jumpTime);
    if (waiting !== null) {
      ctx.globalAlpha = opacity * ECHO_OPACITY;
      drawBody(painter, view, waiting, crayonColor(path, jump), 0, 0);
      ctx.globalAlpha = opacity;
    }
  }
  // Just after one: the crayon it was fades out where it landed, while the one set back turns on.
  const landedAt = path.tiles[pose.standing]?.time ?? songTime;
  const since = songTime - landedAt;
  let appear = 1;
  if (sweep?.from !== undefined && since < CROSSFADE_S && !CALM.matches) {
    appear = since / CROSSFADE_S;
    const gone = poseOn(path, pose.standing - 1, landedAt);
    if (gone !== null) {
      ctx.globalAlpha = opacity * (1 - appear);
      drawBody(painter, view, gone, crayonColor(path, pose.standing - 1), 0, 0);
    }
  }
  ctx.globalAlpha = opacity * appear;
  drawBody(painter, view, pose, color, swell, landed === null ? 0 : landed.flash);
  ctx.globalAlpha = opacity;
  ctx.restore();
}
