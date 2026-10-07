import { COLOR, JUDGEMENT_COLOR, type Painter, type Point, type Size } from "./canvas";
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

export type Feedback = JudgeEvent & { readonly at: number };

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
/** The dot on each tile ahead, in tiles. */
const DOT_RADIUS = 0.11;
/**
 * A tile the crayon leaves fast or slowly, or where it changes its way round, gets a smaller dot in a ring of this
 * radius and stroke width (tiles) instead, in the colour of what happens there. Where both happen, the ring is violet
 * and the dot keeps the colour of the pace.
 */
const MARK_DOT_RADIUS = 0.07;
const MARK_RING_RADIUS = 0.18;
const MARK_RING_WIDTH = 0.05;

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
  if (feedback === null || feedback.judgement === "miss") return 0;
  const age = songTime - feedback.at;
  return age < 0 || age > PULSE_S ? 0 : 1 - age / PULSE_S;
}

function comboTier(combo: number): number {
  return COMBO_TIERS.filter((atLeast) => combo >= atLeast).length;
}

function followView({ width, height }: Size, frame: PlayingFrame): View {
  const pose = poseAt(frame.sections, frame.songTime);
  const shorter = Math.min(width, height);
  const tileSize = Math.min(MAX_TILE_PX, Math.max(MIN_TILE_PX, shorter * TILE_SHARE));
  return {
    tileSize: tileSize * pose.zoom,
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

/** The road still to sew, with the rhythm markers on its tiles and a ring on the tile to hit next. */
function drawAhead(painter: Painter, { path, play }: PlayingFrame, view: View): void {
  const { ctx } = painter;
  const opacity = ctx.globalAlpha;
  const standing = play.resolvedCount;
  const end = Math.min(path.tiles.length - 1, standing + TILES_AHEAD);
  drawGuide(painter, path, view, standing, end, nearness);

  for (let i = standing; i <= end; i++) {
    const tile = path.tiles[i];
    const sweep = path.sweeps[i];
    if (tile === undefined || sweep === undefined) continue;
    const center = toScreen(view, tile);
    ctx.globalAlpha = opacity * nearness(i - standing);
    const isMarked = sweep.pace !== "normal" || sweep.isTwirl;
    painter.circle(center, view.tileSize * (isMarked ? MARK_DOT_RADIUS : DOT_RADIUS));
    ctx.fillStyle = sweep.pace === "normal" && sweep.isTwirl ? COLOR.violet : PACE_COLOR[sweep.pace];
    ctx.fill();
    if (isMarked) {
      painter.circle(center, view.tileSize * MARK_RING_RADIUS);
      ctx.strokeStyle = sweep.isTwirl ? COLOR.violet : PACE_COLOR[sweep.pace];
      ctx.lineWidth = Math.max(2, view.tileSize * MARK_RING_WIDTH);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = opacity;

  const target = path.tiles[standing + 1];
  if (target !== undefined) {
    const width = Math.max(TARGET_MIN_WIDTH_PX, view.tileSize * TARGET_WIDTH);
    painter.circle(toScreen(view, target), view.tileSize * TARGET_RADIUS);
    ctx.strokeStyle = COLOR.background;
    ctx.lineWidth = width + TARGET_EDGE_PX * 2;
    ctx.stroke();
    ctx.strokeStyle = COLOR.text;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

/**
 * The crayon circles the last stitch, point first, in the colour of the line it is drawing. It rides `CRAYON_LAG`
 * behind the beat, so the moment to press is when its point touches the ring on the tile to hit next.
 */
function drawCircling(painter: Painter, frame: PlayingFrame, view: View): void {
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
  for (const burst of bursts) {
    const tile = path.tiles[burst.index + 1];
    const age = (songTime - burst.at) / BURST_S;
    if (tile === undefined || age < 0 || age > 1) continue;

    const center = toScreen(view, tile);
    const color = JUDGEMENT_COLOR[burst.judgement];
    const radius = view.tileSize * 0.4;
    ctx.save();
    ctx.globalAlpha = BURST_OPACITY * (1 - age);
    painter.circle(center, radius * (1 + 0.9 * easeOut(age)));
    ctx.strokeStyle = color;
    ctx.lineWidth = radius * 0.16 * (1 - age);
    ctx.stroke();
    if (tier >= 2) {
      painter.circle(center, radius * (1 + 1.7 * easeOut(age)));
      ctx.strokeStyle = COLOR.text;
      ctx.lineWidth = radius * 0.08 * (1 - age);
      ctx.stroke();
    }

    const count = SPARKLES_BY_JUDGEMENT[burst.judgement] + 2 * tier;
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

/** The judgement of the last press at `at`, fading out, with how early or late the press was under it. */
function drawFeedback(painter: Painter, feedback: Feedback | null, songTime: number, at: Point): void {
  if (feedback === null) return;
  const age = songTime - feedback.at;
  if (age < 0 || age > FEEDBACK_FADE_S) return;
  const { ctx } = painter;
  ctx.save();
  ctx.globalAlpha *= 1 - age / FEEDBACK_FADE_S;
  painter.text(feedback.judgement.toUpperCase(), at, { size: 32, weight: 800, color: JUDGEMENT_COLOR[feedback.judgement] });
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
      size: 56 * (1 + PULSE_COMBO * hitPulse(frame)),
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
  const follow = followView(size, frame);
  // While the camera pulls back, the thread is pulled tight, so the sewn road settles into the picture.
  const taut = easeInOut(finale);
  const view = finale > 0 ? blendViews(follow, fitView(frame.path, clothRect(size)), taut) : follow;

  drawCloth(painter, view, size);
  // The sewn road stays in the background until the piece is finished; the road ahead is drawn over it.
  drawStitches(painter, frame.path, frame.play.history, view, taut, PAST_OPACITY + (1 - PAST_OPACITY) * taut);
  ctx.save();
  ctx.globalAlpha = 1 - finale;
  drawAhead(painter, frame, view);
  ctx.restore();
  drawBursts(painter, frame, view);
  ctx.save();
  ctx.globalAlpha = 1 - finale;
  drawCircling(painter, frame, view);
  drawDanger(painter, frame.play.danger, size);
  drawHud(painter, frame, size);
  ctx.restore();
  if (frame.phase === "over") drawGameOver(painter, size);
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
