import { assertNever } from "./assert";
import { LEAD_IN_S } from "./audio";
import { COLOR, JUDGEMENT_COLOR } from "./canvas";
import type { Path } from "./path";

/**
 * Where the camera stands: `zoom` 1 is the usual distance, larger is closer; `tilt` turns the screen, in radians;
 * `slide` shifts the road sideways, as a share of the screen's shorter side.
 */
export type Pose = { readonly zoom: number; readonly tilt: number; readonly slide: number };

/** How the camera moves from the start of a section to its end: see `poseIn`. */
type Move = "push" | "pull" | "roll" | "slide" | "sway";

/**
 * A few bars of the song that are sewn in one thread and watched in one camera move, so the road does not
 * look the same from the first note to the last. The section begins with note `fromNote`, at `startTime`, and
 * lasts until `endTime`. `zoom` and `tilt` are the pose its move is made around; a beat of it is `beatS` long.
 */
export type Section = {
  readonly fromNote: number;
  readonly startTime: number;
  readonly endTime: number;
  readonly beatS: number;
  readonly thread: string;
  readonly zoom: number;
  readonly tilt: number;
  readonly move: Move;
};

const THREADS = [
  COLOR.thread,
  COLOR.pink,
  COLOR.sky,
  JUDGEMENT_COLOR.perfect,
  COLOR.violet,
  JUDGEMENT_COLOR.great,
] as const;
const BEATS_PER_SECTION = 16;
const SECTIONS_PER_THREAD = 2;
/** Besides following how busy the music is, the camera steps closer and back from section to section. */
const ZOOM_STEPS = [1, 1.1, 0.93] as const;
const ZOOM_PER_LIFT = 0.12;
const MIN_TILT = (5 * Math.PI) / 180;
const MAX_TILT = (12 * Math.PI) / 180;
/** The moves that sections of usual business take in turn. A busier one sways instead; a quieter one pulls away. */
const MOVES = ["push", "sway", "slide", "pull", "roll"] as const satisfies readonly Move[];
const BUSY_FROM = 0.3;
const QUIET_BELOW = -0.3;
/** A push or a pull changes the distance by this share to either side of the section's own. */
const DOLLY = 0.15;
const SLIDE = 0.14;
const SWAY_BEATS = 8;
const POSE_BLEND_S = 1.6;
/** Before the song the camera stands this far back; it has come in this long before the song begins. */
const OPENING_ZOOM = 0.62;
const OPENING_OVER_S = 0.6;
const START_POSE: Pose = { zoom: 1, tilt: 0, slide: 0 };

/**
 * Cuts the chart into sections of a few bars. A section with more notes than usual is watched from closer and
 * with the screen turned further; the turn changes side every section, and the thread changes every other one.
 * Through each section the camera makes one move, so the picture on the screen is never still.
 */
