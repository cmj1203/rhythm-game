import { COLOR, JUDGEMENT_COLOR, mixColors, type Painter, type Point, type Size } from "./canvas";
import { drawCrayon } from "./crayon";
import {
  blendViews,
  clothRect,
  drawCloth,
  drawGuide,
  drawStitches,
  fitView,
  threadAt,
  toScreen,
  type View,
} from "./embroidery";
import type { JudgeEvent, PlayState } from "./judge";
import { cameraAt, orbiterAngle, type Pace, type Path } from "./path";
import { poseAt, type Section } from "./sections";
import { aheadClarity, aheadEnd, laterPasses } from "./road-view";
import type { TempoMark } from "./tempo";
import { drawTempoMark } from "./tempo-mark";
import { standingAt } from "./walking-crayon";
import { drawWalkingCrayon, type HitOnCrayon } from "./walking-crayon-draw";

/** `accent`: a big moment of the song, whose hit gives the screen a kick. */
export type Feedback = JudgeEvent & { readonly at: number; readonly accent: boolean };

/**
 * "ready" shows the road frozen at its first position until the player presses the start key; "over" shows it
 * frozen at the miss that ended the game, under the game over notice.
 */
export type PlayingFrame = {
  readonly kind: "playing";
  readonly phase: "ready" | "playing" | "over";
  readonly play: PlayState;
  readonly path: Path;
  readonly sections: readonly Section[];
  readonly songTime: number;
  readonly duration: number;
  readonly feedback: Feedback | null;
  readonly bursts: readonly Feedback[];
};

export const BURST_S = 0.45;
/** How far the frozen road is darkened behind the game over notice. */
const GAME_OVER_SHADE = 0.6;
/** Near a game over the screen's edges glow miss red, at most this strongly, fading out this share of its shorter side in. */
const DANGER_OPACITY = 0.55;
const DANGER_REACH = 0.2;
/** How far apart tiles are on the screen at the usual camera distance: this share of its shorter side, within limits. */
const TILE_SHARE = 0.11;
const MIN_TILE_PX = 48;
const MAX_TILE_PX = 96;
/** The road ahead is shown this many tiles far, fading out toward the end. */
const TILES_AHEAD = 20;
/** How clearly the stitches already sewn show while the song plays, so that the road ahead stands out. */
const PAST_OPACITY = 0.3;
const FEEDBACK_FADE_S = 0.5;
export const EARLY_LATE_MIN_MS = 15;
const FINALE_DELAY_S = 1;
const FINALE_S = 2.5;
const SPARKLES_BY_JUDGEMENT = { perfect: 8, great: 6, good: 4, miss: 0 } as const;
/** A hit makes the combo number swell and the glow widen; both settle within this time. The camera keeps still. */
const PULSE_S = 0.16;
const PULSE_COMBO = 0.22;
/** The longer the combo, the bigger the hit effects. A combo reaches a new tier at each of these counts. */
const COMBO_TIERS = [10, 30, 60] as const;
const COMBO_COLOR = [COLOR.text, COLOR.sky, COLOR.pink, JUDGEMENT_COLOR.perfect] as const;
/** The radius of the ring on the tile to hit next, in tiles. */
const TARGET_RADIUS = 0.27;
/**
 * The ring's stroke, in tiles but never thinner than `TARGET_MIN_WIDTH_PX`, with a dark edge this wide on each side
 * so that it stays clear where the road ahead crosses itself under it.
 */
const TARGET_WIDTH = 0.05;
const TARGET_MIN_WIDTH_PX = 3;
const TARGET_EDGE_PX = 2;
/** How long the crayon is, in tiles. */
const CRAYON_LENGTH = 0.56;
/** How much of the crayon lies ahead of the place where it rides its circle; the rest trails behind. */
const CRAYON_LEAD = 0.55;
const TIP_AHEAD = CRAYON_LENGTH * CRAYON_LEAD;
const TIP_REACH = Math.hypot(1, TIP_AHEAD);
/**
 * How far the crayon rides behind the beat, in radians, so that on the beat its point is just touching the ring
 * on the tile to hit next. The point is `TIP_REACH` tiles from the stitch and atan(`TIP_AHEAD`) ahead of the
 * crayon's place on the circle. It meets a ring of radius r around a tile one unit away when the angle a between
 * the two, seen from the stitch, satisfies r² = reach² + 1 - 2·reach·cos(a).
 */
