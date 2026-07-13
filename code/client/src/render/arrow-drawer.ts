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
  mixHex,
  shadeHex,
} from "./colors.ts";

const EDITOR_DIR_TRI: Record<string, [number, number][]> = {
  up: [[0, -4.5], [4, 2], [-4, 2]],
  down: [[0, 4.5], [4, -2], [-4, -2]],
  left: [[-4.5, 0], [2, 4], [2, -4]],
  right: [[4.5, 0], [-2, 4], [-2, -4]],
};

/** 箭头基部相对格心的回缩量，箭身在此收口 */
const GAME_HEAD_BASE_INSET = 5.5;
const GAME_CORNER_RADIUS = 12;

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

function buildRoundedPolylinePath(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
  radius: number,
): void {
  const n = points.length;
  if (n < 2) return;
  if (n === 2) {
    ctx.moveTo(points[0]![0], points[0]![1]);
    ctx.lineTo(points[1]![0], points[1]![1]);
    return;
  }

  const corners: {
    tip: [number, number];
    enter: [number, number];
    exit: [number, number];
  }[] = [];

  for (let i = 1; i < n - 1; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const c = points[i + 1]!;
    const v1x = a[0] - b[0];
    const v1y = a[1] - b[1];
    const v2x = c[0] - b[0];
    const v2y = c[1] - b[1];
    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);
    if (len1 < 1e-6 || len2 < 1e-6) continue;
    const r = Math.min(radius, len1 * 0.48, len2 * 0.48);
    corners.push({
      tip: b,
      enter: [b[0] + (v1x / len1) * r, b[1] + (v1y / len1) * r],
      exit: [b[0] + (v2x / len2) * r, b[1] + (v2y / len2) * r],
    });
  }

  ctx.moveTo(points[0]![0], points[0]![1]);
  if (corners.length === 0) {
    ctx.lineTo(points[n - 1]![0], points[n - 1]![1]);
    return;
  }
  ctx.lineTo(corners[0]!.enter[0], corners[0]!.enter[1]);
  for (let i = 0; i < corners.length; i++) {
    const corner = corners[i]!;
    ctx.quadraticCurveTo(
      corner.tip[0],
      corner.tip[1],
      corner.exit[0],
      corner.exit[1],
    );
    if (i < corners.length - 1) {
      ctx.lineTo(corners[i + 1]!.enter[0], corners[i + 1]!.enter[1]);
    }
  }
  ctx.lineTo(points[n - 1]![0], points[n - 1]![1]);
}

function strokeRoundedPolyline(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
  radius: number,
): void {
  if (points.length < 2) return;
  ctx.beginPath();
  buildRoundedPolylinePath(ctx, points, radius);
  ctx.stroke();
}

