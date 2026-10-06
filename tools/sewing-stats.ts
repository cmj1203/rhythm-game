import type { Path, Sweep } from "../src/path";

/**
 * What the song checks look at on a sewing, the road a chart's notes draw a picture along.
 * - `p90Pct`: how far the crayon's speed strays from its usual speed in the normal stretches, the 90th percentile, in %.
 * - `speedOffPct`: the share of sweeps whose speed is not the one their pace asks for, in %.
 * - `gentleRun`: the longest run of bends gentler than `GENTLE_DEGREES`, in tiles.
 * - `emptyEnd`: how many notes at the end are left with nothing to draw.
 * - `drift`: how far the rhythm pushed the road off the picture on average; lower means the picture follows the rhythm.
 */
export type SewingStats = {
  readonly p90Pct: number;
  readonly speedOffPct: number;
  readonly gentleRun: number;
  readonly emptyEnd: number;
  readonly drift: number;
};

const GENTLE_DEGREES = 30;
const SPEED_SLACK = 0.03;

const speedOf = (sweep: Sweep): number => Math.abs(sweep.angle) / (sweep.endTime - sweep.startTime);
const oneDecimal = (value: number): number => Math.round(value * 10) / 10;

export function sewingStats(path: Path): SewingStats {
  const inner = path.sweeps.slice(1, -1);
  const normals = inner
    .filter((sweep) => sweep.pace === "normal")
    .map(speedOf)
    .sort((a, b) => a - b);
  const usual = normals[normals.length >> 1] ?? 1;
  const strays: number[] = [];
  let off = 0;
  for (const sweep of inner) {
    const ratio = speedOf(sweep) / usual;
    const wanted = sweep.pace === "fast" ? 2 : sweep.pace === "normal" ? 1 : 2 ** Math.round(Math.log2(ratio));
    const stray = Math.abs(ratio / wanted - 1);
    if (sweep.pace === "normal") strays.push(stray);
    if ((sweep.pace === "slow" && wanted >= 1) || stray > SPEED_SLACK) off++;
  }
  strays.sort((a, b) => a - b);

  const { tiles, anchors } = path;
  const headings = tiles.slice(1).map((tile, index) => {
    const before = tiles[index] ?? tile;
    return Math.atan2(tile.y - before.y, tile.x - before.x);
  });
  let run = 0;
  let longest = 0;
  for (let index = 1; index < headings.length; index++) {
    let turn = ((Math.abs((headings[index] ?? 0) - (headings[index - 1] ?? 0)) * 180) / Math.PI) % 360;
    if (turn > 180) turn = 360 - turn;
    run = turn < GENTLE_DEGREES ? run + 1 : 0;
    longest = Math.max(longest, run);
  }

  let emptyEnd = 0;
  for (let index = anchors.length - 1; index > 0 && anchors[index] === anchors[index - 1]; index--) emptyEnd++;

  return {
    p90Pct: oneDecimal(100 * (strays[Math.floor(strays.length * 0.9)] ?? 0)),
    speedOffPct: oneDecimal((100 * off) / Math.max(1, inner.length)),
    gentleRun: longest + 1,
    emptyEnd,
    drift: path.drift,
  };
}
