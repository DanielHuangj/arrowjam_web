import type { Vec2 } from "@arrowjaw/shared";
import { CELL, STEP } from "@arrowjaw/client/render/colors.ts";

const RAY_CELLS = 1.5;
const ARROW_SIZE = 11;

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dx: number,
  dy: number,
  size: number,
): void {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const wing = size * 0.55;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - ux * size + px * wing, y - uy * size + py * wing);
  ctx.lineTo(x - ux * size - px * wing, y - uy * size - py * wing);
  ctx.closePath();
  ctx.fill();
}

function drawRay(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  dir: Vec2,
  color: string,
): void {
  const len = RAY_CELLS * STEP;
  const ex = cx + dir[0] * len;
  const ey = cy + dir[1] * len;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  drawArrowhead(ctx, ex, ey, dir[0], dir[1], ARROW_SIZE);
}

/** 角块出射示意：direction1 / direction2 两条实线箭头 */
export function drawCornerRefractionPreview(
  ctx: CanvasRenderingContext2D,
  cell: Vec2,
  d1: Vec2,
  d2: Vec2,
): void {
  const [gx, gy] = cell;
  const cx = gx * STEP + CELL / 2;
  const cy = gy * STEP + CELL / 2;

  drawRay(ctx, cx, cy, d1, "#4dabf7");
  drawRay(ctx, cx, cy, d2, "#e599f7");
}
