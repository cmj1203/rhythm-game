import { RHYTHM_CLEARANCE, type RhythmPath } from "../src/rhythm-road";
import { beatsBetween } from "../src/tempo";

/** Rhythm roads are checked against local beats, not picture coverage or straight-run limits. */
export function roadStats(path: RhythmPath): {
  readonly pink: number; readonly sky: number; readonly violet: number; readonly tempoMarks: number;
  readonly repeatedNotes: number; readonly speedOff: number; readonly illegalTwirl: number; readonly guideOff: number;
} {
  let speedOff = 0;
  let illegalTwirl = 0;
  let guideOff = 0;
  for (const [i, sweep] of path.sweeps.slice(1, -1).entries()) {
    const beats = beatsBetween(path.rhythm.turns, sweep.startTime, sweep.endTime);
    let divisor = 1;
    while (beats / divisor > 2.01) divisor *= 2;
    const expected = Math.PI * beats / divisor;
    if (Math.abs(Math.abs(sweep.angle) / expected - 1) > 0.003) speedOff++;
    if (!sweep.isTwirl) continue;
    const pivot = path.tiles[i + 1];
    const next = path.tiles[i + 2];
    if (pivot === undefined || next === undefined) continue;
    const recent = path.tiles.slice(Math.max(0, i + 2 - RHYTHM_CLEARANCE.lookback), i + 1)
      .filter((tile) => pivot.time - tile.time <= RHYTHM_CLEARANCE.maxAgeSeconds);
    const heading = sweep.startAngle - sweep.angle;
    const forward = { x: pivot.x + Math.cos(heading), y: pivot.y + Math.sin(heading) };
    const crowded = (x: number, y: number): boolean =>
      recent.some((tile) => Math.hypot(tile.x - x, tile.y - y) < RHYTHM_CLEARANCE.distance);
    if (!crowded(forward.x, forward.y) || crowded(next.x, next.y)) illegalTwirl++;
  }
  for (const [i, tile] of path.tiles.entries()) {
    const point = path.guide.points[path.anchors[i] ?? -1];
    if (point === undefined || Math.hypot(point.x - tile.x, point.y - tile.y) > 1e-8) guideOff++;
  }
  return {
    pink: path.sweeps.filter(({ pace }) => pace === "fast").length,
    sky: path.sweeps.filter(({ pace }) => pace === "slow").length,
    violet: path.sweeps.filter(({ isTwirl }) => isTwirl).length,
    tempoMarks: path.rhythm.marks.filter((mark) => mark !== null).length,
    repeatedNotes: path.rhythm.phrases.reduce((count, phrase) => count + phrase.count, 0),
    speedOff, illegalTwirl, guideOff,
  };
}
