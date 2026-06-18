import type {
  ArrowItem,
  BoardSize,
  BombItem,
  BundleItem,
  CornerItem,
  CurtainItem,
  FrozenOverlayItem,
  KeyArrowItem,
  MovingWallItem,
  PipeItem,
  Vec2,
  ZoneItem,
} from "../core/types.ts";
import { vecKey } from "../core/types.ts";
import {
  BUNDLE_COLORS,
  BUNDLE_LINE_W,
  BUNDLE_WAVE_AMP,
  BUNDLE_WAVE_LEN,
  CELL,
  GAP,
  STEP,
  THEME,
  TRACE_DOT_COLOR,
  TRACE_DOT_RADIUS,
  ZONE_FILL,
  ZONE_STROKE,
} from "./colors.ts";
import { drawArrowEditor, drawArrowGame } from "./arrow-drawer.ts";
import { drawCornerInCell } from "./corner-drawer.ts";
import { drawCurtainInBoard } from "./curtain-drawer.ts";
import { drawKeyInCell } from "./key-drawer.ts";
import { drawPipeInBoard } from "./pipe-drawer.ts";
import { drawBomb, drawBombExplosion, drawFrozenOverlay, drawMovingWall } from "./mechanics-drawer.ts";

export type BoardRenderStyle = "editor" | "game";

export interface BoardDrawOptions {
  style?: BoardRenderStyle;
  clearedTraces?: Vec2[];
  /** 不绘制痕迹的格（仍有箭占用） */
  occupiedCells?: Set<string>;
  /** 随机消除湮灭进度 0~1，按 instanceId */
  vanishProgressById?: ReadonlyMap<number, number>;
  movingWalls?: MovingWallItem[];
  frozenOverlays?: FrozenOverlayItem[];
  bombStates?: { bomb: BombItem; remaining: number | null }[];
  bombExplosion?: { cells: Vec2[]; progress: number } | null;
  bombs?: BombItem[];
  urgentBombRemaining?: number | null;
}

const DEFAULT_DRAW_OPTIONS: BoardDrawOptions = { style: "editor" };

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

  constructor(
    private canvas: HTMLCanvasElement,
    private defaultStyle: BoardRenderStyle = "editor",
  ) {
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
    options: BoardDrawOptions = DEFAULT_DRAW_OPTIONS,
  ): void {
    const style = options.style ?? this.defaultStyle;
    const isGame = style === "game";

    this.resize(board);
    const { width, height } = boardPixelSize(board);
    this.ctx.fillStyle = isGame ? THEME.gamePanel : THEME.panel;
    this.ctx.fillRect(0, 0, width, height);

    if (!isGame) {
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
    }

    if (isGame && options.clearedTraces?.length) {
      this.drawClearedTraces(options.clearedTraces, options.occupiedCells);
    }

    for (const zone of zones) {
      this.drawZone(zone);
    }

    for (const arrow of zoneArrows) {
      this.drawArrow(
        arrow,
        launchableIds.has(arrow.instanceId),
        isGame,
        options.vanishProgressById?.get(arrow.instanceId) ?? 0,
      );
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

    for (const pipe of topPipes) {
      this.drawPipe(pipe);
    }
    if (options.movingWalls) {
      for (const wall of options.movingWalls) {
        drawMovingWall(this.ctx, wall);
      }
    }

    for (const arrow of topArrows) {
      this.drawArrow(
        arrow,
        launchableIds.has(arrow.instanceId),
        isGame,
        options.vanishProgressById?.get(arrow.instanceId) ?? 0,
      );
    }
    if (options.frozenOverlays) {
      for (const overlay of options.frozenOverlays) {
        drawFrozenOverlay(this.ctx, overlay);
      }
    }
    for (const corner of topCorners) {
      this.drawCorner(corner);
    }
    for (const strip of topBundles) {
      this.drawBundle(strip);
    }

    for (const key of keys) {
      const [x, y] = key.occupiedPositions[0] ?? [0, 0];
      drawKeyInCell(this.ctx, x, y, STEP);
    }

    if (options.bombStates) {
      for (const { bomb, remaining } of options.bombStates) {
        drawBomb(this.ctx, bomb, remaining);
      }
    } else if (options.bombs) {
      const urgent = options.urgentBombRemaining ?? null;
      for (const bomb of options.bombs) {
        drawBomb(this.ctx, bomb, urgent);
      }
    }

    if (options.bombExplosion) {
      drawBombExplosion(
        this.ctx,
        options.bombExplosion.cells,
        options.bombExplosion.progress,
      );
    }

    for (const curtain of curtains) {
      drawCurtainInBoard(this.ctx, curtain, STEP);
    }
  }

  private drawClearedTraces(traces: Vec2[], occupied?: Set<string>): void {
    const ctx = this.ctx;
    ctx.fillStyle = TRACE_DOT_COLOR;
    for (const [x, y] of traces) {
      const key = vecKey([x, y]);
      if (occupied?.has(key)) continue;
      const [cx, cy] = cellCenter(x, y);
      ctx.beginPath();
      ctx.arc(cx, cy, TRACE_DOT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
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

  private drawPipe(pipe: PipeItem): void {
    drawPipeInBoard(this.ctx, pipe, STEP);
  }

  private drawBundle(strip: BundleItem): void {
    const pos = strip.occupiedPositions;
    if (pos.length < 2) return;

    const points = pos.map(([x, y]) => cellCenter(x, y));
    const color = BUNDLE_COLORS[strip.instanceId % BUNDLE_COLORS.length]!;

    this.ctx.save();
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";

    this.ctx.strokeStyle = "rgba(255,255,255,0.9)";
    this.ctx.lineWidth = BUNDLE_LINE_W + 3;
    this.drawWavyPath(points, 0);
    this.ctx.stroke();

    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = BUNDLE_LINE_W;
    this.drawWavyPath(points, Math.PI / 2);
    this.ctx.stroke();

    this.ctx.restore();
  }

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

  private drawArrow(
    arrow: ArrowItem,
    launchable: boolean,
    gameStyle: boolean,
    vanishProgress = 0,
  ): void {
    if (gameStyle) {
      drawArrowGame(this.ctx, arrow, launchable, vanishProgress);
    } else {
      drawArrowEditor(this.ctx, arrow, launchable);
    }
  }

  canvasToCell(board: BoardSize, clientX: number, clientY: number): [number, number] | null {
    const rect = this.canvas.getBoundingClientRect();
    const { width: boardW, height: boardH } = boardPixelSize(board);
    const styleW = parseFloat(this.canvas.style.width) || boardW;
    const styleH = parseFloat(this.canvas.style.height) || boardH;
    const scaleX = styleW > 0 ? rect.width / styleW : 1;
    const scaleY = styleH > 0 ? rect.height / styleH : 1;
    const x = (clientX - rect.left) / scaleX;
    const y = (clientY - rect.top) / scaleY;
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
