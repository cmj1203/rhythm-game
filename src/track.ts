import { COLOR, JUDGEMENT_COLOR, type Painter, type Size } from "./canvas";
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

/** "ready" shows the road frozen at its first position until the player presses the start key. */
export type PlayingFrame = {
  readonly kind: "playing";
  readonly phase: "ready" | "playing";
  readonly play: PlayState;
  readonly path: Path;
  readonly sections: readonly Section[];
  readonly songTime: number;
  readonly duration: number;
  readonly feedback: Feedback | null;
  readonly bursts: readonly Feedback[];
};

export const BURST_S = 0.45;
/** The road ahead is shown this many tiles far, fading out toward the end. */
const TILES_AHEAD = 20;
/** How clearly the stitches already sewn show while the song plays, so that the road ahead stands out. */
const PAST_OPACITY = 0.3;
const FEEDBACK_FADE_S = 0.5;
const EARLY_LATE_MIN_MS = 15;
const FINALE_DELAY_S = 1;
const FINALE_S = 2.5;
const SPARKLES_BY_JUDGEMENT = { perfect: 8, great: 6, good: 4, miss: 0 } as const;
/** A hit makes the screen jump a little closer and the combo number swell; both settle within this time. */
const PULSE_S = 0.16;
const PULSE_ZOOM = 0.03;
const PULSE_COMBO = 0.22;
/** The longer the combo, the bigger the hit effects. A combo reaches a new tier at each of these counts. */
const COMBO_TIERS = [10, 30, 60] as const;
const COMBO_COLOR = [COLOR.text, COLOR.sky, COLOR.pink, JUDGEMENT_COLOR.perfect] as const;
/** The radius of the ring on the tile to hit next, in tiles. */
const TARGET_RADIUS = 0.27;
/** How long the needle is from eye to point and how wide it is at the eye, in tiles. */
const NEEDLE_LENGTH = 0.42;
const NEEDLE_WIDTH = 0.1;
/** The glow around the stitch the needle circles, per combo tier, as the two hex digits of its opacity. */
const GLOW_OPACITY = ["1a", "2b", "3d", "52"] as const;
const GLOW_REACH = 2.2;
const GLOW_REACH_PER_TIER = 0.5;
const PACE_COLOR = { normal: COLOR.text, slow: COLOR.sky, fast: COLOR.pink } as const satisfies Record<Pace, string>;

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
  const tileSize = Math.min(72, Math.max(36, Math.min(width, height) * 0.085));
  return {
    tileSize: tileSize * pose.zoom * (1 + PULSE_ZOOM * hitPulse(frame)),
    camera: cameraAt(frame.path, frame.songTime),
    anchor: { x: width / 2, y: height * 0.52 },
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
    painter.circle(center, view.tileSize * 0.11);
    ctx.fillStyle = PACE_COLOR[sweep.pace];
    ctx.fill();
    if (sweep.isTwirl) {
      painter.circle(center, view.tileSize * 0.19);
      ctx.strokeStyle = COLOR.violet;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = opacity;

  const target = path.tiles[standing + 1];
  if (target !== undefined) {
    painter.circle(toScreen(view, target), view.tileSize * TARGET_RADIUS);
    ctx.strokeStyle = COLOR.text;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

/**
 * The needle circles the last stitch on the end of its thread, in line with the thread and pointing away from
 * the stitch. Its point is always exactly one tile out, so the moment to press is when the point reaches the
 * middle of the ring on the tile to hit next.
 */
function drawNeedle(painter: Painter, frame: PlayingFrame, view: View): void {
  const { ctx } = painter;
  const { path, play, songTime } = frame;
  const standing = play.resolvedCount;
  const pivot = path.tiles[standing];
  const sweep = path.sweeps[standing];
  if (pivot === undefined || sweep === undefined) return;
  const thread = threadAt(path, standing);

  const size = view.tileSize;
  const angle = orbiterAngle(sweep, songTime);
  const center = toScreen(view, pivot);

  const tier = comboTier(play.combo);
  const reach = size * (GLOW_REACH + GLOW_REACH_PER_TIER * tier) * (1 + hitPulse(frame) * 0.2);
  const glow = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, reach);
  glow.addColorStop(0, `${thread}${GLOW_OPACITY[tier] ?? GLOW_OPACITY[0]}`);
  glow.addColorStop(1, `${thread}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(center.x - reach, center.y - reach, reach * 2, reach * 2);

  painter.circle(center, size);
  ctx.strokeStyle = COLOR.separator;
  ctx.lineWidth = 1;
  ctx.stroke();

  const point = toScreen(view, { x: pivot.x + Math.cos(angle), y: pivot.y + Math.sin(angle) });
  const heading = Math.atan2(point.y - center.y, point.x - center.x);
  const along = { x: Math.cos(heading), y: Math.sin(heading) };
  const halfWidth = (size * NEEDLE_WIDTH) / 2;
  const eye = { x: point.x - along.x * size * NEEDLE_LENGTH, y: point.y - along.y * size * NEEDLE_LENGTH };

  ctx.beginPath();
  ctx.moveTo(center.x, center.y);
  ctx.lineTo(eye.x, eye.y);
  ctx.strokeStyle = thread;
  ctx.lineWidth = Math.max(1, size * 0.045);
  ctx.lineCap = "round";
  ctx.stroke();
  painter.circle(center, size * 0.08);
  ctx.fillStyle = thread;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(point.x, point.y);
  ctx.lineTo(eye.x - along.y * halfWidth, eye.y + along.x * halfWidth);
  ctx.arc(eye.x, eye.y, halfWidth, heading + Math.PI / 2, heading + (Math.PI * 3) / 2);
  ctx.closePath();
  ctx.fillStyle = COLOR.needle;
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(
    eye.x + along.x * halfWidth * 1.2,
    eye.y + along.y * halfWidth * 1.2,
    halfWidth * 1.1,
    halfWidth * 0.35,
    heading,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = COLOR.background;
  ctx.fill();
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
    ctx.globalAlpha = 1 - age;
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
    painter.text("아무 키나 누르면 시작", { x, y: height * 0.2 }, { size: 28, weight: 800 });
    painter.text("화면을 눌러도 시작합니다 · Esc 곡 목록", { x, y: height * 0.2 + 36 }, { size: 14, color: COLOR.dim });
  } else if (songTime < 0) {
    painter.text(String(Math.ceil(-songTime)), { x, y: height * 0.2 }, { size: 64, weight: 800 });
  }
  if (play.resolvedCount === 0) {
    painter.text("바늘 끝이 흰 고리 한가운데에 닿는 순간 아무 키나 누르세요", { x, y: height * 0.84 }, { size: 16, color: COLOR.dim });
  }

  if (feedback === null) return;
  const age = songTime - feedback.at;
  if (age < 0 || age > FEEDBACK_FADE_S) return;
  ctx.save();
  ctx.globalAlpha *= 1 - age / FEEDBACK_FADE_S;
  painter.text(feedback.judgement.toUpperCase(), { x, y: height * 0.76 }, {
    size: 32,
    weight: 800,
    color: JUDGEMENT_COLOR[feedback.judgement],
  });
  if (feedback.judgement !== "miss" && Math.abs(feedback.offsetMs) >= EARLY_LATE_MIN_MS) {
    const label = feedback.offsetMs < 0 ? "빠름" : "느림";
    painter.text(`${label} ${Math.abs(feedback.offsetMs).toFixed(0)}ms`, { x, y: height * 0.76 + 30 }, {
      size: 14,
      color: COLOR.dim,
    });
  }
  ctx.restore();
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
  drawNeedle(painter, frame, view);
  drawHud(painter, frame, size);
  ctx.restore();
}
