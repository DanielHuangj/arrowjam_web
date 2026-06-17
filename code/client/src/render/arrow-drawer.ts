import type { ArrowItem } from "../core/types.ts";
import { DIR_NAME } from "../core/types.ts";
import {
  CELL,
  GAME_LINE_W,
  LINE_W,
  R_BODY,
  R_HEAD,
  SHADOW_COLOR,
  SHADOW_DX,
  SHADOW_DY,
  STEP,
  colorForId,
} from "./colors.ts";

const EDITOR_DIR_TRI: Record<string, [number, number][]> = {
  up: [[0, -4.5], [4, 2], [-4, 2]],
  down: [[0, 4.5], [4, -2], [-4, -2]],
  left: [[-4.5, 0], [2, 4], [2, -4]],
  right: [[4.5, 0], [-2, 4], [-2, -4]],
};

/** 箭头基部相对格心的回缩量，箭身在此收口 */
const GAME_HEAD_BASE_INSET = 5.5;

const GAME_DIR_TRI: Record<string, [number, number][]> = {
  up: [[0, -11], [8.5, 5], [-8.5, 5]],
  down: [[0, 11], [8.5, -5], [-8.5, -5]],
  left: [[-11, 0], [5, 8.5], [5, -8.5]],
  right: [[11, 0], [-5, 8.5], [-5, -8.5]],
};

function shortenLineAtHead(
  points: [number, number][],
  inset: number,
): [number, number][] {
  if (points.length < 2) return points;
  const result = [...points];
  const last = result.at(-1)!;
  const prev = result.at(-2)!;
  const dx = last[0] - prev[0];
  const dy = last[1] - prev[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return result;
  const pullBack = Math.min(inset, len * 0.35);
  result[result.length - 1] = [
    last[0] - (dx / len) * pullBack,
    last[1] - (dy / len) * pullBack,
  ];
  return result;
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

function drawWedgeHead(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  dirName: string,
  tri: Record<string, [number, number][]>,
): void {
  const pts = tri[dirName];
  if (!pts) return;
  ctx.beginPath();
  ctx.moveTo(cx + pts[0]![0], cy + pts[0]![1]);
  ctx.lineTo(cx + pts[1]![0], cy + pts[1]![1]);
  ctx.lineTo(cx + pts[2]![0], cy + pts[2]![1]);
  ctx.closePath();
  ctx.fill();
}

/** 编辑器样式：折线 + 圆点 + 圆头 */
export function drawArrowEditor(
  ctx: CanvasRenderingContext2D,
  arrow: ArrowItem,
  launchable: boolean,
): void {
  const color = colorForId(arrow.colorId);
  const dirName = DIR_NAME[arrow.direction];
  const pos = arrow.occupiedPositions;

  if (pos.length >= 2) {
    ctx.strokeStyle = color;
    ctx.lineWidth = LINE_W;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = launchable ? 1 : 0.75;
    strokePolyline(
      ctx,
      pos.map(([x, y]) => cellCenter(x, y)),
    );
    ctx.globalAlpha = 1;
  }

  for (let i = 0; i < pos.length; i++) {
    const [x, y] = pos[i]!;
    const [cx, cy] = cellCenter(x, y);
    const isHead = i === pos.length - 1;
    if (isHead) {
      ctx.fillStyle = color;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, R_HEAD, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      drawWedgeHead(ctx, cx, cy, dirName, EDITOR_DIR_TRI);
    } else {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, R_BODY, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** 游戏样式：阴影折线 + 楔形箭头，无圆点/圆框 */
export function drawArrowGame(
  ctx: CanvasRenderingContext2D,
  arrow: ArrowItem,
  _launchable: boolean,
  vanishProgress = 0,
): void {
  const color = colorForId(arrow.colorId);
  const dirName = DIR_NAME[arrow.direction];
  const pos = arrow.occupiedPositions;
  if (pos.length < 2) return;

  const points = pos.map(([x, y]) => cellCenter(x, y));
  const bodyPoints = shortenLineAtHead(points, GAME_HEAD_BASE_INSET);

  const fade = vanishProgress > 0 ? Math.max(0, 1 - vanishProgress * 1.15) : 1;
  const shrink = vanishProgress > 0 ? 1 - vanishProgress * 0.35 : 1;
  const cx =
    points.reduce((sum, [x]) => sum + x, 0) / points.length;
  const cy =
    points.reduce((sum, [, y]) => sum + y, 0) / points.length;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = fade;

  if (shrink < 1) {
    ctx.translate(cx, cy);
    ctx.scale(shrink, shrink);
    ctx.translate(-cx, -cy);
  }

  ctx.translate(SHADOW_DX, SHADOW_DY);
  ctx.strokeStyle = SHADOW_COLOR;
  ctx.lineWidth = GAME_LINE_W + 2;
  strokePolyline(ctx, bodyPoints);
  ctx.translate(-SHADOW_DX, -SHADOW_DY);

  ctx.strokeStyle = color;
  ctx.lineWidth = GAME_LINE_W;
  strokePolyline(ctx, bodyPoints);

  const [hx, hy] = points.at(-1)!;
  ctx.fillStyle = color;
  drawWedgeHead(ctx, hx, hy, dirName, GAME_DIR_TRI);

  ctx.restore();

  if (vanishProgress > 0) {
    for (const [x, y] of pos) {
      const [px, py] = cellCenter(x, y);
      const sparkR = 2 + vanishProgress * 10;
      const sparkA = Math.max(0, (1 - vanishProgress) * 0.8);
      ctx.save();
      ctx.globalAlpha = sparkA;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(px, py, sparkR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, sparkR * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

export function arrowBodyCellCount(arrow: ArrowItem): number {
  return Math.max(0, arrow.occupiedPositions.length - 1);
}