export function planSections(times: readonly number[], bpm: number, offset: number): Section[] {
  const beatS = 60 / bpm;
  const span = BEATS_PER_SECTION * beatS;
  const starts: { readonly fromNote: number; readonly startTime: number }[] = [];
  let lastSlot = Number.NEGATIVE_INFINITY;
  for (const [note, time] of times.entries()) {
    const slot = Math.floor((time - offset) / span);
    if (slot <= lastSlot) continue;
    lastSlot = slot;
    starts.push({ fromNote: note, startTime: time });
  }

  const lastTime = times[times.length - 1] ?? 0;
  const counts = starts.map(({ fromNote }, k) => (starts[k + 1]?.fromNote ?? times.length) - fromNote);
  const usual = [...counts].sort((a, b) => a - b)[counts.length >> 1] ?? 1;
  return starts.map((start, k): Section => {
    // -1 for a section with no notes at all, 0 for a usual one, 1 for one twice as busy or more.
    const lift = Math.min(1, Math.max(-1, (counts[k] ?? usual) / usual - 1));
    const section = {
      ...start,
      endTime: starts[k + 1]?.startTime ?? lastTime,
      beatS,
      thread: THREADS[Math.floor(k / SECTIONS_PER_THREAD) % THREADS.length] ?? COLOR.thread,
    };
    if (k === 0) return { ...section, zoom: 1, tilt: 0, move: "push" };
    const side = k % 2 === 0 ? 1 : -1;
    const usualMove = MOVES[k % MOVES.length] ?? "push";
    return {
      ...section,
      zoom: (ZOOM_STEPS[k % ZOOM_STEPS.length] ?? 1) * (1 + ZOOM_PER_LIFT * lift),
      tilt: side * (MIN_TILT + ((MAX_TILT - MIN_TILT) * (lift + 1)) / 2),
      move: lift > BUSY_FROM ? "sway" : lift < QUIET_BELOW ? "pull" : usualMove,
    };
  });
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/**
 * Where the move of `section` alone has the camera at `songTime`. Before the section begins the camera waits
 * where the move starts, and after it ends, where the move stops.
 */
function poseIn(section: Section, songTime: number): Pose {
  const { zoom, tilt } = section;
  const length = section.endTime - section.startTime;
  const played = Math.min(length, Math.max(0, songTime - section.startTime));
  // -1 as the section begins, 1 as it ends.
  const along = length > 0 ? (2 * played) / length - 1 : 1;
  switch (section.move) {
    case "push":
      return { zoom: zoom * (1 + DOLLY * along), tilt, slide: 0 };
    case "pull":
      return { zoom: zoom * (1 - DOLLY * along), tilt, slide: 0 };
    case "roll":
      return { zoom, tilt: tilt * along, slide: 0 };
    case "slide":
      return { zoom, tilt, slide: Math.sign(tilt) * SLIDE * along };
    case "sway":
      return { zoom, tilt: tilt * Math.cos((2 * Math.PI * played) / (SWAY_BEATS * section.beatS)), slide: 0 };
    default:
      return assertNever(section.move);
  }
}

/** How much of its distance the camera has come in by `songTime`, during the lead-in before the song. */
function openingZoom(songTime: number): number {
  const come = Math.min(1, Math.max(0, (songTime + LEAD_IN_S) / (LEAD_IN_S - OPENING_OVER_S)));
  return OPENING_ZOOM + (1 - OPENING_ZOOM) * easeInOut(come);
}

/**
 * The camera pose at `songTime`: the move of the section being played, gliding over from the move of the
 * section before around the section's first note.
 */
export function poseAt(sections: readonly Section[], songTime: number): Pose {
  let current = 0;
  while ((sections[current + 1]?.startTime ?? Number.POSITIVE_INFINITY) - POSE_BLEND_S / 2 <= songTime) current++;
  const section = sections[current];
  if (section === undefined) return START_POSE;
  const from = poseIn(sections[current - 1] ?? section, songTime);
  const to = poseIn(section, songTime);
  const started = section.startTime - POSE_BLEND_S / 2;
  const t = easeInOut(Math.min(1, Math.max(0, (songTime - started) / POSE_BLEND_S)));
  return {
    zoom: (from.zoom + (to.zoom - from.zoom) * t) * openingZoom(songTime),
    tilt: from.tilt + (to.tilt - from.tilt) * t,
    slide: from.slide + (to.slide - from.slide) * t,
  };
}

/** The same road with each section's piece of the picture sewn in that section's thread. */
export function dyePath(path: Path, sections: readonly Section[]): Path {
  const colors = [...path.guide.colors];
  for (const [k, section] of sections.entries()) {
    const from = path.anchors[section.fromNote] ?? 0;
    const to = path.anchors[sections[k + 1]?.fromNote ?? path.anchors.length - 1] ?? path.guide.endIndex;
    for (let i = from; i <= to; i++) {
      if (colors[i] !== null && colors[i] !== undefined) colors[i] = section.thread;
    }
  }
  return { ...path, guide: { ...path.guide, colors } };
}
