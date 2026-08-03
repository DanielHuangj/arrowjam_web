import type {
  ArrowItem,
  BoardSize,
  BombItem,
  BuffItem,
  BundleItem,
  ControllerItem,
  CornerItem,
  CurtainItem,
  FrozenOverlayItem,
  KeyArrowItem,
  MovingWallItem,
  PipeItem,
  ShrinkPipeItem,
  ToggleItem,
  Vec2,
  ZoneItem,
} from "../core/types.ts";
import {
  BUNDLE_COLORS,
  BUNDLE_LINE_W,
  BUNDLE_WAVE_AMP,
  BUNDLE_WAVE_LEN,
  CELL,
  GAP,
  STEP,
  THEME,
  GAME_BOARD_BORDER_PAD_CELLS,
  ZONE_FILL,
  ZONE_STROKE,
  invalidCellColorHex,
  EDITOR_BLACK_HOLE_FILL,
  EDITOR_BLACK_HOLE_STROKE,
} from "./colors.ts";
import { drawArrowEditor, drawArrowGame, type BalloonArrowFx } from "./arrow-drawer.ts";
import { drawCornerInCell } from "./corner-drawer.ts";
import { drawCurtainInBoard } from "./curtain-drawer.ts";
import { drawKeyInCell } from "./key-drawer.ts";
import { drawPipeInBoard } from "./pipe-drawer.ts";
import { drawBomb, drawBombExplosion, drawBuff, drawController, drawFrozenOverlay, drawMovingWall, drawShrinkPipe, drawToggle } from "./mechanics-drawer.ts";
import { drawAreaBombEffect, drawCrossBombEffect, drawFireBombEffect, drawBalloonEffect, drawCandyMachineEffect, drawAutoRefreshEffect, type AreaBombEffectDrawState, type AutoRefreshEffectDrawState, type BalloonEffectDrawState, type CandyMachineEffectDrawState, type CrossBombEffectDrawState, type FireBombEffectDrawState } from "./buff-effects-drawer.ts";
import {
  drawEmptyCellDotsWithPulse,
  drawLaunchClickEffects,
  type DotPulseFxState,
  type LaunchClickFxState,
} from "./flight-fx.ts";
import { drawBlackHoleRegions, splitBlackHoleComponents } from "./black-hole-region-drawer.ts";
import { drawComboRewardFlights } from "./combo-reward-drawer.ts";
import { drawConfetti } from "./confetti-drawer.ts";
import type { ComboRewardFlight } from "../core/mechanics/combo.ts";
import type { ConfettiState } from "../core/mechanics/win-celebration.ts";
import {
  fillRoundedRegionCells,
  strokeRoundedRegionOutline,
  REGION_OUTER_CORNER_RADIUS,
} from "./region-outline.ts";
import type { SpawnEmergence } from "../core/mechanics/spawn.ts";

export type BoardRenderStyle = "editor" | "game";

export interface BoardDrawOptions {
  style?: BoardRenderStyle;
  /** 不绘制空余格圆点的占用格 */
  occupiedCells?: Set<string>;
  /** 随机消除湮灭进度 0~1，按 instanceId */
  vanishProgressById?: ReadonlyMap<number, number>;
  /** 定向气球同色箭膨胀/爆破 */
  balloonArrowFxById?: ReadonlyMap<number, BalloonArrowFx>;
  /** 黑洞吞噬旋转（instanceId → 弧度） */
  blackHoleFxById?: ReadonlyMap<number, { rotation: number; vanishProgress: number }>;
  movingWalls?: MovingWallItem[];
  frozenOverlays?: FrozenOverlayItem[];
  bombStates?: { bomb: BombItem; remaining: number | null }[];
  bombExplosion?: { cells: Vec2[]; progress: number } | null;
  bombs?: BombItem[];
  urgentBombRemaining?: number | null;
  shrinkPipes?: ShrinkPipeItem[];
  toggles?: ToggleItem[];
  controllers?: ControllerItem[];
  toggleFlashGroupIds?: Set<number>;
  buffs?: BuffItem[];
  /** 生成浮现（alpha + scale），按 instanceId */
  spawnEmergenceById?: ReadonlyMap<number, SpawnEmergence>;
  areaBombEffects?: AreaBombEffectDrawState[];
  crossBombEffects?: CrossBombEffectDrawState[];
  fireBombEffects?: FireBombEffectDrawState[];
  balloonEffects?: BalloonEffectDrawState[];
  candyMachineEffects?: CandyMachineEffectDrawState[];
  /** 排队等待引爆的定向气球（白色静止） */
  waitingBalloonEffects?: BalloonEffectDrawState[];
  /** 排队气球 buff id，buff 层跳过绘制以免被炸弹特效遮挡 */
  pendingBalloonBuffIds?: ReadonlySet<number>;
  playableCells?: Set<string>;
  blackHoleCells?: Set<string>;
  blackHoleRegionPhase?: number;
  /** 编辑器：无效格置灰 */
  invalidCells?: Set<string>;
  /** 无效格着色（不含默认白） */
  invalidCellColors?: ReadonlyMap<string, number>;
  /** 编辑器背景图（仅会话内） */
  editorBackgroundImage?: CanvasImageSource | null;
  /** @deprecated 单气球，优先使用 balloonEffects */
  balloonEffect?: BalloonEffectDrawState | null;
  autoRefreshEffect?: AutoRefreshEffectDrawState | null;
  comboRewardFlights?: ComboRewardFlight[];
  confetti?: ConfettiState | null;
  /** 点击发射时的彩色烟尘 */
  launchClickEffects?: readonly LaunchClickFxState[];
  /** 箭头经过后格点圆点呼吸 */
  dotPulseEffects?: readonly DotPulseFxState[];
}

