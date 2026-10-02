import { COLOR, type Painter } from "./canvas";
import { LANE_COUNT, LANES } from "./lanes";
import { along, type Layout, laneColor } from "./stage-layout";

export function drawButtons(painter: Painter, heldLanes: ReadonlySet<number>, layout: Layout): void {
  const { ctx } = painter;
  const { origin, buttonRadius } = layout;

  ctx.strokeStyle = COLOR.separator;
  ctx.lineWidth = 1;
  for (let lane = 0; lane < LANE_COUNT; lane++) {
    const target = along(lane, 1, layout);
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
  }

  painter.circle(origin, buttonRadius * 0.3);
  ctx.fillStyle = COLOR.surface;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.stroke();

  for (let lane = 0; lane < LANE_COUNT; lane++) {
    painter.circle(along(lane, 1, layout), buttonRadius);
    ctx.fillStyle = COLOR.surface;
    ctx.fill();
    if (heldLanes.has(lane)) {
      ctx.fillStyle = `${laneColor(lane)}66`;
      ctx.fill();
    }
    ctx.strokeStyle = laneColor(lane);
    ctx.lineWidth = buttonRadius * 0.1;
    ctx.stroke();
  }
}

/** Drawn after the notes so a hold band resting on a button never hides its key. */
export function drawButtonLabels(painter: Painter, heldLanes: ReadonlySet<number>, layout: Layout): void {
  for (let lane = 0; lane < LANE_COUNT; lane++) {
    const label = LANES[lane]?.label ?? "";
    painter.text(label, along(lane, 1, layout), {
      size: layout.buttonRadius * (label.length > 1 ? 0.34 : 0.5),
      weight: 700,
      color: heldLanes.has(lane) ? COLOR.text : COLOR.dim,
    });
  }
}
