import { COLOR, JUDGEMENT_COLOR } from "./canvas";
import type { Path } from "./path";

/** Where the camera stands: `zoom` 1 is the usual distance, larger is closer; `tilt` turns the screen, in radians. */
export type Pose = { readonly zoom: number; readonly tilt: number };

/**
 * A few bars of the song that are sewn in one thread and watched from one camera pose, so the road does not
 * look the same from the first note to the last. The section begins with note `fromNote`, at `startTime`.
 */
export type Section = Pose & {
  readonly fromNote: number;
  readonly startTime: number;
  readonly thread: string;
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
const MIN_TILT = (3 * Math.PI) / 180;
const MAX_TILT = (8 * Math.PI) / 180;
const POSE_BLEND_S = 1.6;
const START_POSE: Pose = { zoom: 1, tilt: 0 };

/**
 * Cuts the chart into sections of a few bars. A section with more notes than usual is watched from closer and
 * with the screen turned further; the turn changes side every section, and the thread changes every other one.
 */
export function planSections(times: readonly number[], bpm: number, offset: number): Section[] {
  const span = (BEATS_PER_SECTION * 60) / bpm;
  const starts: { readonly fromNote: number; readonly startTime: number }[] = [];
  let lastSlot = Number.NEGATIVE_INFINITY;
  for (const [note, time] of times.entries()) {
    const slot = Math.floor((time - offset) / span);
    if (slot <= lastSlot) continue;
    lastSlot = slot;
    starts.push({ fromNote: note, startTime: time });
  }

  const counts = starts.map(({ fromNote }, k) => (starts[k + 1]?.fromNote ?? times.length) - fromNote);
  const usual = [...counts].sort((a, b) => a - b)[counts.length >> 1] ?? 1;
  return starts.map((start, k) => {
    // -1 for a section with no notes at all, 0 for a usual one, 1 for one twice as busy or more.
    const lift = Math.min(1, Math.max(-1, (counts[k] ?? usual) / usual - 1));
    const thread = THREADS[Math.floor(k / SECTIONS_PER_THREAD) % THREADS.length] ?? COLOR.thread;
    if (k === 0) return { ...start, ...START_POSE, thread };
    const side = k % 2 === 0 ? 1 : -1;
    return {
      ...start,
      thread,
      zoom: (ZOOM_STEPS[k % ZOOM_STEPS.length] ?? 1) * (1 + ZOOM_PER_LIFT * lift),
      tilt: side * (MIN_TILT + ((MAX_TILT - MIN_TILT) * (lift + 1)) / 2),
    };
  });
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** The camera pose at `songTime`. It glides from one section's pose to the next around the section's first note. */
export function poseAt(sections: readonly Section[], songTime: number): Pose {
  let current = 0;
  while ((sections[current + 1]?.startTime ?? Number.POSITIVE_INFINITY) - POSE_BLEND_S / 2 <= songTime) current++;
  const to = sections[current];
  if (to === undefined) return START_POSE;
  const from = sections[current - 1] ?? to;
  const started = to.startTime - POSE_BLEND_S / 2;
  const t = easeInOut(Math.min(1, Math.max(0, (songTime - started) / POSE_BLEND_S)));
  return { zoom: from.zoom + (to.zoom - from.zoom) * t, tilt: from.tilt + (to.tilt - from.tilt) * t };
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
