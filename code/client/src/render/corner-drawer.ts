import type { ControllerItem, CornerItem, Vec2 } from "../core/types.ts";
import { CELL, CORNER_COLOR, CORNER_SPRING_COLOR } from "./colors.ts";
import { drawControllerAt } from "./mechanics-drawer.ts";

const INSET = 5;
/** 反射面镜面线宽（加粗以区分单面反射） */
const REFLECTION_LINE_W = 8;
const SPRING_LENGTH = 13;
const SPRING_COILS = 3.5;
const SPRING_AMPLITUDE = 2.8;
const SPRING_LINE_W = 2.5;

export interface CornerDrawOptions {
  boundController?: ControllerItem;
  controllerFlash?: boolean;
}

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

function nearPoint(a: Vec2, b: Vec2, eps = 0.5): boolean {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) <= eps;
}

function cornerCellDiagonalCorners(
  direction1: Vec2,
  direction2: Vec2,
  cellSize: number,
): [Vec2, Vec2] {
  const { x1, y1, x2, y2 } = cornerDiagonalInCell(direction1, direction2, cellSize, 0);
  const slope = (y2 - y1) / (x2 - x1);
  if (slope > 0) {
    return [
      [0, 0],
      [cellSize, cellSize],
    ];
  }
  return [
    [cellSize, 0],
    [0, cellSize],
  ];
}

/** 非反射面一侧三角（仅用于控制器锚点） */
export function cornerNonReflectiveTriangle(
  direction1: Vec2,
  direction2: Vec2,
  cellSize = CELL,
): [Vec2, Vec2, Vec2] {
  const [d1, d2] = cornerCellDiagonalCorners(direction1, direction2, cellSize);
  const corners: Vec2[] = [
    [0, 0],
    [cellSize, 0],
    [cellSize, cellSize],
    [0, cellSize],
  ];
  const offDiag = corners.filter((c) => !nearPoint(c, d1) && !nearPoint(c, d2));
  const triA: [Vec2, Vec2, Vec2] = [d1, d2, offDiag[0]!];
  const triB: [Vec2, Vec2, Vec2] = [d1, d2, offDiag[1]!];

  const { nx, ny } = cornerReflectionSideNormal(direction1, direction2);
  const cx = cellSize / 2;
  const cy = cellSize / 2;
  const centroid = (tri: [Vec2, Vec2, Vec2]): Vec2 => [
    (tri[0][0] + tri[1][0] + tri[2][0]) / 3,
    (tri[0][1] + tri[1][1] + tri[2][1]) / 3,
  ];
  const dotA =
    (centroid(triA)[0] - cx) * nx + (centroid(triA)[1] - cy) * ny;
  return dotA > 0 ? triB : triA;
}

export function cornerNonReflectiveTriangleCentroid(
  direction1: Vec2,
  direction2: Vec2,
  cellSize = CELL,
): Vec2 {
  const tri = cornerNonReflectiveTriangle(direction1, direction2, cellSize);
  return [
    (tri[0][0] + tri[1][0] + tri[2][0]) / 3,
    (tri[0][1] + tri[1][1] + tri[2][1]) / 3,
  ];
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
  options: CornerDrawOptions = {},
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

  if (options.boundController) {
    const [lx, ly] = cornerNonReflectiveTriangleCentroid(
      corner.direction1,
      corner.direction2,
    );
    drawControllerAt(
      ctx,
      gx + lx,
      gy + ly,
      options.boundController.groupID,
      options.controllerFlash ?? false,
      { compact: true },
    );
  }
}
