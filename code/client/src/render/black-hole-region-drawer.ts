import { STEP } from "./colors.ts";
import {
  clipRoundedRegionCells,
  fillRoundedRegionCells,
  REGION_OUTER_CORNER_RADIUS,
} from "./region-outline.ts";

/** 吸积盘螺旋臂数量 */
const SPIRAL_ARMS = 3;
/** 缓慢旋转速度（弧度/秒） */
const ROTATION_SPEED = 0.5;

function nebulaHash(x: number, y: number, seed: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + seed * 43.758) * 43758.5453;
  return s - Math.floor(s);
}

/** 将黑洞格按四邻连通性拆成独立区域 */
export function splitBlackHoleComponents(cells: Set<string>): Set<string>[] {
  const remaining = new Set(cells);
  const components: Set<string>[] = [];

  while (remaining.size > 0) {
    const start = remaining.values().next().value!;
    remaining.delete(start);
    const comp = new Set<string>([start]);
    const queue = [start];
    let head = 0;

    while (head < queue.length) {
      const key = queue[head++]!;
      const [xs, ys] = key.split(",");
      const x = Number(xs);
      const y = Number(ys);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ] as const) {
        const nk = `${nx},${ny}`;
        if (remaining.has(nk)) {
          remaining.delete(nk);
          comp.add(nk);
          queue.push(nk);
        }
      }
    }
    components.push(comp);
  }

  return components;
}

function regionPixelBounds(cells: Set<string>): {
  minPx: number;
  minPy: number;
  width: number;
  height: number;
  seed: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const key of cells) {
    const [xs, ys] = key.split(",");
    const x = Number(xs);
    const y = Number(ys);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return {
    minPx: minX * STEP,
    minPy: minY * STEP,
    width: (maxX - minX + 1) * STEP,
    height: (maxY - minY + 1) * STEP,
    seed: minX * 17.31 + minY * 9.17,
  };
}

/** 无缝 clip：外轮廓圆角 */
function clipToRegionCells(ctx: CanvasRenderingContext2D, cells: Set<string>): void {
  clipRoundedRegionCells(ctx, cells, undefined, undefined, REGION_OUTER_CORNER_RADIUS);
}

/** 实心底色铺底，外轮廓圆角 */
function fillRegionBase(ctx: CanvasRenderingContext2D, cells: Set<string>): void {
  fillRoundedRegionCells(ctx, cells, "rgb(0, 2, 12)", undefined, undefined, REGION_OUTER_CORNER_RADIUS);
}

