import { COLOR, JUDGEMENT_COLOR, type Painter, type Size } from "./canvas";
import { clothRect, drawCloth, drawStitches, fitView, isWideLayout } from "./embroidery";
import { JUDGEMENTS, type PlayState } from "./judge";
import type { Path } from "./path";

/** `fade` grows from 0 to 1 as the numbers appear beside the finished embroidery. */
export type ResultFrame = {
  readonly kind: "result";
  readonly play: PlayState;
  readonly path: Path;
  readonly pictureName: string;
  readonly title: string;
  readonly difficulty: string;
  readonly fade: number;
};

const STATS_HEIGHT = 390;

function drawStats(painter: Painter, frame: ResultFrame, x: number, top: number, scale: number): void {
  const { play } = frame;
  const at = (offset: number): { x: number; y: number } => ({ x, y: top + offset * scale });
  painter.text(`${frame.title}  ·  ${frame.difficulty}  ·  ${frame.pictureName}`, at(0), { size: 16 * scale, color: COLOR.dim });
  painter.text(`${play.grade}점`, at(80), { size: 104 * scale, weight: 800 });
  painter.text(play.score.toLocaleString("en-US"), at(160), { size: 34 * scale, weight: 700 });
  painter.text(`100점 만점   최대 콤보 ${play.maxCombo}`, at(198), {
    size: 15 * scale,
    color: COLOR.dim,
  });

  JUDGEMENTS.forEach((judgement, i) => {
    const y = top + (236 + i * 26) * scale;
    painter.text(judgement.toUpperCase(), { x: x - 20 * scale, y }, {
      size: 15 * scale,
      weight: 700,
      align: "right",
      color: JUDGEMENT_COLOR[judgement],
    });
    painter.text(String(play.counts[judgement]), { x: x + 20 * scale, y }, { size: 15 * scale, weight: 600, align: "left" });
  });

  if (play.hasHits) {
    const mean = play.meanOffsetMs;
    const direction = mean < 0 ? "빠르게" : "느리게";
    painter.text(`평균 ${Math.abs(mean).toFixed(1)}ms ${direction} 쳤습니다`, at(352), {
      size: 14 * scale,
      color: COLOR.dim,
    });
  }
  painter.text("Enter  곡 목록으로", at(STATS_HEIGHT - 6), { size: 15 * scale, color: COLOR.dim });
}

export function drawResult(painter: Painter, frame: ResultFrame, size: Size): void {
  const rect = clothRect(size);
  const view = fitView(frame.path, rect);
  drawCloth(painter, view, size);
  drawStitches(painter, frame.path, frame.play.history, view, 1, 1);

  const { ctx } = painter;
  ctx.save();
  ctx.globalAlpha = frame.fade;
  if (isWideLayout(size)) {
    const scale = Math.min(1, (size.height * 0.9) / STATS_HEIGHT);
    const x = (rect.x + rect.width + size.width) / 2;
    drawStats(painter, frame, x, (size.height - STATS_HEIGHT * scale) / 2, scale);
  } else {
    const top = rect.y + rect.height + 28;
    const scale = Math.min(1, (size.height - top - 16) / STATS_HEIGHT);
    drawStats(painter, frame, size.width / 2, top, scale);
  }
  ctx.restore();
}