const CRAYON_LAG = Math.atan(TIP_AHEAD) + Math.acos((TIP_REACH ** 2 + 1 - TARGET_RADIUS ** 2) / (2 * TIP_REACH));
/** The glow around the stitch the crayon circles, per combo tier, as the two hex digits of its opacity. */
const GLOW_OPACITY = ["14", "1f", "29", "33"] as const;
/** The hit effects are drawn this faint at their strongest, so the crayon riding through them stays in sight. */
const BURST_OPACITY = 0.7;
const GLOW_REACH = 2.2;
const GLOW_REACH_PER_TIER = 0.5;
const PACE_COLOR = { normal: COLOR.text, fast: COLOR.pink, slow: COLOR.sky } as const satisfies Record<Pace, string>;

/** Pink for a note the crayon speeds up from, sky for one it slows down from, none for the rest. */
function speedMarkColor(mark: TempoMark | null | undefined): string | null {
  return mark === "faster" ? COLOR.pink : mark === "slower" ? COLOR.sky : null;
}
/**
 * Tile markers in tiles, with the minimum stroke in pixels. Picture roads keep their original sizes;
 * rhythm roads use the smaller markers. A marked tile gets a smaller dot inside its ring.
 */
const MARKERS = {
  picture: { dot: 0.11, markedDot: 0.07, ring: 0.18, width: 0.05, minWidth: 2 },
  rhythm: { dot: 0.07, markedDot: 0.055, ring: 0.14, width: 0.035, minWidth: 1.5 },
} as const;
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");
/**
 * Hit effects spring: they start `amount` past their size, swing back a little past it the other way, and settle,
 * within `SPRING_S`. `springAt` is that swing, 1 at the hit.
 */
const SPRING_HZ = 9;
const SPRING_DECAY_S = 0.045;
const SPRING_S = 0.22;
/** The judgement pops out this much bigger. */
const POP = 0.25;
/** On a rhythm road the screen keeps still, but for the hit of a big moment it pulls in this much and lets go. */
const KICK_ZOOM = 0.02;
/**
 * A hit swells the crayon's landed end this much wider at most, by judgement: up within `SWELL_UP_S` of the landing,
 * gone by `SWELL_S`. It also lights that end up white, this strongly, fading out within `FLASH_S`.
 */
const SWELL = { perfect: 0.2, great: 0.14, good: 0.08, miss: 0 } as const;
const SWELL_UP_S = 0.016;
const SWELL_S = 0.06;
const FLASH = { perfect: 1, great: 0.6, good: 0.3, miss: 0 } as const;
const FLASH_S = 0.04;
/** On rhythm roads a marker ring fades out over this long after landing. */
const MARK_FADE_S = 0.06;
/** On rhythm roads the rings and dots ahead are mixed toward the background. */
const MARK_STRENGTH = 0.7;
const DOT_STRENGTH = 0.6;
/** On a rhythm road the combo number springs out this much bigger at a hit. */
const COMBO_POP = 0.3;
/** A hit's ring sticks at its first size this long before it lets go and spreads. */
const RING_HOLD_S = 0.04;
/**
 * On a rhythm road the tile the crayon lands on is stamped: white at first, cooling to the judgement colour within
 * `STAMP_WHITE_S`, gone by `STAMP_S`, as strong as the judgement. Chalk dust flies off it, more for a better hit.
 * A missed tile is dimmed instead.
 */
const STAMP_STRENGTH = { perfect: 1, great: 0.55, good: 0.3, miss: 0 } as const;
const STAMP_WHITE_S = 0.1;
const STAMP_S = 0.35;
const STAMP_RADIUS = 0.3;
const DUST_BY_JUDGEMENT = { perfect: 14, great: 8, good: 3, miss: 0 } as const;
const DUST_S = 0.3;
const DUST_REACH = 0.75;
const DUST_SIZE = 0.07;
const MISS_DIM = 0.55;

/**
 * After the last note the camera pulls back until the whole embroidery fits where the result screen shows it.
 * 0 while playing, 1 once the finished piece is in place.
 */
export function finaleProgress({ tiles }: Path, songTime: number): number {
  const lastTime = tiles[tiles.length - 1]?.time ?? 0;
  return Math.min(1, Math.max(0, (songTime - lastTime - FINALE_DELAY_S) / FINALE_S));
}

/** 1 at the moment of a hit, falling to 0 shortly after. */
function hitPulse({ feedback, songTime }: PlayingFrame): number {
  if (REDUCED_MOTION.matches) return 0;
  if (feedback === null || feedback.judgement === "miss") return 0;
  const age = songTime - feedback.at;
  return age < 0 || age > PULSE_S ? 0 : 1 - age / PULSE_S;
}

function springAt(ageS: number): number {
  if (ageS < 0 || ageS > SPRING_S) return 0;
  return Math.exp(-ageS / SPRING_DECAY_S) * Math.cos(2 * Math.PI * SPRING_HZ * ageS);
}

