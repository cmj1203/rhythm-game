import { COLOR, type Painter } from "./canvas";
import type { PlayNote } from "./judge";
import { along, type Layout, laneColor, noteRadius, progressAt } from "./stage-layout";

const HOLD_BAND_RATIO = 0.62;

type HoldNote = PlayNote & { readonly end: number };

function drawHoldBand(painter: Painter, note: HoldNote, songTime: number, layout: Layout): void {
  const { ctx } = painter;
  const color = laneColor(note.lane);
  const headProgress = note.status === "holding" ? 1 : progressAt(note.t, songTime);
  const tailProgress = Math.min(1, Math.max(0, progressAt(note.end, songTime)));
  const head = along(note.lane, headProgress, layout);
  const tail = along(note.lane, tailProgress, layout);
  const headHalf = noteRadius(headProgress, layout) * HOLD_BAND_RATIO;
  const tailHalf = noteRadius(tailProgress, layout) * HOLD_BAND_RATIO;

  const target = along(note.lane, 1, layout);
  const length = Math.hypot(target.x - layout.origin.x, target.y - layout.origin.y);
  const normal = { x: -(target.y - layout.origin.y) / length, y: (target.x - layout.origin.x) / length };

  ctx.beginPath();
  ctx.moveTo(tail.x + normal.x * tailHalf, tail.y + normal.y * tailHalf);
  ctx.lineTo(head.x + normal.x * headHalf, head.y + normal.y * headHalf);
  ctx.lineTo(head.x - normal.x * headHalf, head.y - normal.y * headHalf);
  ctx.lineTo(tail.x - normal.x * tailHalf, tail.y - normal.y * tailHalf);
  ctx.closePath();
  ctx.fillStyle = `${color}${note.status === "holding" ? "aa" : "55"}`;
  ctx.fill();

  painter.circle(tail, tailHalf);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawRing(painter: Painter, lane: number, progress: number, layout: Layout): void {
  const { ctx } = painter;
  const radius = noteRadius(progress, layout);
  painter.circle(along(lane, progress, layout), radius * 0.89);
  ctx.fillStyle = `${laneColor(lane)}30`;
  ctx.fill();
  ctx.strokeStyle = laneColor(lane);
  ctx.lineWidth = radius * 0.22;
  ctx.stroke();
}

function drawChordLines(painter: Painter, visible: readonly PlayNote[], songTime: number, layout: Layout): void {
  const { ctx } = painter;
  const pendingByTime = new Map<number, PlayNote[]>();
  for (const note of visible) {
    if (note.status !== "pending") continue;
    const sameTime = pendingByTime.get(note.t);
    if (sameTime === undefined) pendingByTime.set(note.t, [note]);
    else sameTime.push(note);
  }

  for (const [time, [first, second]] of pendingByTime) {
    if (first === undefined || second === undefined) continue;
    const progress = progressAt(time, songTime);
    const from = along(first.lane, progress, layout);
    const to = along(second.lane, progress, layout);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = `${COLOR.text}b0`;
    ctx.lineWidth = noteRadius(progress, layout) * 0.2;
    ctx.stroke();
  }
}

export function drawNotes(painter: Painter, notes: readonly PlayNote[], songTime: number, layout: Layout): void {
  const visible: PlayNote[] = [];
  for (const note of notes) {
    if (progressAt(note.t, songTime) < 0) break;
    if (note.status === "pending" || note.status === "holding") visible.push(note);
  }

  drawChordLines(painter, visible, songTime, layout);
  // Later notes are smaller and farther away, so they are drawn first and end up underneath.
  for (const note of visible.reverse()) {
    const { end } = note;
    if (end !== null) drawHoldBand(painter, { ...note, end }, songTime, layout);
    const progress = note.status === "holding" ? 1 : progressAt(note.t, songTime);
    drawRing(painter, note.lane, progress, layout);
  }
}
