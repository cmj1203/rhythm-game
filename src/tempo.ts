/** A section starts at song seconds and keeps this BPM until the next section. */
type TempoSection = readonly [startSeconds: number, bpm: number];
export type TempoMap = readonly [TempoSection, ...TempoSection[]];
export type TempoMark = "faster" | "slower";

export function bpmAt(tempo: TempoMap, time: number): number {
  let bpm = tempo[0][1];
  for (const [start, next] of tempo) {
    if (start > time) break;
    bpm = next;
  }
  return bpm;
}

/**
 * `tempo` with each section's BPM times the scale in force then, starting a section wherever either map does: how fast
 * the crayon turns on a rhythm road whose chart sets a turn scale.
 */
export function scaledTempo(tempo: TempoMap, scale: TempoMap | undefined): TempoMap {
  if (scale === undefined) return tempo;
  const starts = [...new Set([...tempo, ...scale].map(([start]) => start))].sort((a, b) => a - b);
  const sections = starts.map((start): TempoSection => [start, bpmAt(tempo, start) * bpmAt(scale, start)]);
  const [first, ...rest] = sections;
  return [first ?? tempo[0], ...rest];
}

/** Integrates through section boundaries, including a rest spanning a tempo change. */
export function beatsBetween(tempo: TempoMap, from: number, to: number): number {
  if (to < from) return -beatsBetween(tempo, to, from);
  let cursor = from;
  let bpm = bpmAt(tempo, from);
  let beats = 0;
  for (const [start, next] of tempo) {
    if (start <= from) continue;
    if (start >= to) break;
    beats += ((start - cursor) * bpm) / 60;
    cursor = start;
    bpm = next;
  }
  return beats + ((to - cursor) * bpm) / 60;
}
