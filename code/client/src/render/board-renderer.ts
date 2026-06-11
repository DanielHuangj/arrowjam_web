import type {
  ArrowItem,
  BoardSize,
  BundleItem,
  CornerItem,
  CurtainItem,
  KeyArrowItem,
  PipeItem,
  ZoneItem,
} from "../core/types.ts";
import { DIR_NAME } from "../core/types.ts";
import {
  BUNDLE_COLORS,
  BUNDLE_LINE_W,
  BUNDLE_WAVE_AMP,
  BUNDLE_WAVE_LEN,
  CELL,
  GAP,
  LINE_W,
  R_BODY,
  R_HEAD,
  STEP,
  THEME,
  ZONE_FILL,
  ZONE_STROKE,
  colorForId,
} from "./colors.ts";
import { drawCornerInCell } from "./corner-drawer.ts";
import { drawCurtainInBoard } from "./curtain-drawer.ts";
import { drawKeyInCell } from "./key-drawer.ts";
import { drawPipeInBoard } from "./pipe-drawer.ts";

const DIR_TRI: Record<string, [number, number][]> = {
  up: [[0, -4.5], [4, 2], [-4, 2]],
  down: [[0, 4.5], [4, -2], [-4, -2]],
  left: [[-4.5, 0], [2, 4], [2, -4]],
  right: [[4.5, 0], [-2, 4], [-2, -4]],
};

export function boardPixelSize(board: BoardSize): { width: number; height: number } {
  return {
    width: board.width * STEP - GAP,
    height: board.height * STEP - GAP,
  };
}

function cellCenter(x: number, y: number): [number, number] {
  return [x * STEP + CELL / 2, y * STEP + CELL / 2];
}

