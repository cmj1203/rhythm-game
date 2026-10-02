import { COLOR, JUDGEMENT_COLOR, type Painter, type Size } from "./canvas";
import { JUDGEMENTS, type PlayState } from "./judge";

export type ResultFrame = {
  readonly kind: "result";
  readonly play: PlayState;
  readonly title: string;
  readonly difficulty: string;
};

export function drawResult(painter: Painter, frame: ResultFrame, { width, height }: Size): void {
  const x = width / 2;
  const { play } = frame;
  painter.text(`${frame.title}  ·  ${frame.difficulty}`, { x, y: height * 0.16 }, { size: 16, color: COLOR.dim });
  painter.text(play.rank, { x, y: height * 0.3 }, { size: 120, weight: 800 });
  painter.text(play.score.toLocaleString("en-US"), { x, y: height * 0.46 }, { size: 36, weight: 700 });
  painter.text(
    `정확도 ${(play.accuracy * 100).toFixed(1)}%   최대 콤보 ${play.maxCombo}`,
    { x, y: height * 0.53 },
    { size: 16, color: COLOR.dim },
  );

  const rowsY = height * 0.62;
  JUDGEMENTS.forEach((judgement, i) => {
    const y = rowsY + i * 30;
    painter.text(
      judgement.toUpperCase(),
      { x: x - 20, y },
      { size: 16, weight: 700, align: "right", color: JUDGEMENT_COLOR[judgement] },
    );
    painter.text(String(play.counts[judgement]), { x: x + 20, y }, { size: 16, weight: 600, align: "left" });
  });

  if (play.hasHits) {
    const mean = play.meanOffsetMs;
    const direction = mean < 0 ? "빠르게" : "느리게";
    painter.text(
      `평균 ${Math.abs(mean).toFixed(1)}ms ${direction} 쳤습니다`,
      { x, y: rowsY + 136 },
      { size: 14, color: COLOR.dim },
    );
  }
  painter.text("Enter  곡 목록으로", { x, y: rowsY + 172 }, { size: 15, color: COLOR.dim });
}
