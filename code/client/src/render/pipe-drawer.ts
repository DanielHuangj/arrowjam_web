import type { PipeItem } from "../core/types.ts";
import { CELL } from "./colors.ts";

const PIPE_OUTER = 16;
const PIPE_INNER = 9;
const PIPE_HIGHLIGHT = "rgba(255,255,255,0.35)";
const PIPE_SHADOW = "rgba(0,0,0,0.25)";

function cellCenter(x: number, y: number, step: number): [number, number] {
  return [x * step + CELL / 2, y * step + CELL / 2];
}

function samplePolyline(
  points: [number, number][],
  stepPx: number,
): { x: number; y: number; tx: number; ty: number }[] {
  const out: { x: number; y: number; tx: number; ty: number }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[i + 1]!;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const segLen = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(segLen / stepPx));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push({ x: x0 + dx * t, y: y0 + dy * t, tx: dx, ty: dy });
    }
  }
  const last = points.at(-1)!;
  const prev = points.at(-2) ?? last;
  out.push({
    x: last[0],
    y: last[1],
    tx: last[0] - prev[0],
    ty: last[1] - prev[1],
  });
  return out;
}

function strokeThickPath(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
  width: number,
  color: string,
  offset = 0,
): void {
  const samples = samplePolyline(points, 3);
  if (samples.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i < samples.length; i++) {
    const { x, y, tx, ty } = samples[i]!;
    const len = Math.hypot(tx, ty) || 1;
    const nx = -ty / len;
    const ny = tx / len;
    const px = x + nx * offset;
    const py = y + ny * offset;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

/** Q 版粗管道：双层圆角管身 + 亮面 + 法兰端盖 */
export function drawPipeInBoard(
  ctx: CanvasRenderingContext2D,
  pipe: PipeItem,
  step: number,
): void {
  const pos = pipe.occupiedPositions;
  if (pos.length < 2) return;

  const points = pos.map(([x, y]) => cellCenter(x, y, step));

  ctx.save();

  // 底层投影
  strokeThickPath(ctx, points, PIPE_OUTER + 4, PIPE_SHADOW, 2);

  // 外壁（深蓝灰）
  strokeThickPath(ctx, points, PIPE_OUTER, "#3d5a73");

  // 内壁通道（浅青）
  strokeThickPath(ctx, points, PIPE_INNER, "#7ec8e3");

  // 顶部高光条
  strokeThickPath(ctx, points, 3, PIPE_HIGHLIGHT, -4);

  // 端点法兰盖
  for (const pass of pipe.passes) {
    const [cx, cy] = cellCenter(pass.position[0], pass.position[1], step);
    const flangeR = CELL * 0.42;

    ctx.fillStyle = "#4a6fa5";
    ctx.strokeStyle = "#c5d9f0";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, flangeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#7ec8e3";
    ctx.beginPath();
    ctx.arc(cx, cy, flangeR * 0.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#2f3f52";
    ctx.font = "bold 12px system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⇄", cx, cy + 1);
  }

  // 血量徽章
  const hpIdx = Math.min(
    Math.max(0, pipe.healthViewPathIndex),
    pos.length - 1,
  );
  const [hx, hy] = cellCenter(pos[hpIdx]![0], pos[hpIdx]![1], step);
  ctx.fillStyle = "#ff6b6b";
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(hx, hy - 12, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 12px system-ui,sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(pipe.health), hx, hy - 12);

  ctx.restore();
}
