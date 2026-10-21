import { assertNever } from "./assert";
import { COLOR, mixColors, type Painter, type Point } from "./canvas";
import type { TempoMark } from "./tempo";

/** Double chevrons outside the pace ring: forward/pink for faster, backward/sky for slower. */
export function drawTempoMark(painter: Painter, mark: TempoMark, road: { readonly at: Point; readonly angle: number; readonly size: number }): void {
  const { ctx } = painter;
  ctx.save();
  let direction: number;
  switch (mark) {
    case "faster": direction = 1; ctx.strokeStyle = mixColors(COLOR.background, COLOR.pink, 0.6); break;
    case "slower": direction = -1; ctx.strokeStyle = mixColors(COLOR.background, COLOR.sky, 0.6); break;
    default: return assertNever(mark);
  }
  ctx.translate(road.at.x, road.at.y);
  ctx.rotate(road.angle);
  // Beside the road, out of the crayon's way.
  ctx.translate(0, -road.size * 0.45);
  ctx.lineWidth = Math.max(1.5, road.size * 0.035);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (const along of [0.34, 0.49]) {
    ctx.moveTo(direction * along * road.size, -0.12 * road.size);
    ctx.lineTo(direction * (along + 0.13) * road.size, 0);
    ctx.lineTo(direction * along * road.size, 0.12 * road.size);
  }
  ctx.stroke();
  ctx.restore();
}