function drawDeepSpaceBackdrop(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  span: number,
  seed: number,
  phase: number,
  cellCount: number,
): void {
  const bg = ctx.createRadialGradient(cx, cy, span * 0.05, cx, cy, span * 0.95);
  bg.addColorStop(0, "rgba(4, 12, 32, 0.95)");
  bg.addColorStop(0.45, "rgba(2, 6, 20, 0.98)");
  bg.addColorStop(1, "rgba(0, 1, 8, 1)");
  ctx.fillStyle = bg;
  ctx.fillRect(bx, by, bw, bh);

  const starCount = Math.ceil(cellCount * 1.4);
  for (let i = 0; i < starCount; i++) {
    const hx = nebulaHash(seed, i, 1);
    const hy = nebulaHash(i, seed, 2);
    const sx = bx + hx * bw;
    const sy = by + hy * bh;
    const twinkle =
      0.25 + 0.55 * (0.5 + 0.5 * Math.sin(phase * 0.7 + sx * 0.05 + sy * 0.04));
    const size = 0.25 + nebulaHash(sx, sy, i + 3) * 0.9;
    const blueTint = nebulaHash(i, sx, 4) > 0.55;
    ctx.fillStyle = blueTint
      ? `rgba(140, 190, 255, ${twinkle * 0.55})`
      : `rgba(220, 230, 255, ${twinkle * 0.5})`;
    ctx.beginPath();
    ctx.arc(sx, sy, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 沿对数螺旋采样点（t: 0=外缘, 1=中心） */
function spiralXY(
  t: number,
  armOffset: number,
  maxR: number,
  turns: number,
): [number, number] {
  const theta = armOffset + t * turns * Math.PI * 2;
  const r = maxR * Math.pow(1 - t, 1.35);
  return [Math.cos(theta) * r, Math.sin(theta) * r];
}

function drawSpiralArm(
  ctx: CanvasRenderingContext2D,
  armIndex: number,
  maxR: number,
  span: number,
  seed: number,
): void {
  const armOffset = (armIndex / SPIRAL_ARMS) * Math.PI * 2 + seed * 0.05;
  const turns = 2.8;
  const steps = 72;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let pass = 0; pass < 3; pass++) {
    const passWidth = span * (0.11 - pass * 0.025);
    const passAlpha = 0.22 - pass * 0.05;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const wobble =
        Math.sin(t * Math.PI * 6 + armIndex * 1.7 + seed) * maxR * 0.025 * (1 - t);
      const [x, y] = spiralXY(t, armOffset, maxR, turns);
      const px = x + wobble;
      const py = y + wobble * 0.6;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    const inner = `rgba(180, 230, 255, ${passAlpha * 0.9})`;
    const mid = `rgba(40, 120, 220, ${passAlpha * 0.75})`;
    const outer = `rgba(8, 30, 80, ${passAlpha * 0.35})`;
    ctx.strokeStyle = pass === 0 ? inner : pass === 1 ? mid : outer;
    ctx.lineWidth = passWidth;
    ctx.globalAlpha = 0.85;
    ctx.stroke();
  }

  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 32; i++) {
    const t = 0.05 + (i / 32) * 0.88;
    const jitter = nebulaHash(i, armIndex, seed) * maxR * 0.07;
    const [x, y] = spiralXY(t, armOffset, maxR + jitter, turns);
    const r = span * (0.07 + (1 - t) * 0.11);
    const a = (0.16 + (1 - t) * 0.3) * (0.72 + nebulaHash(seed, i, armIndex) * 0.28);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    if (t > 0.65) {
      grad.addColorStop(0, `rgba(220, 240, 255, ${a * 0.85})`);
      grad.addColorStop(0.35, `rgba(100, 180, 255, ${a * 0.55})`);
    } else {
      grad.addColorStop(0, `rgba(60, 140, 230, ${a * 0.65})`);
      grad.addColorStop(0.35, `rgba(20, 60, 160, ${a * 0.35})`);
    }
    grad.addColorStop(0.65, `rgba(10, 30, 90, ${a * 0.12})`);
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}

function drawAccretionGlow(ctx: CanvasRenderingContext2D, span: number): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  const outerDisk = ctx.createRadialGradient(0, 0, span * 0.05, 0, 0, span * 0.55);
  outerDisk.addColorStop(0, "rgba(0, 0, 0, 0)");
  outerDisk.addColorStop(0.28, "rgba(15, 60, 140, 0.2)");
  outerDisk.addColorStop(0.58, "rgba(30, 100, 200, 0.26)");
  outerDisk.addColorStop(0.85, "rgba(10, 40, 100, 0.12)");
  outerDisk.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = outerDisk;
  ctx.fillRect(-span, -span, span * 2, span * 2);

  const innerRing = ctx.createRadialGradient(0, 0, span * 0.04, 0, 0, span * 0.14);
  innerRing.addColorStop(0, "rgba(255, 255, 255, 0.78)");
  innerRing.addColorStop(0.22, "rgba(160, 210, 255, 0.55)");
  innerRing.addColorStop(0.5, "rgba(50, 130, 220, 0.28)");
  innerRing.addColorStop(0.78, "rgba(15, 50, 130, 0.08)");
  innerRing.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = innerRing;
  ctx.fillRect(-span, -span, span * 2, span * 2);

  ctx.restore();
}

function drawCentralVoid(ctx: CanvasRenderingContext2D, span: number): void {
  const coreR = span * 0.065;

  ctx.save();
  ctx.globalCompositeOperation = "source-over";

  const rim = ctx.createRadialGradient(0, 0, coreR * 0.9, 0, 0, coreR * 1.25);
  rim.addColorStop(0, "rgba(255, 255, 255, 0.45)");
  rim.addColorStop(0.3, "rgba(100, 170, 255, 0.28)");
  rim.addColorStop(0.7, "rgba(20, 60, 140, 0.06)");
  rim.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(0, 0, coreR * 1.25, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.arc(0, 0, coreR, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawBlackHoleVortexRegion(
  ctx: CanvasRenderingContext2D,
  cells: Set<string>,
  phase: number,
): void {
  if (cells.size === 0) return;

  const { minPx, minPy, width, height, seed } = regionPixelBounds(cells);
  const pad = STEP * 2;
  const bx = minPx - pad;
  const by = minPy - pad;
  const bw = width + pad * 2;
  const bh = height + pad * 2;
  const span = Math.max(bw, bh);
  const cx = minPx + width * 0.5;
  const cy = minPy + height * 0.5;
  const maxR = span * 0.5;
  const rotation = phase * ROTATION_SPEED;

  ctx.save();
  clipToRegionCells(ctx, cells);

  fillRegionBase(ctx, cells);
  drawDeepSpaceBackdrop(ctx, cx, cy, bx, by, bw, bh, span, seed, phase, cells.size);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);

  for (let arm = 0; arm < SPIRAL_ARMS; arm++) {
    drawSpiralArm(ctx, arm, maxR, span, seed);
  }

  drawAccretionGlow(ctx, span);
  drawCentralVoid(ctx, span);

  ctx.restore();

  ctx.restore();
}

/** 永久黑洞区域：按连通块整块绘制旋转吸积盘 */
export function drawBlackHoleRegions(
  ctx: CanvasRenderingContext2D,
  _board: { width: number; height: number },
  blackHoleCells: Set<string>,
  phase: number,
): void {
  if (blackHoleCells.size === 0) return;
  for (const region of splitBlackHoleComponents(blackHoleCells)) {
    drawBlackHoleVortexRegion(ctx, region, phase);
  }
}
