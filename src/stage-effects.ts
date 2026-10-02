import { COLOR, JUDGEMENT_COLOR, type Painter } from "./canvas";
import type { JudgeEvent, PlayState } from "./judge";
import { along, type Layout } from "./stage-layout";

export type Feedback = JudgeEvent & { readonly at: number };

export const BURST_S = 0.45;
const FEEDBACK_FADE_S = 0.5;
const EARLY_LATE_MIN_MS = 15;
const SPARKLES_BY_JUDGEMENT = { perfect: 8, great: 6, good: 4, miss: 0 } as const;

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** The hit effect: a ring and sparkles spreading from the button that was pressed. */
export function drawBursts(painter: Painter, bursts: readonly Feedback[], songTime: number, layout: Layout): void {
  const { ctx } = painter;
  for (const burst of bursts) {
    if (burst.lane === null) continue;
    const age = (songTime - burst.at) / BURST_S;
    if (age < 0 || age > 1) continue;

    const center = along(burst.lane, 1, layout);
    const color = JUDGEMENT_COLOR[burst.judgement];
    const radius = layout.buttonRadius;
    ctx.save();
    ctx.globalAlpha = 1 - age;
    painter.circle(center, radius * (1 + 0.7 * easeOut(age)));
    ctx.strokeStyle = color;
    ctx.lineWidth = radius * 0.12 * (1 - age);
    ctx.stroke();

    const count = SPARKLES_BY_JUDGEMENT[burst.judgement];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + burst.lane * 0.7;
      const distance = radius * (1.05 + 1.5 * easeOut(age));
      painter.sparkle(
        { x: center.x + Math.cos(angle) * distance, y: center.y + Math.sin(angle) * distance },
        radius * 0.24 * (1 - age * 0.7),
      );
      ctx.fillStyle = i % 2 === 0 ? COLOR.text : color;
      ctx.fill();
    }
    ctx.restore();
  }
}

export function drawHud(painter: Painter, play: PlayState, progress: number, layout: Layout): void {
  const { ctx } = painter;
  ctx.fillStyle = COLOR.separator;
  ctx.fillRect(0, 0, layout.width, 4);
  ctx.fillStyle = COLOR.dim;
  ctx.fillRect(0, 0, layout.width * progress, 4);
  painter.text(play.score.toLocaleString("en-US"), { x: 24, y: 36 }, { size: 24, weight: 700, align: "left" });
}

export function drawFeedback(painter: Painter, play: PlayState, feedback: Feedback | null, layout: Layout, age: number) {
  const { ctx } = painter;
  const { origin, arcRadius } = layout;

  if (play.combo >= 2) {
    const y = origin.y + arcRadius * 0.36;
    painter.text(String(play.combo), { x: origin.x, y }, { size: 64, weight: 800 });
    painter.text("COMBO", { x: origin.x, y: y + 46 }, { size: 13, weight: 600, color: COLOR.dim });
  }

  if (feedback === null || age < 0 || age > FEEDBACK_FADE_S) return;
  const y = origin.y + arcRadius * 0.62;
  ctx.save();
  ctx.globalAlpha = 1 - age / FEEDBACK_FADE_S;
  painter.text(feedback.judgement.toUpperCase(), { x: origin.x, y }, {
    size: 32,
    weight: 800,
    color: JUDGEMENT_COLOR[feedback.judgement],
  });
  if (feedback.judgement !== "miss" && Math.abs(feedback.offsetMs) >= EARLY_LATE_MIN_MS) {
    const label = feedback.offsetMs < 0 ? "빠름" : "느림";
    painter.text(`${label} ${Math.abs(feedback.offsetMs).toFixed(0)}ms`, { x: origin.x, y: y + 30 }, {
      size: 14,
      color: COLOR.dim,
    });
  }
  ctx.restore();
}
