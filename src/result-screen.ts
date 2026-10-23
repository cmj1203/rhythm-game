import { COLOR, JUDGEMENT_COLOR, type Painter, type Size } from "./canvas";
import { clothRect, drawCloth, drawStitches, fitView, isWideLayout, toScreen, type View } from "./embroidery";
import { JUDGEMENTS, type PlayState } from "./judge";
import type { Path } from "./path";
import { revealedPath, revealStage } from "./picture-reveal";
import type { RoadPicture } from "./rhythm-road";

/** `fade` grows from 0 to 1 as the numbers appear beside the finished embroidery. */
export type ResultFrame = {
  readonly kind: "result";
  readonly play: PlayState;
  readonly path: Path;
  readonly pictureName: string;
  readonly title: string;
  readonly difficulty: string;
  /** The song's best mark on this device, this play counted, whether this play set it, and the mark before it. */
  readonly bestGrade: number;
  readonly isNewBest: boolean;
  readonly previousBestGrade: number | null;
  readonly fade: number;
  /** Time since the result screen came up, for a rhythm road moving into its picture. */
  readonly elapsedMs: number;
};

/** The picture's own lines (in its units, half as wide as the file draws them), over the road that made it. */
const PICTURE_LINE_WIDTH = 0.45;
const PICTURE_LINE_ALPHA = 0.8;

const STATS_HEIGHT = 330;
/** Room under the numbers for the 다시 하기 and 곡 선택 buttons main.ts lays over this screen (`.start` is about 50px tall). */
const BUTTONS_GAP = 20;
const BUTTONS_HEIGHT = 52;

type StatsLayout = { readonly x: number; readonly top: number; readonly scale: number };

/** Where the numbers go: beside the embroidery when wide, under it when narrow, leaving room for the buttons below. */
function statsLayout(size: Size): StatsLayout {
  const rect = clothRect(size);
  const room = BUTTONS_GAP + BUTTONS_HEIGHT;
  if (isWideLayout(size)) {
    const scale = Math.min(1, (size.height * 0.9 - room) / STATS_HEIGHT);
    return { x: (rect.x + rect.width + size.width) / 2, top: (size.height - STATS_HEIGHT * scale - room) / 2, scale };
  }
  const top = rect.y + rect.height + 28;
  return { x: size.width / 2, top, scale: Math.min(1, (size.height - top - 16 - room) / STATS_HEIGHT) };
}

/** The point the buttons are centred on, at their top edge: just under the numbers. */
export function resultButtonsAt(size: Size): { readonly x: number; readonly y: number } {
  const { x, top, scale } = statsLayout(size);
  return { x, y: top + STATS_HEIGHT * scale + BUTTONS_GAP };
}

function drawStats(painter: Painter, frame: ResultFrame, x: number, top: number, scale: number): void {
  const { play } = frame;
  const at = (offset: number): { x: number; y: number } => ({ x, y: top + offset * scale });
  const heading = frame.pictureName === ""
    ? `${frame.title}  ·  ${frame.difficulty}`
    : `${frame.title}  ·  ${frame.difficulty}  ·  ${frame.pictureName}`;
  painter.text(heading, at(0), { size: 16 * scale, color: COLOR.dim });
  painter.text(`${play.grade}점`, at(80), { size: 104 * scale, weight: 800 });
  painter.text(play.score.toLocaleString("en-US"), at(160), { size: 34 * scale, weight: 700 });
  const lineY = top + 198 * scale;
  painter.text(`최대 콤보 ${play.maxCombo}`, { x: x - 14 * scale, y: lineY }, {
    size: 15 * scale,
    color: COLOR.dim,
    align: "right",
  });
  painter.text("·", { x, y: lineY }, { size: 15 * scale, color: COLOR.dim });
  const bestText =
    frame.isNewBest && frame.previousBestGrade !== null && play.grade > frame.previousBestGrade
      ? `최고 기록 +${play.grade - frame.previousBestGrade}점`
      : frame.isNewBest
        ? "최고 기록"
        : `최고 ${frame.bestGrade}점`;
  painter.text(bestText, { x: x + 14 * scale, y: lineY }, {
    size: 15 * scale,
    color: frame.isNewBest ? JUDGEMENT_COLOR.perfect : COLOR.dim,
    weight: frame.isNewBest ? 700 : 400,
    align: "left",
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
  if (play.counts.miss === 0) {
    painter.text("노 미스", { x: x + 52 * scale, y: top + 314 * scale }, {
      size: 13 * scale,
      weight: 700,
      color: JUDGEMENT_COLOR.perfect,
      align: "left",
    });
  }
}

function drawPictureLines(painter: Painter, picture: RoadPicture, view: View, alpha: number): void {
  const { ctx } = painter;
  ctx.save();
  ctx.globalAlpha = alpha * PICTURE_LINE_ALPHA;
  ctx.strokeStyle = COLOR.thread;
  ctx.lineWidth = Math.max(1.5, PICTURE_LINE_WIDTH * view.tileSize);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const { points } of picture.strokes) {
    ctx.beginPath();
    for (const [i, point] of points.entries()) {
      const { x, y } = toScreen(view, point);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function drawResult(painter: Painter, frame: ResultFrame, size: Size): void {
  const rect = clothRect(size);
  const picture = frame.path.rhythm?.picture;
  const stage = revealStage(frame.elapsedMs);
  const traced = picture?.traced === true;
  const path = picture === undefined || stage.move === 0
    ? frame.path
    : revealedPath(frame.path, picture, stage.move, traced ? stage.lines : 0);
  const view = fitView(path, rect);
  drawCloth(painter, view, size);
  drawStitches(painter, path, frame.play.history, view, 1, 1);
  if (picture !== undefined && !traced && stage.lines > 0) drawPictureLines(painter, picture, view, stage.lines);

  const { ctx } = painter;
  ctx.save();
  ctx.globalAlpha = frame.fade;
  const { x, top, scale } = statsLayout(size);
  drawStats(painter, frame, x, top, scale);
  ctx.restore();
}