export class BoardRenderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D not supported");
    this.ctx = ctx;
  }

  resize(board: BoardSize): void {
    this.dpr = window.devicePixelRatio || 1;
    const { width, height } = boardPixelSize(board);
    this.canvas.width = Math.ceil(width * this.dpr);
    this.canvas.height = Math.ceil(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  clear(): void {
    const { width, height } = boardPixelSize({
      width: this.canvas.width / this.dpr / STEP,
      height: this.canvas.height / this.dpr / STEP,
    });
    this.ctx.clearRect(0, 0, width + STEP, height + STEP);
  }

  drawBoard(
    board: BoardSize,
    launchableIds: Set<number>,
    zones: ZoneItem[] = [],
    zoneArrows: ArrowItem[] = [],
    zoneCorners: CornerItem[] = [],
    zoneBundles: BundleItem[] = [],
    zonePipes: PipeItem[] = [],
    topArrows: ArrowItem[] = [],
    topCorners: CornerItem[] = [],
    topBundles: BundleItem[] = [],
    topPipes: PipeItem[] = [],
    keys: KeyArrowItem[] = [],
    curtains: (CurtainItem & {
      bounds: { minX: number; minY: number; maxX: number; maxY: number };
    })[] = [],
  ): void {
    this.resize(board);
    const { width, height } = boardPixelSize(board);
    this.ctx.fillStyle = THEME.panel;
    this.ctx.fillRect(0, 0, width, height);

    for (let y = 0; y < board.height; y++) {
      for (let x = 0; x < board.width; x++) {
        const gx = x * STEP;
        const gy = y * STEP;
        this.ctx.fillStyle = THEME.gridCell;
        this.ctx.strokeStyle = THEME.gridLine;
        this.ctx.lineWidth = 1;
        roundRect(this.ctx, gx, gy, CELL, CELL, 4);
        this.ctx.fill();
        this.ctx.stroke();
      }
    }

    // layer 1: 子区域框（始终显示，最底层）
    for (const zone of zones) {
      this.drawZone(zone);
    }

    // layer 2: 已揭示的子区域（可见箭头 → 管道 → 角块/捆绑）
    for (const arrow of zoneArrows) {
      this.drawArrow(arrow, launchableIds.has(arrow.instanceId));
    }
    for (const pipe of zonePipes) {
      this.drawPipe(pipe);
    }
    for (const corner of zoneCorners) {
      this.drawCorner(corner);
    }
    for (const strip of zoneBundles) {
      this.drawBundle(strip);
    }

    // layer 2: 顶层（可见箭头 → 管道遮住管内箭头 → 角块/捆绑）
    for (const arrow of topArrows) {
      this.drawArrow(arrow, launchableIds.has(arrow.instanceId));
    }
    for (const pipe of topPipes) {
      this.drawPipe(pipe);
    }
    for (const corner of topCorners) {
      this.drawCorner(corner);
    }
    for (const strip of topBundles) {
      this.drawBundle(strip);
    }

    // layer 3: 钥匙标记（叠在箭身之上）
    for (const key of keys) {
      const [x, y] = key.occupiedPositions[0] ?? [0, 0];
      drawKeyInCell(this.ctx, x, y, STEP);
    }

    // layer 8: 幕布遮罩（最上层）
    for (const curtain of curtains) {
      drawCurtainInBoard(this.ctx, curtain, STEP);
    }
  }

  private drawZone(zone: ZoneItem): void {
    const { minX, minY, maxX, maxY } = zone.bounds;
    const x = minX * STEP - 2;
    const y = minY * STEP - 2;
    const w = (maxX - minX + 1) * STEP + 4;
    const h = (maxY - minY + 1) * STEP + 4;
    this.ctx.fillStyle = ZONE_FILL;
    this.ctx.strokeStyle = ZONE_STROKE;
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([6, 4]);
    roundRect(this.ctx, x, y, w, h, 6);
    this.ctx.fill();
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }

  private drawCorner(corner: CornerItem): void {
    const [x, y] = corner.occupiedPositions[0] ?? [0, 0];
    drawCornerInCell(this.ctx, x, y, corner, STEP);
  }

  /** kind 3: Q 版粗管道 */
  private drawPipe(pipe: PipeItem): void {
    drawPipeInBoard(this.ctx, pipe, STEP);
  }

  /** layer 3: 彩色波纹捆绑线，叠在箭身之上 */
  private drawBundle(strip: BundleItem): void {
    const pos = strip.occupiedPositions;
    if (pos.length < 2) return;

    const points = pos.map(([x, y]) => cellCenter(x, y));
    const color = BUNDLE_COLORS[strip.instanceId % BUNDLE_COLORS.length]!;

    this.ctx.save();
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";

    // 底层白色描边，增强对比
    this.ctx.strokeStyle = "rgba(255,255,255,0.9)";
    this.ctx.lineWidth = BUNDLE_LINE_W + 3;
    this.drawWavyPath(points, 0);
    this.ctx.stroke();

    // 彩色波纹主线
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = BUNDLE_LINE_W;
    this.drawWavyPath(points, Math.PI / 2);
    this.ctx.stroke();

    this.ctx.restore();
  }

  /** 沿折线绘制正弦波纹 */
  private drawWavyPath(points: [number, number][], phase: number): void {
    const samples = samplePolyline(points, 4);
    if (samples.length < 2) return;

    this.ctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const { x, y, tx, ty } = samples[i]!;
      const len = Math.hypot(tx, ty) || 1;
      const nx = -ty / len;
      const ny = tx / len;
      const wave =
        Math.sin((i / BUNDLE_WAVE_LEN) * Math.PI * 2 + phase) * BUNDLE_WAVE_AMP;
      const px = x + nx * wave;
      const py = y + ny * wave;
      if (i === 0) this.ctx.moveTo(px, py);
      else this.ctx.lineTo(px, py);
    }
  }

  private drawArrow(arrow: ArrowItem, launchable: boolean): void {
    const color = colorForId(arrow.colorId);
    const dirName = DIR_NAME[arrow.direction];
    const pos = arrow.occupiedPositions;

    if (pos.length >= 2) {
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = LINE_W;
      this.ctx.lineCap = "round";
      this.ctx.lineJoin = "round";
      this.ctx.globalAlpha = launchable ? 1 : 0.75;
      this.ctx.beginPath();
      const [x0, y0] = cellCenter(pos[0]![0], pos[0]![1]);
      this.ctx.moveTo(x0, y0);
      for (let i = 1; i < pos.length; i++) {
        const [cx, cy] = cellCenter(pos[i]![0], pos[i]![1]);
        this.ctx.lineTo(cx, cy);
      }
      this.ctx.stroke();
      this.ctx.globalAlpha = 1;
    }

    for (let i = 0; i < pos.length; i++) {
      const [x, y] = pos[i]!;
      const [cx, cy] = cellCenter(x, y);
      const isHead = i === pos.length - 1;
      if (isHead) {
        this.ctx.fillStyle = color;
        this.ctx.strokeStyle = "#fff";
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, R_HEAD, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        this.drawHeadTriangle(cx, cy, dirName);
      } else {
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, R_BODY, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
  }

  private drawHeadTriangle(cx: number, cy: number, dirName: string): void {
    const pts = DIR_TRI[dirName];
    if (!pts) return;
    this.ctx.fillStyle = "rgba(255,255,255,0.95)";
    this.ctx.beginPath();
    this.ctx.moveTo(cx + pts[0]![0], cy + pts[0]![1]);
    this.ctx.lineTo(cx + pts[1]![0], cy + pts[1]![1]);
    this.ctx.lineTo(cx + pts[2]![0], cy + pts[2]![1]);
    this.ctx.closePath();
    this.ctx.fill();
  }

  canvasToCell(board: BoardSize, clientX: number, clientY: number): [number, number] | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const gx = Math.floor(x / STEP);
    const gy = Math.floor(y / STEP);
    if (gx < 0 || gy < 0 || gx >= board.width || gy >= board.height) return null;
    const lx = x - gx * STEP;
    const ly = y - gy * STEP;
    if (lx > CELL || ly > CELL) return null;
    return [gx, gy];
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
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
      out.push({
        x: x0 + dx * t,
        y: y0 + dy * t,
        tx: dx,
        ty: dy,
      });
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
