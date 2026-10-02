import { COLOR, type Point, type Size } from "./canvas";
import { LANE_COUNT } from "./lanes";

export const APPROACH_S = 1.3;
const ORIGIN_Y_RATIO = 0.2;
const ARC_MARGIN = 104;
const BUTTON_RADIUS_RATIO = 0.11;
const MIN_BUTTON_RADIUS = 22;
const MAX_BUTTON_RADIUS = 60;
const NOTE_START_SCALE = 0.12;
const CENTER_LANE = (LANE_COUNT - 1) / 2;

/** Buttons sit on a half circle around `origin`, the point every note flies out of. */
export type Layout = {
  readonly width: number;
  readonly origin: Point;
  readonly arcRadius: number;
  readonly buttonRadius: number;
};

export function layoutFor({ width, height }: Size): Layout {
  const origin = { x: width / 2, y: height * ORIGIN_Y_RATIO };
  const arcRadius = Math.max(120, Math.min(width / 2 - ARC_MARGIN, height - origin.y - ARC_MARGIN));
  const buttonRadius = Math.min(MAX_BUTTON_RADIUS, Math.max(MIN_BUTTON_RADIUS, arcRadius * BUTTON_RADIUS_RATIO));
  return { width, origin, arcRadius, buttonRadius };
}

export function laneColor(lane: number): string {
  if (lane === CENTER_LANE) return COLOR.violet;
  return lane % 2 === 0 ? COLOR.sky : COLOR.pink;
}

/** 0 when a note leaves the origin, 1 when it reaches its button. */
export function progressAt(noteTime: number, songTime: number): number {
  return 1 - (noteTime - songTime) / APPROACH_S;
}

/** Position on the way from the origin (progress 0) to a lane's button (progress 1). */
export function along(lane: number, progress: number, { origin, arcRadius }: Layout): Point {
  const angle = Math.PI * (1 - lane / (LANE_COUNT - 1));
  return {
    x: origin.x + arcRadius * progress * Math.cos(angle),
    y: origin.y + arcRadius * progress * Math.sin(angle),
  };
}

export function noteRadius(progress: number, layout: Layout): number {
  const clamped = Math.min(1, Math.max(0, progress));
  return layout.buttonRadius * (NOTE_START_SCALE + (1 - NOTE_START_SCALE) * clamped);
}