function lastHit(bursts: readonly Feedback[]): Feedback | undefined {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const burst = bursts[i];
    if (burst !== undefined && burst.judgement !== "miss") return burst;
  }
  return undefined;
}

/** The spring of the last hit of a big moment on a rhythm road; 0 otherwise. */
function kickAt({ bursts, path, songTime }: PlayingFrame): number {
  if (REDUCED_MOTION.matches || path.rhythm === undefined) return 0;
  const last = lastHit(bursts);
  return last?.accent === true ? springAt(songTime - last.at) : 0;
}

/**
 * What the last hit does to the crayon, from when it lands (or the press, if that came later): the end standing on
 * the tile it landed on swells and settles, and lights up and fades. Null once that is over.
 */
function hitOnCrayon({ bursts, path, songTime }: PlayingFrame): HitOnCrayon | null {
  const last = lastHit(bursts);
  if (last === undefined) return null;
  const age = songTime - Math.max(last.at, path.tiles[last.index + 1]?.time ?? last.at);
  if (age < 0 || age >= SWELL_S) return null;
  const rise = age <= SWELL_UP_S ? age / SWELL_UP_S : (SWELL_S - age) / (SWELL_S - SWELL_UP_S);
  return {
    landing: last.index + 1,
    swell: SWELL[last.judgement] * rise,
    flash: age > FLASH_S ? 0 : FLASH[last.judgement] * (1 - age / FLASH_S),
  };
}

/** How much bigger the combo number is right now on a rhythm road: it springs out at each hit. */
function comboPop({ bursts, songTime }: PlayingFrame): number {
  const last = lastHit(bursts);
  return REDUCED_MOTION.matches || last === undefined ? 0 : COMBO_POP * springAt(songTime - last.at);
}

function comboTier(combo: number): number {
  return COMBO_TIERS.filter((atLeast) => combo >= atLeast).length;
}

