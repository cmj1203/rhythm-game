import { COLOR, mixColors, type Painter } from "./canvas";
import { toScreen, type View } from "./embroidery";
import type { Pace, Path } from "./path";
import { walkingCrayonAt } from "./walking-crayon";

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
  const tip = toScreen(view, pose.tip);
  const color = crayonColor(path, pose.standing);
  const pointStands = pose.standing % 2 === 1;
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

  if (!CALM.matches) {
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
  if (landed !== null && landed.flash > 0) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = mixColors(color, COLOR.text, FLASH_WHITE * landed.flash);
    const reach = 1 - BUTT;
    ctx.fillRect(pointStands ? 0 : BUTT, -HALF * 2, reach, HALF * 4);
    ctx.restore();
  }
  ctx.restore();
}