const DEFAULT_DRAW_OPTIONS: BoardDrawOptions = { style: "editor" };

export function boardPixelSize(board: BoardSize): { width: number; height: number } {
  return {
    width: board.width * STEP - GAP,
    height: board.height * STEP - GAP,
  };
}

export function gameBoardContentOffsetPx(): number {
  return GAME_BOARD_BORDER_PAD_CELLS * STEP;
}

export function gameBoardPixelSize(board: BoardSize): { width: number; height: number } {
  const pad = gameBoardContentOffsetPx();
  const inner = boardPixelSize(board);
  return {
    width: inner.width + pad * 2,
    height: inner.height + pad * 2,
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

  resize(board: BoardSize, gameBorderPad = false): void {
    this.dpr = window.devicePixelRatio || 1;
    const { width, height } = gameBorderPad
      ? gameBoardPixelSize(board)
      : boardPixelSize(board);
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
    const cornerControllerHosts = this.buildCornerControllerHostMap(
      zoneCorners,
      topCorners,
      options.controllers,
    );

    this.resize(board, isGame);
    const { width, height } = isGame
      ? gameBoardPixelSize(board)
      : boardPixelSize(board);
    const contentPad = isGame ? gameBoardContentOffsetPx() : 0;
    this.ctx.fillStyle = isGame ? THEME.gamePanel : THEME.panel;
    this.ctx.fillRect(0, 0, width, height);

    if (!isGame && options.editorBackgroundImage) {
      this.ctx.drawImage(options.editorBackgroundImage, 0, 0, width, height);
    }

    if (isGame) this.ctx.save();
    if (contentPad > 0) this.ctx.translate(contentPad, contentPad);

    if (isGame && options.playableCells && options.invalidCellColors?.size) {
      for (const [key, colorId] of options.invalidCellColors) {
        if (!options.playableCells.has(key)) {
          const [xs, ys] = key.split(",");
          const x = Number(xs);
          const y = Number(ys);
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          const gx = x * STEP;
          const gy = y * STEP;
          this.ctx.fillStyle = invalidCellColorHex(colorId);
          roundRect(this.ctx, gx, gy, CELL, CELL, 4);
          this.ctx.fill();
        }
      }
    }

    if (!isGame) {
      for (let y = 0; y < board.height; y++) {
        for (let x = 0; x < board.width; x++) {
          const key = `${x},${y}`;
          const invalid = options.invalidCells?.has(key);
          const playable =
            !options.playableCells || options.playableCells.has(key);
          if (invalid || !playable) {
            continue;
          }
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
      if (options.invalidCells) {
        for (let y = 0; y < board.height; y++) {
          for (let x = 0; x < board.width; x++) {
            const key = `${x},${y}`;
            if (!options.invalidCells.has(key)) continue;
            const gx = x * STEP;
            const gy = y * STEP;
            const colorId = options.invalidCellColors?.get(key);
            this.ctx.fillStyle =
              colorId != null ? invalidCellColorHex(colorId) : "#FFFFFF";
            roundRect(this.ctx, gx, gy, CELL, CELL, 4);
            this.ctx.fill();
            if (colorId != null) {
              this.ctx.strokeStyle = "rgba(0, 0, 0, 0.12)";
              this.ctx.lineWidth = 1;
              this.ctx.stroke();
            }
          }
        }
      }
      if (options.blackHoleCells && options.blackHoleCells.size > 0) {
        for (const region of splitBlackHoleComponents(options.blackHoleCells)) {
          fillRoundedRegionCells(
            this.ctx,
            region,
            EDITOR_BLACK_HOLE_FILL,
            CELL,
            STEP,
            REGION_OUTER_CORNER_RADIUS,
          );
          strokeRoundedRegionOutline(
            this.ctx,
            region,
            EDITOR_BLACK_HOLE_STROKE,
            1,
            CELL,
            STEP,
            REGION_OUTER_CORNER_RADIUS,
          );
        }
      }
    }

    if (isGame && options.blackHoleCells && options.blackHoleCells.size > 0) {
      drawBlackHoleRegions(
        this.ctx,
        board,
        options.blackHoleCells,
        options.blackHoleRegionPhase ?? 0,
      );
    }

    if (isGame) {
      drawEmptyCellDotsWithPulse(
        this.ctx,
        board,
        options.occupiedCells,
        options.dotPulseEffects,
        options.playableCells,
        options.blackHoleCells,
      );
    }

    for (const zone of zones) {
      this.drawZone(zone);
    }

    if (options.toggles) {
      for (const toggle of options.toggles) {
        drawToggle(this.ctx, toggle, STEP);
      }
    }

    for (const arrow of zoneArrows) {
      this.drawArrow(
        arrow,
        launchableIds.has(arrow.instanceId),
        isGame,
        options.vanishProgressById?.get(arrow.instanceId) ?? 0,
        options.spawnEmergenceById?.get(arrow.instanceId),
        options.balloonArrowFxById?.get(arrow.instanceId),
      );
    }
    for (const pipe of zonePipes) {
      this.drawPipe(pipe);
    }
    for (const corner of zoneCorners) {
      this.drawCorner(corner, options, cornerControllerHosts);
    }
    for (const strip of zoneBundles) {
      this.drawBundle(strip);
    }

    // 顶层箭先于管道绘制，穿行管身格时由管道遮挡（避免穿模）
    for (const arrow of topArrows) {
      this.drawArrow(
        arrow,
        launchableIds.has(arrow.instanceId),
        isGame,
        options.vanishProgressById?.get(arrow.instanceId) ?? 0,
        options.spawnEmergenceById?.get(arrow.instanceId),
        options.balloonArrowFxById?.get(arrow.instanceId),
      );
    }
    for (const pipe of topPipes) {
      this.drawPipe(pipe);
    }
    if (options.shrinkPipes) {
      for (const strip of options.shrinkPipes) {
        drawShrinkPipe(this.ctx, strip, STEP);
      }
    }
    if (options.movingWalls) {
      for (const wall of options.movingWalls) {
        drawMovingWall(this.ctx, wall);
      }
    }

    if (options.buffs) {
      const pendingBalloons = options.pendingBalloonBuffIds;
      for (const buff of options.buffs) {
        if (buff.kind === 20 && pendingBalloons?.has(buff.instanceId)) continue;
        const emergence = options.spawnEmergenceById?.get(buff.instanceId);
        const holeFx = options.blackHoleFxById?.get(buff.instanceId);
        drawBuff(this.ctx, buff, STEP, emergence?.alpha ?? 1, {
          spawnScale: emergence?.scale,
          blackHoleRotation: holeFx?.rotation,
          blackHoleVanishProgress: holeFx?.vanishProgress,
        });
      }
    }

    if (options.frozenOverlays) {
      for (const overlay of options.frozenOverlays) {
        drawFrozenOverlay(this.ctx, overlay);
      }
    }
    for (const corner of topCorners) {
      this.drawCorner(corner, options, cornerControllerHosts);
    }
    for (const strip of topBundles) {
      this.drawBundle(strip);
    }

    if (options.controllers) {
      for (const ctrl of options.controllers) {
        if (cornerControllerHosts.has(ctrl.bindInstanceId)) continue;
        const flash = options.toggleFlashGroupIds?.has(ctrl.groupID) ?? false;
        drawController(this.ctx, ctrl, STEP, flash);
      }
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

    for (const areaBombEffect of options.areaBombEffects ?? []) {
      drawAreaBombEffect(this.ctx, areaBombEffect, STEP);
    }

    for (const crossBombEffect of options.crossBombEffects ?? []) {
      drawCrossBombEffect(this.ctx, crossBombEffect, STEP);
    }

    for (const fireBombEffect of options.fireBombEffects ?? []) {
      drawFireBombEffect(this.ctx, fireBombEffect, STEP);
    }

    for (const waitingBalloon of options.waitingBalloonEffects ?? []) {
      drawBalloonEffect(this.ctx, waitingBalloon, STEP);
    }

    const balloonEffects =
      options.balloonEffects ??
      (options.balloonEffect ? [options.balloonEffect] : []);
    for (const balloonEffect of balloonEffects) {
      drawBalloonEffect(this.ctx, balloonEffect, STEP);
    }

    for (const candyEffect of options.candyMachineEffects ?? []) {
      drawCandyMachineEffect(this.ctx, candyEffect, STEP);
    }

    if (options.autoRefreshEffect) {
      drawAutoRefreshEffect(this.ctx, options.autoRefreshEffect, STEP);
    }

    if (options.comboRewardFlights?.length) {
      drawComboRewardFlights(this.ctx, options.comboRewardFlights);
    }

    if (options.confetti) {
      drawConfetti(this.ctx, options.confetti);
    }

    if (isGame && options.launchClickEffects?.length) {
      drawLaunchClickEffects(this.ctx, options.launchClickEffects);
    }

    for (const curtain of curtains) {
      drawCurtainInBoard(this.ctx, curtain, STEP);
    }

    if (isGame) this.ctx.restore();

    if (isGame) {
      this.drawGameBoardBorder(width, height);
    }
  }

  private drawGameBoardBorder(width: number, height: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = THEME.gameBoardBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);
    ctx.restore();
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

  private buildCornerControllerHostMap(
    zoneCorners: CornerItem[],
    topCorners: CornerItem[],
    controllers: ControllerItem[] | undefined,
  ): Map<number, ControllerItem> {
    const cornerIds = new Set([
      ...zoneCorners.map((c) => c.instanceId),
      ...topCorners.map((c) => c.instanceId),
    ]);
    const map = new Map<number, ControllerItem>();
    for (const ctrl of controllers ?? []) {
      if (cornerIds.has(ctrl.bindInstanceId)) {
        map.set(ctrl.bindInstanceId, ctrl);
      }
    }
    return map;
  }

  private drawCorner(
    corner: CornerItem,
    options: BoardDrawOptions,
    cornerControllers: Map<number, ControllerItem>,
  ): void {
    const [x, y] = corner.occupiedPositions[0] ?? [0, 0];
    const [cx, cy] = cellCenter(x, y);
    const boundController = cornerControllers.get(corner.instanceId);
    const controllerFlash =
      boundController != null &&
      (options.toggleFlashGroupIds?.has(boundController.groupID) ?? false);
    const emergence = options.spawnEmergenceById?.get(corner.instanceId);
    this.withSpawnEmergence(cx, cy, emergence, () => {
      drawCornerInCell(this.ctx, x, y, corner, STEP, {
        boundController,
        controllerFlash,
      });
    });
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
    emergence?: SpawnEmergence,
    balloonFx?: BalloonArrowFx,
  ): void {
    const pos = arrow.occupiedPositions;
    if (pos.length === 0) return;
    const points = pos.map(([x, y]) => cellCenter(x, y));
    const cx = points.reduce((sum, [x]) => sum + x, 0) / points.length;
    const cy = points.reduce((sum, [, y]) => sum + y, 0) / points.length;
    this.withSpawnEmergence(cx, cy, emergence, () => {
      if (gameStyle) {
        drawArrowGame(this.ctx, arrow, launchable, vanishProgress, balloonFx);
      } else {
        drawArrowEditor(this.ctx, arrow, launchable);
      }
    });
  }

  private withSpawnEmergence(
    cx: number,
    cy: number,
    emergence: SpawnEmergence | undefined,
    draw: () => void,
  ): void {
    this.ctx.save();
    if (emergence) {
      this.ctx.globalAlpha = emergence.alpha;
      if (emergence.scale !== 1) {
        this.ctx.translate(cx, cy);
        this.ctx.scale(emergence.scale, emergence.scale);
        this.ctx.translate(-cx, -cy);
      }
    }
    draw();
    this.ctx.restore();
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
