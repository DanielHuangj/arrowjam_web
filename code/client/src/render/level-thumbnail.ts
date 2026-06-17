import type { GameLevel } from "../core/types.ts";
import { CELL, GAP, STEP, THEME, ZONE_FILL, ZONE_STROKE, colorForId } from "./colors.ts";

export const THUMB_CSS_WIDTH = 156;

function boardPixelSize(width: number, height: number): { w: number; h: number } {
  return {
    w: width * STEP - GAP,
    h: height * STEP - GAP,
  };
}

function cellCenter(x: number, y: number): [number, number] {
  return [x * STEP + CELL / 2, y * STEP + CELL / 2];
}

function strokePolyline(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
): void {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0]![0], points[0]![1]);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i]![0], points[i]![1]);
  }
  ctx.stroke();
}

/** 将关卡绘制到 canvas，用于选关缩略图 */
export function drawLevelThumbnail(
  canvas: HTMLCanvasElement,
  level: GameLevel,
  cssWidth = THUMB_CSS_WIDTH,
): void {
  const { width, height } = level;
  const board = boardPixelSize(width, height);
  const cssHeight = (cssWidth * board.h) / board.w;

  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const pixelW = Math.max(1, Math.ceil(cssWidth * dpr));
  const pixelH = Math.max(1, Math.ceil(cssHeight * dpr));
  canvas.width = pixelW;
  canvas.height = pixelH;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const scale = Math.min(pixelW / board.w, pixelH / board.h);
  const offsetX = (pixelW - board.w * scale) / 2;
  const offsetY = (pixelH - board.h * scale) / 2;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = THEME.gamePanel;
  ctx.fillRect(0, 0, pixelW, pixelH);

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  for (const zone of level.zones) {
    const { minX, minY, maxX, maxY } = zone.bounds;
    const x = minX * STEP - 2;
    const y = minY * STEP - 2;
    const w = (maxX - minX + 1) * STEP + 4;
    const h = (maxY - minY + 1) * STEP + 4;
    ctx.fillStyle = ZONE_FILL;
    ctx.strokeStyle = ZONE_STROKE;
    ctx.lineWidth = 1.5 / scale;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  }

  for (const curtain of level.curtains) {
    const cells = curtain.occupiedPositions;
    if (cells.length === 0) continue;
    const xs = cells.map((p) => p[0]);
    const ys = cells.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    ctx.fillStyle = "rgba(134, 142, 150, 0.45)";
    ctx.fillRect(
      minX * STEP,
      minY * STEP,
      (maxX - minX + 1) * STEP - GAP,
      (maxY - minY + 1) * STEP - GAP,
    );
  }

  const lineW = Math.max(1.2, 3 / scale);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = lineW;

  for (const pipe of level.pipes) {
    const pts = pipe.occupiedPositions.map(([x, y]) => cellCenter(x, y));
    ctx.strokeStyle = "rgba(126, 200, 227, 0.85)";
    strokePolyline(ctx, pts);
  }

  for (const arrow of level.arrows) {
    const pts = arrow.occupiedPositions.map(([x, y]) => cellCenter(x, y));
    if (pts.length < 2) continue;
    ctx.strokeStyle = colorForId(arrow.colorId);
    strokePolyline(ctx, pts);
    const [hx, hy] = pts.at(-1)!;
    ctx.fillStyle = colorForId(arrow.colorId);
    ctx.beginPath();
    ctx.arc(hx, hy, Math.max(1, lineW * 0.65), 0, Math.PI * 2);
    ctx.fill();
  }

  for (const corner of level.corners) {
    const [x, y] = corner.occupiedPositions[0] ?? [0, 0];
    const [cx, cy] = cellCenter(x, y);
    ctx.fillStyle = "#fd7e14";
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1.5, 2.5 / scale), 0, Math.PI * 2);
    ctx.fill();
  }

  for (const strip of level.bundles) {
    const pts = strip.occupiedPositions.map(([x, y]) => cellCenter(x, y));
    ctx.strokeStyle = "rgba(255, 146, 43, 0.9)";
    strokePolyline(ctx, pts);
  }

  for (const key of level.keys) {
    const [x, y] = key.occupiedPositions[0] ?? [0, 0];
    const [cx, cy] = cellCenter(x, y);
    ctx.fillStyle = "#ffd43b";
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, 2 / scale), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