function polylineBounds(points: [number, number][]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
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

function drawCandyWedgeHead(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  dirName: string,
  color: string,
): void {
  const pts = GAME_DIR_TRI[dirName];
  if (!pts) return;

  const tip = pts[0]!;
  const left = pts[1]!;
  const right = pts[2]!;
  const tx = cx + tip[0];
  const ty = cy + tip[1];
  const lx = cx + left[0];
  const ly = cy + left[1];
  const rx = cx + right[0];
  const ry = cy + right[1];

  const grad = ctx.createLinearGradient(tx, ty, (lx + rx) / 2, (ly + ry) / 2);
  grad.addColorStop(0, mixHex(color, 0.42));
  grad.addColorStop(0.38, color);
  grad.addColorStop(1, shadeHex(color, -0.16));

  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.quadraticCurveTo(
    cx + (left[0] + tip[0]) * 0.55,
    cy + (left[1] + tip[1]) * 0.55,
    lx,
    ly,
  );
  ctx.quadraticCurveTo((lx + rx) / 2, (ly + ry) / 2, rx, ry);
  ctx.quadraticCurveTo(
    cx + (right[0] + tip[0]) * 0.55,
    cy + (right[1] + tip[1]) * 0.55,
    tx,
    ty,
  );
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.save();
  ctx.globalAlpha *= 0.55;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(
    tx + (dirName === "left" ? 2 : dirName === "right" ? -2 : 0),
    ty + (dirName === "up" ? 2 : dirName === "down" ? -2 : 0),
    3.2,
    2.1,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();
}

function drawCandyArrowBody(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
  color: string,
  lineBoost: number,
): void {
  const bounds = polylineBounds(points);
  const grad = ctx.createLinearGradient(
    bounds.minX,
    bounds.minY,
    bounds.maxX,
    bounds.maxY,
  );
  grad.addColorStop(0, mixHex(color, 0.34));
  grad.addColorStop(0.42, color);
  grad.addColorStop(1, shadeHex(color, -0.12));

  ctx.translate(SHADOW_DX, SHADOW_DY);
  ctx.strokeStyle = SHADOW_COLOR;
  ctx.lineWidth = (GAME_LINE_W + 3) * lineBoost;
  strokeRoundedPolyline(ctx, points, GAME_CORNER_RADIUS);
  ctx.translate(-SHADOW_DX, -SHADOW_DY);

  ctx.strokeStyle = shadeHex(color, -0.18);
  ctx.lineWidth = (GAME_LINE_W + 1.5) * lineBoost;
  strokeRoundedPolyline(ctx, points, GAME_CORNER_RADIUS);

  ctx.strokeStyle = grad;
  ctx.lineWidth = GAME_LINE_W * lineBoost;
  strokeRoundedPolyline(ctx, points, GAME_CORNER_RADIUS);

  ctx.save();
  ctx.globalAlpha *= 0.42;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(2, GAME_LINE_W * 0.34 * lineBoost);
  strokeRoundedPolyline(ctx, points, GAME_CORNER_RADIUS);
  ctx.restore();
}

/** 编辑器样式：圆角折线 + 圆点 + 圆头 */
export function drawArrowEditor(
  ctx: CanvasRenderingContext2D,
  arrow: ArrowItem,
  launchable: boolean,
): void {
  const color = colorForId(arrow.colorId);
  const dirName = DIR_NAME[arrow.direction];
  const pos = arrow.occupiedPositions;
  const centers = pos.map(([x, y]) => cellCenter(x, y));

  if (pos.length >= 2) {
    ctx.strokeStyle = color;
    ctx.lineWidth = LINE_W;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = launchable ? 1 : 0.75;
    strokeRoundedPolyline(ctx, centers, 8);
    ctx.globalAlpha = 1;
  }

  for (let i = 0; i < pos.length; i++) {
    const [x, y] = pos[i]!;
    const [cx, cy] = cellCenter(x, y);
    const isHead = i === pos.length - 1;
    if (isHead) {
      ctx.fillStyle = color;
      ctx.strokeStyle = mixHex(color, 0.55);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, R_HEAD, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      drawWedgeHead(ctx, cx, cy, dirName, EDITOR_DIR_TRI);
    } else {
      ctx.fillStyle = mixHex(color, 0.12);
      ctx.beginPath();
      ctx.arc(cx, cy, R_BODY, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, R_BODY - 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** 游戏样式：圆角糖果箭身 + 立体箭头 */
export interface BalloonArrowFx {
  inflate: number;
  pop: number;
}

function visibleIndexRuns(
  pos: readonly [number, number][],
  hiddenCellKeys?: ReadonlySet<string>,
): number[][] {
  if (!hiddenCellKeys || hiddenCellKeys.size === 0) {
    return [pos.map((_, i) => i)];
  }
  const runs: number[][] = [];
  let current: number[] = [];
  for (let i = 0; i < pos.length; i++) {
    const key = `${pos[i]![0]},${pos[i]![1]}`;
    if (!hiddenCellKeys.has(key)) {
      current.push(i);
    } else if (current.length > 0) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

export function drawArrowGame(
  ctx: CanvasRenderingContext2D,
  arrow: ArrowItem,
  _launchable: boolean,
  vanishProgress = 0,
  balloonFx?: BalloonArrowFx,
  hiddenCellKeys?: ReadonlySet<string>,
): void {
  const color = colorForId(arrow.colorId);
  const dirName = DIR_NAME[arrow.direction];
  const pos = arrow.occupiedPositions;
  if (pos.length < 2) return;

  const points = pos.map(([x, y]) => cellCenter(x, y));
  const headIndex = pos.length - 1;
  const headHidden =
    hiddenCellKeys != null &&
    hiddenCellKeys.has(`${pos[headIndex]![0]},${pos[headIndex]![1]}`);
  const visibleRuns = visibleIndexRuns(pos, hiddenCellKeys);

  const fade =
    vanishProgress > 0 ? Math.max(0, 1 - vanishProgress * 1.15) : 1;
  let scale = vanishProgress > 0 ? 1 - vanishProgress * 0.35 : 1;
  let lineBoost = 1;
  if (balloonFx) {
    const maxInflate = 0.28;
    if (balloonFx.pop > 0) {
      scale = (1 + maxInflate * balloonFx.inflate) * (1 - balloonFx.pop);
      lineBoost = 1 + maxInflate * balloonFx.inflate * (1 - balloonFx.pop);
    } else if (balloonFx.inflate > 0) {
      const pulse = 1 + Math.sin(balloonFx.inflate * Math.PI * 3) * 0.025;
      scale = (1 + maxInflate * balloonFx.inflate) * pulse;
      lineBoost = 1 + balloonFx.inflate * 0.35;
    }
  }
  const drawFade =
    balloonFx && balloonFx.pop > 0 ? fade * (1 - balloonFx.pop) : fade;
  const cx =
    points.reduce((sum, [x]) => sum + x, 0) / points.length;
  const cy =
    points.reduce((sum, [, y]) => sum + y, 0) / points.length;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const baseAlpha = ctx.globalAlpha;
  ctx.globalAlpha = baseAlpha * drawFade;

  if (scale !== 1) {
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
  }

  for (const run of visibleRuns) {
    if (run.length < 2) continue;
    const runPoints = run.map((i) => points[i]!);
    const includeHead =
      !headHidden && run[run.length - 1] === headIndex;
    const bodyPoints = includeHead
      ? shortenLineAtHead(runPoints, GAME_HEAD_BASE_INSET)
      : runPoints;
    drawCandyArrowBody(ctx, bodyPoints, color, lineBoost);
  }

  if (!headHidden) {
    const [hx, hy] = points.at(-1)!;
    ctx.translate(SHADOW_DX * 0.6, SHADOW_DY * 0.6);
    ctx.fillStyle = SHADOW_COLOR;
    drawWedgeHead(ctx, hx, hy, dirName, GAME_DIR_TRI);
    ctx.translate(-SHADOW_DX * 0.6, -SHADOW_DY * 0.6);
    drawCandyWedgeHead(ctx, hx, hy, dirName, color);
  }

  ctx.restore();

  if (hiddenCellKeys && hiddenCellKeys.size > 0) {
    for (let i = 0; i < pos.length; i++) {
      const key = `${pos[i]![0]},${pos[i]![1]}`;
      if (!hiddenCellKeys.has(key)) continue;
      const nextOutside = i > 0 && !hiddenCellKeys.has(`${pos[i - 1]![0]},${pos[i - 1]![1]}`);
      if (!nextOutside && i !== headIndex) continue;
      const [px, py] = cellCenter(pos[i]![0], pos[i]![1]);
      const edgeFade = vanishProgress > 0 ? Math.max(0, 1 - vanishProgress) : 0.55;
      ctx.save();
      ctx.globalAlpha = edgeFade * 0.65;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, R_BODY * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = edgeFade * 0.35;
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  if (balloonFx && balloonFx.pop > 0.05) {
    for (const [x, y] of pos) {
      const [px, py] = cellCenter(x, y);
      const sparkR = 2 + balloonFx.pop * 12 * scale;
      const sparkA = Math.max(0, (1 - balloonFx.pop) * 0.75);
      ctx.save();
      ctx.globalAlpha = sparkA;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(px, py, sparkR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, sparkR * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

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
