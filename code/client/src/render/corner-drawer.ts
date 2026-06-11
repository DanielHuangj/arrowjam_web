import type { CornerItem, Vec2 } from "../core/types.ts";
import { CELL, CORNER_COLOR } from "./colors.ts";

const INSET = 5;
const LINE_W = 5;

/**
 * Mirror line is perpendicular to the bisector of the two outgoing faces
 * (direction1 + direction2).
 */
export function cornerDiagonalInCell(
  direction1: Vec2,
  direction2: Vec2,
  cellSize = CELL,
  inset = INSET,
): { x1: number; y1: number; x2: number; y2: number } {
  const bx = direction1[0] + direction2[0];
  const by = direction1[1] + direction2[1];
  let px = -by;
  let py = bx;
  const len = Math.hypot(px, py);
  if (len < 1e-6) {
    return { x1: inset, y1: inset, x2: cellSize - inset, y2: cellSize - inset };
  }
  px /= len;
  py /= len;

  const cx = cellSize / 2;
  const cy = cellSize / 2;
  const half = cellSize / 2 - inset;
  return {
    x1: cx - px * half,
    y1: cy - py * half,
    x2: cx + px * half,
    y2: cy + py * half,
  };
}

export function drawCornerInCell(
  ctx: CanvasRenderingContext2D,
  cellX: number,
  cellY: number,
  corner: CornerItem,
  step: number,
): void {
  const gx = cellX * step;
  const gy = cellY * step;
  const { x1, y1, x2, y2 } = cornerDiagonalInCell(
    corner.direction1,
    corner.direction2,
  );

  ctx.strokeStyle = CORNER_COLOR;
  ctx.lineWidth = LINE_W;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(gx + x1, gy + y1);
  ctx.lineTo(gx + x2, gy + y2);
  ctx.stroke();
}
