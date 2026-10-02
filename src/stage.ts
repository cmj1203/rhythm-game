import type { Painter, Size } from "./canvas";
import type { PlayState } from "./judge";
import { drawButtonLabels, drawButtons } from "./stage-buttons";
import { drawBursts, drawFeedback, drawHud, type Feedback } from "./stage-effects";
import { layoutFor } from "./stage-layout";
import { drawNotes } from "./stage-notes";

export type { Feedback } from "./stage-effects";

export type PlayingFrame = {
  readonly kind: "playing";
  readonly play: PlayState;
  readonly songTime: number;
  readonly duration: number;
  readonly heldLanes: ReadonlySet<number>;
  readonly feedback: Feedback | null;
  readonly bursts: readonly Feedback[];
};

export function drawPlaying(painter: Painter, frame: PlayingFrame, size: Size): void {
  const layout = layoutFor(size);
  const { feedback, songTime } = frame;
  drawButtons(painter, frame.heldLanes, layout);
  drawNotes(painter, frame.play.notes, songTime, layout);
  drawButtonLabels(painter, frame.heldLanes, layout);
  drawBursts(painter, frame.bursts, songTime, layout);
  drawHud(painter, frame.play, Math.min(1, Math.max(0, songTime / frame.duration)), layout);
  drawFeedback(painter, frame.play, feedback, layout, feedback === null ? 0 : songTime - feedback.at);
}
