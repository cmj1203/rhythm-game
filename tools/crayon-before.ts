import type { Point } from "../src/canvas";
import { orbiterAngle, type Path } from "../src/path";

/** Exact pre-change track.ts geometry, using perfect-note times for the reference. */
export function beforeEnds(path: Path, time: number): { readonly tip: Point; readonly flat: Point } {
  let index = 0;
  while ((path.tiles[index + 1]?.time ?? Infinity) <= time) index++;
  const pivot = path.tiles[index];
  const sweep = path.sweeps[index];
  if (pivot === undefined || sweep === undefined) throw new RangeError("missing reference sweep");
  const length = 0.56;
  const lead = length * 0.55;
  const reach = Math.hypot(1, lead);
  const lag = Math.atan(lead) + Math.acos((reach ** 2 + 1 - 0.27 ** 2) / (2 * reach));
  const spin = Math.sign(sweep.angle);
  const angle = orbiterAngle(sweep, time) - spin * lag;
  const heading = angle + spin * Math.PI / 2;
  const tip = {
    x: pivot.x + Math.cos(angle) + Math.cos(heading) * lead,
    y: pivot.y + Math.sin(angle) + Math.sin(heading) * lead,
  };
  return { tip, flat: { x: tip.x - length * Math.cos(heading), y: tip.y - length * Math.sin(heading) } };
}
