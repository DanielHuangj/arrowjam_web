import type { CornerItem, Vec2 } from "../core/types.ts";
import { CELL, CORNER_COLOR, CORNER_SPRING_COLOR } from "./colors.ts";

const INSET = 5;
/** 反射面镜面线宽（加粗以区分单面反射） */
const REFLECTION_LINE_W = 8;
const SPRING_LENGTH = 13;
const SPRING_COILS = 3.5;
const SPRING_AMPLITUDE = 2.8;
const SPRING_LINE_W = 2.5;

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

/** 指向可反射一侧（合法入射侧）的单位法线，与镜面垂直 */
export function cornerReflectionSideNormal(
  direction1: Vec2,
  direction2: Vec2,
): { nx: number; ny: number } {
  const { x1, y1, x2, y2 } = cornerDiagonalInCell(direction1, direction2);
  let tx = x2 - x1;
  let ty = y2 - y1;
  const tLen = Math.hypot(tx, ty);
  if (tLen < 1e-6) return { nx: 0, ny: -1 };
  tx /= tLen;
  ty /= tLen;

  let nx = -ty;
  let ny = tx;

  const in1x = -direction1[0];
  const in1y = -direction1[1];
  const in2x = -direction2[0];
  const in2y = -direction2[1];
  const s1 = nx * in1x + ny * in1y;
  const s2 = nx * in2x + ny * in2y;
  if (s1 > 0 && s2 > 0) {
    nx = -nx;
    ny = -ny;
  }
  return { nx, ny };
}

function drawSpringOnReflectionSide(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  nx: number,
  ny: number,
  color: string,
): void {
  const tx = -ny;
  const ty = nx;
  const steps = Math.round(SPRING_COILS * 10);

  ctx.strokeStyle = color;
  ctx.lineWidth = SPRING_LINE_W;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const along = t * SPRING_LENGTH;
    const wiggle = Math.sin(t * Math.PI * SPRING_COILS * 2) * SPRING_AMPLITUDE;
    const x = originX + nx * along + tx * wiggle;
    const y = originY + ny * along + ty * wiggle;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
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
  const cx = gx + CELL / 2;
  const cy = gy + CELL / 2;
  const { nx, ny } = cornerReflectionSideNormal(
    corner.direction1,
    corner.direction2,
  );

  ctx.strokeStyle = CORNER_COLOR;
  ctx.lineWidth = REFLECTION_LINE_W;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(gx + x1, gy + y1);
  ctx.lineTo(gx + x2, gy + y2);
  ctx.stroke();

  drawSpringOnReflectionSide(ctx, cx, cy, nx, ny, CORNER_SPRING_COLOR);
}