function followView({ width, height }: Size, frame: PlayingFrame): View {
  const pose = poseAt(frame.sections, frame.songTime, REDUCED_MOTION.matches);
  const shorter = Math.min(width, height);
  const tileSize = Math.min(MAX_TILE_PX, Math.max(MIN_TILE_PX, shorter * TILE_SHARE));
  return {
    tileSize: tileSize * pose.zoom * (1 + KICK_ZOOM * kickAt(frame)),
    camera: cameraAt(frame.path, frame.songTime),
    anchor: { x: width / 2 + pose.slide * shorter, y: height * 0.52 },
    angle: pose.tilt,
  };
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

/** How clearly the road shows `steps` tiles ahead of the last stitch: in full there, gone `TILES_AHEAD` on. */
function nearness(steps: number): number {
  return Math.max(0, 1 - (steps / TILES_AHEAD) ** 2);
}

/** The stroke of the signs on the road ahead, in tiles but never thinner than `minWidth` pixels, and their arrowheads. */
const SIGN = { width: 0.05, minWidth: 2.5, head: 0.13 } as const;

/** An open arrowhead at `tip`, pointing along `angle`. */
function arrowHead(ctx: CanvasRenderingContext2D, tip: Point, angle: number, size: number): void {
  ctx.beginPath();
  for (const side of [-1, 1]) {
    const back = angle + Math.PI + side * 0.55;
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(tip.x + Math.cos(back) * size, tip.y + Math.sin(back) * size);
  }
  ctx.stroke();
}

/** Points on an arc round `center` of radius `r`, from angle `from` to `to`. */
function arcPoints(center: Point, r: number, from: number, to: number, count = 24): Point[] {
  return Array.from({ length: count + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / count;
    return { x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r };
  });
}

/** A line through `points` with an arrowhead at its last point, pointing the way the line runs there. */
function arrowLine(ctx: CanvasRenderingContext2D, points: readonly Point[], head: number): void {
  ctx.beginPath();
  points.forEach((point, i) => (i === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
  ctx.stroke();
  const tip = points[points.length - 1];
  const before = points[points.length - 2];
  if (tip !== undefined && before !== undefined) arrowHead(ctx, tip, Math.atan2(tip.y - before.y, tip.x - before.x), head);
}

/** Sets `ctx` up to draw the signs on the road ahead. */
function signStroke(ctx: CanvasRenderingContext2D, view: View): void {
  ctx.strokeStyle = COLOR.text;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(SIGN.minWidth, view.tileSize * SIGN.width);
}

/**
 * A point near the tile `at`, reached along the road from `from`: `x` tiles on along the road from the tile
 * (negative: back toward `from`), `y` tiles to its side. All on the screen.
 */
function alongRoad(view: View, from: Point, at: Point): (x: number, y: number) => Point {
  const along = Math.atan2(at.y - from.y, at.x - from.x);
  const ux = Math.cos(along) * view.tileSize;
  const uy = Math.sin(along) * view.tileSize;
  return (x, y) => ({ x: at.x + ux * x - uy * y, y: at.y + uy * x + ux * y });
}

/** A turn-back's arrow, in tiles: how far it runs to the side of the road, and how far from the tile before it starts. */
const TURN_BACK = { side: 0.3, start: 0.28 } as const;

/**
 * Where the crayon goes one tile out and straight back along the same line, the line alone would show one tile. A
 * U-turn arrow runs beside it, as in a stroke-order drawing: out along one side, round the tile, back along the other.
 */
function drawTurnBacks(
  painter: Painter,
  path: Path,
  view: View,
  standing: number,
  end: number,
  clarity: (steps: number) => number,
): void {
  const { ctx } = painter;
  const opacity = ctx.globalAlpha;
  ctx.save();
  signStroke(ctx, view);
  for (let k = Math.max(1, standing); k < end; k++) {
    const from = path.tiles[k - 1];
    const turn = path.tiles[k];
    const back = path.tiles[k + 1];
    if (from === undefined || turn === undefined || back === undefined) continue;
    if (Math.hypot(from.x - back.x, from.y - back.y) > 1e-3) continue;
    const a = toScreen(view, from);
    const b = toScreen(view, turn);
    const local = alongRoad(view, a, b);
    const along = Math.atan2(b.y - a.y, b.x - a.x);
    const start = TURN_BACK.start - Math.hypot(b.x - a.x, b.y - a.y) / view.tileSize;
    ctx.globalAlpha = opacity * clarity(k - standing);
    arrowLine(ctx, [
      local(start, TURN_BACK.side),
      local(0, TURN_BACK.side),
      ...arcPoints(b, view.tileSize * TURN_BACK.side, along + Math.PI / 2, along - Math.PI / 2).slice(1),
      local(start, -TURN_BACK.side),
    ], view.tileSize * SIGN.head);
  }
  ctx.restore();
}

/** A midspin's arrow on its tile, in tiles: how far back it starts and ends, how wide it opens, how far past the tile its point is, its head. */
const MIDSPIN = { back: 0.42, spread: 0.32, point: 0.26, head: 0.16 } as const;

/**
 * Where the crayon touches a tile without stopping and swings on around the tile before (a midspin), a sharp V-turn
 * arrow lies on the tile: in to a point just past it and straight back, as the crayon goes.
 */
function drawMidspins(
  painter: Painter,
  path: Path,
  view: View,
  standing: number,
  end: number,
  clarity: (steps: number) => number,
): void {
  const { ctx } = painter;
  const opacity = ctx.globalAlpha;
  ctx.save();
  signStroke(ctx, view);
  for (let k = Math.max(1, standing); k <= end; k++) {
    const around = path.sweeps[k]?.around;
    const from = around === undefined ? undefined : path.tiles[around];
    const point = path.tiles[k];
    if (from === undefined || point === undefined) continue;
    const local = alongRoad(view, toScreen(view, from), toScreen(view, point));
    ctx.globalAlpha = opacity * clarity(k - standing);
    arrowLine(
      ctx,
      [local(-MIDSPIN.back, MIDSPIN.spread), local(MIDSPIN.point, 0), local(-MIDSPIN.back, -MIDSPIN.spread)],
      view.tileSize * MIDSPIN.head,
    );
  }
  ctx.restore();
}

/** A pause's arrow round its tile, in tiles: the radius of the first lap, how much wider each further lap is, its arc and head. */
const PAUSE = { radius: 0.42, step: 0.1, arc: (5 * Math.PI) / 3, head: 0.13 } as const;

/**
 * Where the crayon spends a rest in whole extra turns around its tile (a pause), an arrow runs round that tile the
 * way the crayon will turn, one arrow for each extra turn, so the road ahead shows it going round there.
 */
function drawPauses(
  painter: Painter,
  path: Path,
  view: View,
  standing: number,
  end: number,
  clarity: (steps: number) => number,
): void {
  const { ctx } = painter;
  const opacity = ctx.globalAlpha;
  for (let k = Math.max(1, standing); k <= end; k++) {
    const sweep = path.sweeps[k];
    const tile = path.tiles[sweep?.around ?? k];
    if (sweep?.laps === undefined || tile === undefined) continue;
    const center = toScreen(view, tile);
    const spin = sweep.angle < 0 ? -1 : 1;
    const start = sweep.startAngle + view.angle;
    ctx.globalAlpha = opacity * clarity(k - standing);
    ctx.strokeStyle = COLOR.text;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(SIGN.minWidth, view.tileSize * SIGN.width);
    for (let lap = 0; lap < sweep.laps; lap++) {
      const radius = view.tileSize * (PAUSE.radius + PAUSE.step * lap);
      const finish = start + spin * PAUSE.arc;
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, start, finish, spin < 0);
      ctx.stroke();
      // The head points along the turn at the arc's end.
      const tip = { x: center.x + Math.cos(finish) * radius, y: center.y + Math.sin(finish) * radius };
      const ahead = finish + (spin * Math.PI) / 2;
      const head = view.tileSize * PAUSE.head;
      ctx.beginPath();
      for (const side of [-1, 1]) {
        const back = ahead + Math.PI + side * 0.6;
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(tip.x + Math.cos(back) * head, tip.y + Math.sin(back) * head);
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = opacity;
}

/** The road still to sew, with the rhythm markers on its tiles and a ring on the tile to hit next. */
function drawAhead(painter: Painter, { path, play, songTime }: PlayingFrame, view: View): void {
  const { ctx } = painter;
  const opacity = ctx.globalAlpha;
  const isRhythm = path.rhythm !== undefined;
  const markers = isRhythm ? MARKERS.rhythm : MARKERS.picture;
  const standing = isRhythm ? standingAt(path.tiles, songTime) : play.resolvedCount;
  const end = path.rhythm === undefined
    ? Math.min(path.tiles.length - 1, standing + TILES_AHEAD)
    : aheadEnd({ ...path, rhythm: path.rhythm }, standing, songTime);
  const clarity = isRhythm ? (steps: number): number => aheadClarity(steps, end - standing) : nearness;
  const later = path.rhythm === undefined ? new Set<number>() : laterPasses({ ...path, rhythm: path.rhythm }, standing, end);
  drawGuide(painter, path, view, standing, end, clarity, () => COLOR.text);
  if (isRhythm) {
    drawTurnBacks(painter, path, view, standing, end, clarity);
    drawMidspins(painter, path, view, standing, end, clarity);
    drawPauses(painter, path, view, standing, end, clarity);
  }

  for (let i = standing; i <= end; i++) {
    const tile = path.tiles[i];
    const sweep = path.sweeps[i];
    if (tile === undefined || sweep === undefined || later.has(i)) continue;
    const center = toScreen(view, tile);
    ctx.globalAlpha = opacity * clarity(i - standing);
    const isMarked = sweep.isTwirl ||
      (isRhythm ? speedMarkColor(path.rhythm?.marks[i]) !== null : sweep.pace !== "normal");
    painter.circle(center, view.tileSize * (isMarked ? markers.markedDot : markers.dot));
    // On a rhythm road a note is sky or pink only where the speed changes (its tempo mark), so a run of rests turned
    // at the same slow speed shows one sky note, not one per rest.
    const speedColor = speedMarkColor(path.rhythm?.marks[i]);
    const marker = sweep.isTwirl ? COLOR.violet : isRhythm ? speedColor ?? COLOR.text : PACE_COLOR[sweep.pace];
    const dot = isRhythm
      ? (speedColor !== null && sweep.isTwirl ? speedColor : COLOR.text)
      : (sweep.pace === "normal" ? marker : PACE_COLOR[sweep.pace]);
    ctx.fillStyle = isRhythm ? mixColors(COLOR.background, dot, DOT_STRENGTH) : dot;
    ctx.fill();
    if (isMarked) {
      const landed = isRhythm && i === standing ? Math.min(1, Math.max(0, (songTime - tile.time) / MARK_FADE_S)) : 0;
      painter.circle(center, view.tileSize * markers.ring);
      ctx.strokeStyle = isRhythm ? mixColors(marker, COLOR.background, 1 - MARK_STRENGTH + MARK_STRENGTH * landed) : marker;
      ctx.lineWidth = Math.max(markers.minWidth, view.tileSize * markers.width);
      if (landed < 1) ctx.stroke();
    }
    const tempoMark = path.rhythm?.marks[i];
    const next = path.tiles[i + 1];
    if (tempoMark !== undefined && tempoMark !== null && next !== undefined) {
      drawTempoMark(painter, tempoMark, {
        at: center,
        angle: Math.atan2(next.y - tile.y, next.x - tile.x) + view.angle,
        size: view.tileSize,
      });
    }
  }
  ctx.globalAlpha = opacity;

  const target = path.tiles[standing + 1];
  const targetSweep = path.sweeps[standing + 1];
  // A coloured note's ring takes the note's colour, so the colour shows on the very tile to hit.
  const targetMark = path.rhythm?.marks[standing + 1];
  const targetColor = targetSweep?.isTwirl === true
    ? COLOR.violet
    : isRhythm
      ? speedMarkColor(targetMark) ?? COLOR.text
      : targetSweep !== undefined && targetSweep.pace !== "normal" ? PACE_COLOR[targetSweep.pace] : COLOR.text;
  if (target !== undefined) {
    const width = Math.max(TARGET_MIN_WIDTH_PX, view.tileSize * TARGET_WIDTH);
    painter.circle(toScreen(view, target), view.tileSize * TARGET_RADIUS);
    ctx.strokeStyle = COLOR.background;
    ctx.lineWidth = width + TARGET_EDGE_PX * 2;
    ctx.stroke();
    ctx.strokeStyle = targetColor;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

/**
 * The crayon circles the last stitch, point first, in the colour of the line it is drawing. It rides `CRAYON_LAG`
 * behind the beat, so the moment to press is when its point touches the ring on the tile to hit next.
 */
function drawCircling(painter: Painter, frame: PlayingFrame, view: View): void {
  if (frame.path.rhythm !== undefined) {
    drawWalkingCrayon(painter, frame, view, hitOnCrayon(frame));
    return;
  }
  const { ctx } = painter;
  const { path, play, songTime } = frame;
  const standing = play.resolvedCount;
  const pivot = path.tiles[standing];
  const sweep = path.sweeps[standing];
  if (pivot === undefined || sweep === undefined) return;
  const thread = threadAt(path, standing);

  const size = view.tileSize;
  const spin = sweep.angle < 0 ? -1 : 1;
  const angle = orbiterAngle(sweep, songTime) - spin * CRAYON_LAG;
  const center = toScreen(view, pivot);

  const tier = comboTier(play.combo);
  const reach = size * (GLOW_REACH + GLOW_REACH_PER_TIER * tier) * (1 + hitPulse(frame) * 0.2);
  const glow = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, reach);
  glow.addColorStop(0, `${thread}${GLOW_OPACITY[tier] ?? GLOW_OPACITY[0]}`);
  glow.addColorStop(1, `${thread}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(center.x - reach, center.y - reach, reach * 2, reach * 2);

  // While the crayon turns fast or slowly, its circle is drawn in the colour of the tile it set out from.
  const isPaced = sweep.pace !== "normal";
  painter.circle(center, size);
  ctx.strokeStyle = isPaced ? PACE_COLOR[sweep.pace] : COLOR.separator;
  ctx.lineWidth = isPaced ? 2 : 1;
  ctx.stroke();

  painter.circle(center, size * 0.08);
  ctx.fillStyle = thread;
  ctx.fill();

  const heading = angle + (spin * Math.PI) / 2 + view.angle;
  const at = toScreen(view, { x: pivot.x + Math.cos(angle), y: pivot.y + Math.sin(angle) });
  const length = size * CRAYON_LENGTH;
  const lead = length * CRAYON_LEAD;
  drawCrayon(painter, { x: at.x + Math.cos(heading) * lead, y: at.y + Math.sin(heading) * lead }, heading, length, thread);
}

/** The hit effect: a ring and sparkles spreading from the tile that was just stitched into. */
function drawBursts(painter: Painter, { bursts, path, play, songTime }: PlayingFrame, view: View): void {
  const { ctx } = painter;
  const tier = comboTier(play.combo);
  const isRhythm = path.rhythm !== undefined;
  for (const burst of bursts) {
    const tile = path.tiles[burst.index + 1];
    const age = (songTime - burst.at) / BURST_S;
    if (tile === undefined || age < 0 || age > 1) continue;
    if (burst.judgement === "miss" && !isRhythm) continue;

    const center = toScreen(view, tile);
    if (isRhythm) {
      drawLanding(painter, burst, songTime - burst.at, center, view.tileSize);
      if (burst.judgement === "miss") continue;
    }
    const color = JUDGEMENT_COLOR[burst.judgement];
    const radius = view.tileSize * 0.4;
    ctx.save();
    ctx.globalAlpha = BURST_OPACITY * (1 - age);
    const held = isRhythm ? Math.max(0, (songTime - burst.at - RING_HOLD_S) / (BURST_S - RING_HOLD_S)) : age;
    painter.circle(center, radius * (REDUCED_MOTION.matches ? 1 : 1 + (isRhythm ? 1.1 : 0.9) * easeOut(held)));
    ctx.strokeStyle = color;
    ctx.lineWidth = radius * (isRhythm ? 0.24 : 0.16) * (REDUCED_MOTION.matches ? 1 : 1 - age);
    ctx.stroke();
    if (!REDUCED_MOTION.matches && tier >= 2) {
      painter.circle(center, radius * (1 + 1.7 * easeOut(age)));
      ctx.strokeStyle = COLOR.text;
      ctx.lineWidth = radius * 0.08 * (1 - age);
      ctx.stroke();
    }

    // A rhythm road's chalk dust takes the place of the sparkles.
    const count = REDUCED_MOTION.matches || isRhythm ? 0 : SPARKLES_BY_JUDGEMENT[burst.judgement] + 2 * tier;
    for (let i = 0; i < count; i++) {
      const direction = (i / count) * Math.PI * 2 + burst.index * 0.7;
      const distance = radius * (1.2 + (1.8 + 0.5 * tier) * easeOut(age));
      painter.sparkle(
        { x: center.x + Math.cos(direction) * distance, y: center.y + Math.sin(direction) * distance },
        radius * 0.3 * (1 - age * 0.7),
      );
      ctx.fillStyle = i % 2 === 0 ? COLOR.text : color;
      ctx.fill();
    }
    ctx.restore();
  }
}

/** A rhythm road's tile `ageS` after it was hit or missed: the stamp and chalk dust of a hit, or a missed tile dimmed. */
function drawLanding(painter: Painter, { judgement, index }: Feedback, ageS: number, center: Point, size: number): void {
  const { ctx } = painter;
  ctx.save();
  if (judgement === "miss") {
    const fade = 1 - ageS / BURST_S;
    ctx.globalAlpha *= MISS_DIM * fade;
    painter.circle(center, size * STAMP_RADIUS);
    ctx.fillStyle = COLOR.background;
    ctx.fill();
    painter.circle(center, size * STAMP_RADIUS * (REDUCED_MOTION.matches ? 1 : 0.8 + 0.4 * fade));
    ctx.strokeStyle = COLOR.dim;
    ctx.lineWidth = Math.max(1.5, size * 0.03);
    ctx.stroke();
    ctx.restore();
    return;
  }
  const color = JUDGEMENT_COLOR[judgement];
  if (ageS < STAMP_S) {
    ctx.globalAlpha *= STAMP_STRENGTH[judgement] * (1 - ageS / STAMP_S);
    painter.circle(center, size * STAMP_RADIUS * (REDUCED_MOTION.matches ? 1 : 1 + 0.3 * springAt(ageS)));
    ctx.fillStyle = ageS < STAMP_WHITE_S ? mixColors(COLOR.text, color, ageS / STAMP_WHITE_S) : color;
    ctx.fill();
  }
  ctx.restore();
  if (REDUCED_MOTION.matches || ageS >= DUST_S) return;
  const count = DUST_BY_JUDGEMENT[judgement];
  const along = easeOut(ageS / DUST_S);
  ctx.save();
  ctx.globalAlpha *= 1 - ageS / DUST_S;
  for (let i = 0; i < count; i++) {
    // A fixed scatter for each note, so the same hit always throws the same dust.
    const scatter = Math.sin((index + 1) * 12.9898 + i * 78.233) * 43758.5453;
    const jitter = scatter - Math.floor(scatter);
    const direction = (i / count) * Math.PI * 2 + jitter * 1.3;
    const distance = size * DUST_REACH * (0.5 + 0.5 * jitter) * along;
    const grain = size * DUST_SIZE * (0.6 + 0.8 * jitter);
    ctx.fillStyle = i % 3 === 0 ? color : COLOR.text;
    ctx.fillRect(
      center.x + Math.cos(direction) * distance - grain / 2,
      center.y + Math.sin(direction) * distance - grain / 2,
      grain,
      grain,
    );
  }
  ctx.restore();
}

/** The judgement of the last press at `at`, fading out, with how early or late the press was under it. */
function drawFeedback(painter: Painter, feedback: Feedback | null, songTime: number, at: Point): void {
  if (feedback === null) return;
  const age = songTime - feedback.at;
  if (age < 0 || age > FEEDBACK_FADE_S) return;
  const { ctx } = painter;
  ctx.save();
  ctx.globalAlpha *= 1 - age / FEEDBACK_FADE_S;
  const pop = REDUCED_MOTION.matches ? 0 : POP * springAt(age);
  painter.text(feedback.judgement.toUpperCase(), at, {
    size: 32 * (1 + pop),
    weight: 800,
    color: JUDGEMENT_COLOR[feedback.judgement],
  });
  if (feedback.judgement !== "miss" && Math.abs(feedback.offsetMs) >= EARLY_LATE_MIN_MS) {
    const label = feedback.offsetMs < 0 ? "빠름" : "느림";
    painter.text(`${label} ${Math.abs(feedback.offsetMs).toFixed(0)}ms`, { x: at.x, y: at.y + 30 }, {
      size: 14,
      color: COLOR.dim,
    });
  }
  ctx.restore();
}

function drawHud(painter: Painter, frame: PlayingFrame, { width, height }: Size): void {
  const { ctx } = painter;
  const { play, feedback, songTime } = frame;

  ctx.fillStyle = COLOR.separator;
  ctx.fillRect(0, 0, width, 4);
  ctx.fillStyle = COLOR.dim;
  ctx.fillRect(0, 0, width * Math.min(1, Math.max(0, songTime / frame.duration)), 4);
  painter.text(play.score.toLocaleString("en-US"), { x: 24, y: 36 }, { size: 24, weight: 700, align: "left" });

  const x = width / 2;
  if (play.combo >= 2) {
    painter.text(String(play.combo), { x, y: height * 0.16 }, {
      size: 56 * (1 + (frame.path.rhythm === undefined ? PULSE_COMBO * hitPulse(frame) : comboPop(frame))),
      weight: 800,
      color: COMBO_COLOR[comboTier(play.combo)] ?? COLOR.text,
    });
    painter.text("COMBO", { x, y: height * 0.16 + 40 }, { size: 13, weight: 600, color: COLOR.dim });
  }
  if (frame.phase === "ready") {
    painter.text("누르면 시작", { x, y: height * 0.2 }, { size: 28, weight: 800 });
  }
  drawFeedback(painter, feedback, songTime, { x, y: height * 0.76 });
}

export function drawPlaying(painter: Painter, frame: PlayingFrame, size: Size): void {
  const { ctx } = painter;
  const finale = finaleProgress(frame.path, frame.songTime);
  const visualFinale = REDUCED_MOTION.matches && finale > 0 ? 1 : finale;
  const follow = followView(size, frame);
  // While the camera pulls back, the thread is pulled tight, so the sewn road settles into the picture.
  const taut = easeInOut(visualFinale);
  const view = visualFinale > 0 ? blendViews(follow, fitView(frame.path, clothRect(size)), taut) : follow;

  drawCloth(painter, view, size);
  // The sewn road stays in the background until the piece is finished; the road ahead is drawn over it.
  const pastOpacity = frame.path.rhythm === undefined ? PAST_OPACITY : 0.15;
  drawStitches(painter, frame.path, frame.play.history, view, taut, pastOpacity + (1 - pastOpacity) * taut);
  ctx.save();
  ctx.globalAlpha = 1 - visualFinale;
  drawAhead(painter, frame, view);
  ctx.restore();
  drawBursts(painter, frame, view);
  ctx.save();
  ctx.globalAlpha = 1 - visualFinale;
  drawCircling(painter, frame, view);
  drawDanger(painter, frame.play.danger, size);
  drawHud(painter, frame, size);
  ctx.restore();
  if (frame.phase === "over") drawGameOver(painter, size);
}

/** The road, the crayon, the rings and the landings of a playing frame, without score, combo or warnings. */
export function drawRoadOnly(painter: Painter, frame: PlayingFrame, size: Size): void {
  const view = followView(size, frame);
  drawCloth(painter, view, size);
  drawStitches(painter, frame.path, frame.play.history, view, 0, frame.path.rhythm === undefined ? PAST_OPACITY : 0.15);
  drawAhead(painter, frame, view);
  drawBursts(painter, frame, view);
  drawCircling(painter, frame, view);
}

/** A red glow along every edge of the screen, as strong as `danger`: 0 is none, 1 is a game over. */
function drawDanger(painter: Painter, danger: number, { width, height }: Size): void {
  if (danger <= 0) return;
  const { ctx } = painter;
  const reach = Math.min(width, height) * DANGER_REACH;
  // Each band: where its gradient runs from (the edge) and to, then the rectangle it fills.
  const bands = [
    [0, 0, 0, reach, 0, 0, width, reach],
    [0, height, 0, height - reach, 0, height - reach, width, reach],
    [0, 0, reach, 0, 0, 0, reach, height],
    [width, 0, width - reach, 0, width - reach, 0, reach, height],
  ] as const;
  ctx.save();
  ctx.globalAlpha *= DANGER_OPACITY * Math.min(1, danger);
  for (const [fromX, fromY, toX, toY, x, y, w, h] of bands) {
    const band = ctx.createLinearGradient(fromX, fromY, toX, toY);
    band.addColorStop(0, JUDGEMENT_COLOR.miss);
    band.addColorStop(1, `${JUDGEMENT_COLOR.miss}00`);
    ctx.fillStyle = band;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

/** The road dimmed behind the words "게임 오버", and nothing else. */
function drawGameOver(painter: Painter, { width, height }: Size): void {
  const { ctx } = painter;
  ctx.save();
  ctx.globalAlpha = GAME_OVER_SHADE;
  ctx.fillStyle = COLOR.background;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
  painter.text("게임 오버", { x: width / 2, y: height * 0.45 }, { size: 48, weight: 800, color: JUDGEMENT_COLOR.miss });
}
