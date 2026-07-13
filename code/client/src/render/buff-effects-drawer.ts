import type { Vec2 } from "../core/types.ts";
import { DIR_NAME } from "../core/types.ts";
import type { ArrowDebrisPiece } from "../core/mechanics/buff-effects.ts";
import { CELL, colorForId } from "./colors.ts";
import { drawScaledExplosionAt, drawBalloonAt, drawCandyMachineAt } from "./mechanics-drawer.ts";

export interface AreaBombEffectDrawState {
  progress: number;
  center: Vec2;
  bombRadius: 1 | 2;
  regionCells: Vec2[];
  debris: ArrowDebrisPiece[];
}

export interface CrossBombCellBlastDrawState {
  cell: Vec2;
  progress: number;
  debris: ArrowDebrisPiece | null;
}

export interface CrossBombEffectDrawState {
  center: Vec2;
  primedProgress: number;
  showPrimed: boolean;
  cellBlasts: CrossBombCellBlastDrawState[];
}

export interface FireBurningCellDrawState {
  cell: Vec2;
  progress: number;
  charProgress: number;
  seed: number;
  arrowColorId?: number;
}

export interface FireBombEffectDrawState {
  center: Vec2;
  regionCells: Vec2[];
  burstProgress: number;
  showBurst: boolean;
  burningCells: FireBurningCellDrawState[];
}

export interface BalloonEffectDrawState {
  cell: Vec2;
  colorId: number;
  colorProgress: number;
  inflateProgress: number;
  popProgress: number;
}

export interface CandyMachineShotDrawState {
  targetCell: Vec2;
  colorId: number;
  flightProgress: number;
  arrived: boolean;
}

export interface CandyMachineEffectDrawState {
  machineCell: Vec2;
  elapsed: number;
  shots: CandyMachineShotDrawState[];
}

const GAME_DIR_TRI: Record<string, [number, number][]> = {
  up: [[0, -8], [6, 4], [-6, 4]],
  down: [[0, 8], [6, -4], [-6, -4]],
  left: [[-8, 0], [4, 6], [4, -6]],
  right: [[8, 0], [-4, 6], [-4, -6]],
};

function cellCenter(x: number, y: number, step: number): [number, number] {
  return [x * step + CELL / 2, y * step + CELL / 2];
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shadeRgb(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + amount * 255)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function drawIsoBlockFace(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  topColor: string,
  leftColor: string,
  rightColor: string,
  rotation: number,
): void {
  const w = size * 0.46;
  const h = size * 0.26;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);

  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.lineTo(w, 0);
  ctx.lineTo(0, h);
  ctx.lineTo(-w, 0);
  ctx.closePath();
  ctx.fillStyle = topColor;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-w, 0);
  ctx.lineTo(0, h);
  ctx.lineTo(0, h + h * 0.85);
  ctx.lineTo(-w, h * 0.85);
  ctx.closePath();
  ctx.fillStyle = leftColor;
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(w, 0);
  ctx.lineTo(0, h);
  ctx.lineTo(0, h + h * 0.85);
  ctx.lineTo(w, h * 0.85);
  ctx.closePath();
  ctx.fillStyle = rightColor;
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawDebrisPiece(
  ctx: CanvasRenderingContext2D,
  piece: ArrowDebrisPiece,
  progress: number,
  step: number,
): void {
  const t = Math.min(1, Math.max(0, progress));
  const ease = 1 - (1 - t) ** 2.2;
  const [startCx, startCy] = cellCenter(piece.cell[0], piece.cell[1], step);
  const dist = piece.flySpeed * step * ease;
  const lift = -step * (0.12 + piece.seed * 0.22) * Math.sin(t * Math.PI);
  const px = startCx + Math.cos(piece.flyAngle) * dist;
  const py = startCy + Math.sin(piece.flyAngle) * dist * 0.78 + lift;
  const depthScale = (1 - t * 0.38) * (1 + Math.abs(lift) / step * 0.08);
  const alpha = (1 - t ** 1.45) * (t < 0.08 ? t / 0.08 : 1);
  const spin = piece.spin * ease;
  const size = step * 0.62 * depthScale;

  const base = colorForId(piece.colorId);
  const topColor = shadeRgb(base, 0.22);
  const leftColor = shadeRgb(base, -0.28);
  const rightColor = shadeRgb(base, -0.12);

  ctx.save();
  ctx.globalAlpha = alpha;
  drawIsoBlockFace(ctx, px, py, size, topColor, leftColor, rightColor, spin);

  if (piece.isHead && t < 0.72) {
    const dirName = DIR_NAME[piece.direction];
    const tri = GAME_DIR_TRI[dirName];
    if (tri) {
      const headScale = 0.55 * depthScale * (1 - t * 0.5);
      ctx.fillStyle = shadeRgb(base, 0.35);
      ctx.beginPath();
      ctx.moveTo(px + tri[0]![0] * headScale, py + tri[0]![1] * headScale - size * 0.35);
      ctx.lineTo(px + tri[1]![0] * headScale, py + tri[1]![1] * headScale - size * 0.35);
      ctx.lineTo(px + tri[2]![0] * headScale, py + tri[2]![1] * headScale - size * 0.35);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.restore();
}

function explosionRand(cellX: number, cellY: number, index: number): number {
  let h = (cellX * 374761393 + cellY * 668265263 + index * 1274126177) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

/** 火焰色调爆炸，scale=1 约一格范围。 */
function drawFireExplosionAt(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cellX: number,
  cellY: number,
  progress: number,
  scale: number,
  cellStep: number,
): void {
  ctx.save();

  if (progress < 0.22) {
    const flashT = progress / 0.22;
    const flashR = cellStep * (0.22 + flashT * 0.48) * scale;
    const flashAlpha = (1 - flashT) * 0.92;
    const flash = ctx.createRadialGradient(cx, cy, 0, cx, cy, flashR);
    flash.addColorStop(0, `rgba(255, 220, 200, ${flashAlpha})`);
    flash.addColorStop(0.25, `rgba(255, 120, 40, ${flashAlpha * 0.85})`);
    flash.addColorStop(0.55, `rgba(220, 45, 15, ${flashAlpha * 0.55})`);
    flash.addColorStop(1, "rgba(180, 40, 10, 0)");
    ctx.fillStyle = flash;
    ctx.beginPath();
    ctx.arc(cx, cy, flashR, 0, Math.PI * 2);
    ctx.fill();
  }

  const flameCount = Math.round(22 * Math.sqrt(scale));
  for (let i = 0; i < flameCount; i++) {
    const seed = explosionRand(cellX, cellY, i + 700);
    const seed2 = explosionRand(cellX, cellY, i + 800);
    const seed3 = explosionRand(cellX, cellY, i + 900);
    const angle = seed * Math.PI * 2;
    const speed = (0.28 + seed2 * 0.75) * cellStep * scale;
    const delay = seed3 * 0.1;
    const life = 0.45 + seed2 * 0.35;
    const t = (progress - delay) / life;
    if (t <= 0 || t >= 1) continue;

    const ease = 1 - (1 - t) ** 2;
    const dist = speed * ease;
    const rise = cellStep * (0.2 + seed * 0.65) * ease * scale;
    const px = cx + Math.cos(angle) * dist;
    const py = cy + Math.sin(angle) * dist * 0.55 - rise;
    const radius = cellStep * (0.1 + seed2 * 0.18) * scale * (0.5 + ease * 2);
    const alpha = (1 - t) ** 1.4 * (0.65 - progress * 0.12);

    const puff = ctx.createRadialGradient(px, py, 0, px, py, radius);
    puff.addColorStop(0, `rgba(255, 180, 100, ${alpha * 0.85})`);
    puff.addColorStop(0.35, `rgba(240, 70, 25, ${alpha * 0.65})`);
    puff.addColorStop(0.7, `rgba(180, 30, 12, ${alpha * 0.35})`);
    puff.addColorStop(1, "rgba(80, 20, 10, 0)");
    ctx.fillStyle = puff;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const smokeCount = Math.round(16 * Math.sqrt(scale));
  for (let i = 0; i < smokeCount; i++) {
    const seed = explosionRand(cellX, cellY, i + 1000);
    const seed2 = explosionRand(cellX, cellY, i + 1100);
    const angle = seed * Math.PI * 2;
    const speed = (0.35 + seed2 * 0.6) * cellStep * scale;
    const t = (progress - seed * 0.08) / (0.5 + seed2 * 0.35);
    if (t <= 0 || t >= 1) continue;
    const ease = 1 - (1 - t) ** 2;
    const px = cx + Math.cos(angle) * speed * ease;
    const py = cy + Math.sin(angle) * speed * ease * 0.6 - cellStep * 0.25 * ease * scale;
    const radius = cellStep * (0.12 + seed2 * 0.16) * scale * (0.7 + ease);
    const alpha = (1 - t) ** 1.5 * 0.45;
    const gray = 60 + Math.floor(seed * 40);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = `rgba(${gray + 30},${gray + 10},${gray},0.7)`;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  if (progress < 0.5) {
    const ringT = progress / 0.5;
    ctx.globalAlpha = (1 - ringT) * 0.42;
    ctx.strokeStyle = "rgba(255, 160, 60, 0.85)";
    ctx.lineWidth = 2 + (1 - ringT) * 5;
    ctx.beginPath();
    ctx.arc(cx, cy, cellStep * (0.18 + ringT * 0.75) * scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

export function drawAreaBombEffect(
  ctx: CanvasRenderingContext2D,
  effect: AreaBombEffectDrawState,
  step: number,
): void {
  const { progress, center, bombRadius, regionCells, debris } = effect;
  const [cx, cy] = cellCenter(center[0], center[1], step);
  const scale = bombRadius === 2 ? 2.55 : 1.55;

  drawScaledExplosionAt(ctx, cx, cy, center[0], center[1], progress, scale);

  if (progress < 0.55) {
    const ringT = progress / 0.55;
    const ringAlpha = (1 - ringT) * 0.22;
    const ringR = step * (bombRadius === 2 ? 2.35 : 1.35) * (0.35 + ringT * 0.95);
    ctx.save();
    ctx.globalAlpha = ringAlpha;
    ctx.strokeStyle = "rgba(255, 200, 120, 0.75)";
    ctx.lineWidth = 3 + (1 - ringT) * 6;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  for (const piece of debris) {
    drawDebrisPiece(ctx, piece, progress, step);
  }

  if (progress > 0.05 && progress < 0.75) {
    const dustAlpha = (1 - progress / 0.75) * 0.18;
    ctx.save();
    ctx.globalAlpha = dustAlpha;
    ctx.fillStyle = "rgba(180, 160, 140, 0.5)";
    for (const [x, y] of regionCells) {
      const [rx, ry] = cellCenter(x, y, step);
      const r = step * 0.38 * (0.5 + progress * 0.8);
      ctx.beginPath();
      ctx.arc(rx, ry, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

export function drawCrossBombEffect(
  ctx: CanvasRenderingContext2D,
  effect: CrossBombEffectDrawState,
  cellStep: number,
): void {
  const { center, primedProgress, showPrimed, cellBlasts } = effect;
  const [cx, cy] = cellCenter(center[0], center[1], cellStep);

  if (showPrimed && primedProgress > 0 && primedProgress < 1.02) {
    drawFireExplosionAt(
      ctx,
      cx,
      cy,
      center[0],
      center[1],
      primedProgress,
      1.05,
      cellStep,
    );
  }

  for (const blast of cellBlasts) {
    if (blast.progress <= 0 || blast.progress >= 1.02) continue;
    const [bx, by] = cellCenter(blast.cell[0], blast.cell[1], cellStep);
    const isCenter =
      blast.cell[0] === center[0] && blast.cell[1] === center[1];
    if (isCenter && showPrimed) continue;

    drawFireExplosionAt(
      ctx,
      bx,
      by,
      blast.cell[0],
      blast.cell[1],
      blast.progress,
      0.95,
      cellStep,
    );

    if (blast.debris) {
      drawDebrisPiece(ctx, blast.debris, blast.progress, cellStep);
    }
  }
}

function fireSeed(cellX: number, cellY: number, index: number): number {
  return explosionRand(cellX, cellY, index + 2200);
}

function drawFireSparkBurst(
  ctx: CanvasRenderingContext2D,
  center: Vec2,
  regionCells: Vec2[],
  progress: number,
  cellStep: number,
): void {
  const [cx, cy] = cellCenter(center[0], center[1], cellStep);
  drawFireExplosionAt(ctx, cx, cy, center[0], center[1], progress, 1.35, cellStep);

  const sparkCount = 36;
  for (let i = 0; i < sparkCount; i++) {
    const seed = fireSeed(center[0], center[1], i);
    const seed2 = fireSeed(center[0], center[1], i + 50);
    const target = regionCells[Math.floor(seed * regionCells.length)] ?? center;
    const [tx, ty] = cellCenter(target[0], target[1], cellStep);
    const angle = Math.atan2(ty - cy, tx - cx) + (seed2 - 0.5) * 0.9;
    const speed = cellStep * (0.45 + seed2 * 1.1);
    const delay = seed * 0.12;
    const life = 0.55 + seed2 * 0.35;
    const t = (progress - delay) / life;
    if (t <= 0 || t >= 1) continue;
    const ease = 1 - (1 - t) ** 2.5;
    const px = cx + Math.cos(angle) * speed * ease;
    const py = cy + Math.sin(angle) * speed * ease * 0.75 - cellStep * 0.15 * ease;
    const r = 2 + seed2 * 4 * (1 - t * 0.5);
    const alpha = (1 - t) ** 1.1 * 0.95;
    ctx.save();
    ctx.globalAlpha = alpha;
    const grad = ctx.createRadialGradient(px, py, 0, px, py, r * 2.2);
    grad.addColorStop(0, "rgba(255, 255, 180, 1)");
    grad.addColorStop(0.4, "rgba(255, 210, 60, 0.85)");
    grad.addColorStop(1, "rgba(255, 100, 20, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, r * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawCellCharVanish(
  ctx: CanvasRenderingContext2D,
  cellX: number,
  cellY: number,
  charProgress: number,
  _seed: number,
  arrowColorId: number | undefined,
  cellStep: number,
): void {
  if (charProgress <= 0) return;

  const [cx, cy] = cellCenter(cellX, cellY, cellStep);
  const shrink = 1 - charProgress * 0.35;
  const alpha = (1 - charProgress) ** 1.35;
  const bodyW = CELL * 0.68 * shrink;
  const bodyH = CELL * 0.48 * shrink;
  const baseHex =
    arrowColorId != null ? colorForId(arrowColorId) : "#888888";
  const charAmt = Math.min(1, charProgress * 1.15);
  const bodyColor = shadeRgb(baseHex, -0.55 * charAmt - 0.25);
  const edgeColor = shadeRgb(baseHex, -0.75 * charAmt - 0.35);

  ctx.save();
  ctx.globalAlpha = alpha * 0.92;
  ctx.fillStyle = bodyColor;
  ctx.strokeStyle = edgeColor;
  ctx.lineWidth = 1.2;
  const rx = cx - bodyW / 2;
  const ry = cy - bodyH / 2;
  ctx.beginPath();
  ctx.roundRect(rx, ry, bodyW, bodyH, bodyH * 0.22);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = alpha * 0.75;
  ctx.strokeStyle = "rgba(20, 12, 8, 0.85)";
  ctx.lineWidth = 1;
  const crackCount = 4;
  for (let i = 0; i < crackCount; i++) {
    const a = fireSeed(cellX, cellY, i + 3300) * Math.PI * 2;
    const len = bodyW * (0.25 + fireSeed(cellX, cellY, i + 3400) * 0.35);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len * 0.65);
    ctx.stroke();
  }
  ctx.restore();

  const crumbCount = 8;
  for (let i = 0; i < crumbCount; i++) {
    const s1 = fireSeed(cellX, cellY, i + 3500);
    const s2 = fireSeed(cellX, cellY, i + 3600);
    const angle = s1 * Math.PI * 2;
    const dist = cellStep * (0.08 + charProgress * 0.42) * (0.4 + s2);
    const px = cx + Math.cos(angle) * dist;
    const py = cy + Math.sin(angle) * dist * 0.55 + charProgress * cellStep * 0.12;
    const r = cellStep * (0.025 + s2 * 0.035) * (1 - charProgress * 0.4);
    ctx.save();
    ctx.globalAlpha = alpha * (0.55 - charProgress * 0.35);
    ctx.fillStyle = `rgba(${28 + s1 * 18}, ${18 + s2 * 12}, ${12 + s1 * 8}, 0.9)`;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function traceFlameIconPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  halfW: number,
  flameH: number,
  flick: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x - halfW, baseY);
  ctx.bezierCurveTo(
    x - halfW,
    baseY - flameH * 0.2,
    x - halfW * 0.92,
    baseY - flameH * 0.46,
    x - halfW * 0.6,
    baseY - flameH * 0.66,
  );
  ctx.bezierCurveTo(
    x - halfW * 0.36,
    baseY - flameH * 0.8,
    x - halfW * 0.1,
    baseY - flameH * (0.88 + flick * 0.05),
    x - halfW * 0.02,
    baseY - flameH * (0.84 + flick * 0.03),
  );
  ctx.quadraticCurveTo(
    x,
    baseY - flameH * (0.76 + flick * 0.04),
    x + halfW * 0.12,
    baseY - flameH * (0.94 + flick * 0.06),
  );
  ctx.quadraticCurveTo(
    x + halfW * 0.4,
    baseY - flameH * (0.98 + flick * 0.08),
    x + halfW * 0.56,
    baseY - flameH * 0.7,
  );
  ctx.bezierCurveTo(
    x + halfW * 0.92,
    baseY - flameH * 0.46,
    x + halfW,
    baseY - flameH * 0.2,
    x + halfW,
    baseY,
  );
  ctx.quadraticCurveTo(x, baseY + halfW * 0.1, x - halfW, baseY);
  ctx.closePath();
}

function drawCellBurningFlame(
  ctx: CanvasRenderingContext2D,
  cellX: number,
  cellY: number,
  progress: number,
  seed: number,
  cellStep: number,
): void {
  const [cx, cy] = cellCenter(cellX, cellY, cellStep);
  const fadeIn = Math.min(1, progress / 0.14);
  const fadeOut =
    progress > 0.74 ? Math.max(0, 1 - (progress - 0.74) / 0.26) : 1;
  const alpha = fadeIn * fadeOut;
  if (alpha <= 0.01) return;

  const t = progress;
  const sway = Math.sin(t * 11 + seed * 8) * cellStep * 0.04;
  const pulse = 0.94 + Math.sin(t * 19 + seed * 11) * 0.06;
  const flick = Math.sin(t * 15 + seed * 7) * 0.12;
  const halfW = cellStep * 0.42 * pulse;
  const flameH = cellStep * 0.75 * pulse;
  const baseY = cy + cellStep * 0.16;
  const x = cx + sway;

  ctx.save();
  ctx.globalAlpha = alpha * 0.74;
  traceFlameIconPath(ctx, x, baseY, halfW, flameH, flick);
  const fillGrad = ctx.createRadialGradient(
    x,
    baseY - flameH * 0.06,
    0,
    x,
    baseY - flameH * 0.32,
    halfW * 1.05,
  );
  fillGrad.addColorStop(0, "#FFF59D");
  fillGrad.addColorStop(0.3, "#FFB74D");
  fillGrad.addColorStop(0.62, "#FF8A65");
  fillGrad.addColorStop(1, "#FF7043");
  ctx.fillStyle = fillGrad;
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 138, 101, 0.42)";
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = alpha * 0.48;
  traceFlameIconPath(ctx, x, baseY, halfW, flameH, flick);
  ctx.clip();
  ctx.strokeStyle = "rgba(255, 171, 145, 0.45)";
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.moveTo(x - halfW * 0.42, baseY - flameH * 0.12);
  ctx.bezierCurveTo(
    x - halfW * 0.28,
    baseY - flameH * 0.38,
    x - halfW * 0.12,
    baseY - flameH * 0.58,
    x - halfW * 0.04,
    baseY - flameH * 0.72,
  );
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + halfW * 0.38, baseY - flameH * 0.1);
  ctx.bezierCurveTo(
    x + halfW * 0.24,
    baseY - flameH * 0.34,
    x + halfW * 0.1,
    baseY - flameH * 0.52,
    x + halfW * 0.06,
    baseY - flameH * 0.68,
  );
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = alpha * 0.62;
  const coreGrad = ctx.createRadialGradient(
    x,
    baseY,
    0,
    x,
    baseY - flameH * 0.12,
    halfW * 0.42,
  );
  coreGrad.addColorStop(0, "rgba(255, 249, 196, 0.85)");
  coreGrad.addColorStop(0.55, "rgba(255, 213, 128, 0.38)");
  coreGrad.addColorStop(1, "rgba(255, 183, 77, 0)");
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.ellipse(
    x,
    baseY - flameH * 0.04,
    halfW * 0.34,
    halfW * 0.2,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();
}

export function drawFireBombEffect(
  ctx: CanvasRenderingContext2D,
  effect: FireBombEffectDrawState,
  cellStep: number,
): void {
  if (effect.showBurst && effect.burstProgress > 0) {
    drawFireSparkBurst(
      ctx,
      effect.center,
      effect.regionCells,
      effect.burstProgress,
      cellStep,
    );
  }

  for (const burn of effect.burningCells) {
    if (burn.progress <= 0 || burn.progress >= 1.01) continue;
    if (burn.charProgress > 0) {
      drawCellCharVanish(
        ctx,
        burn.cell[0],
        burn.cell[1],
        burn.charProgress,
        burn.seed,
        burn.arrowColorId,
        cellStep,
      );
    }
    drawCellBurningFlame(
      ctx,
      burn.cell[0],
      burn.cell[1],
      burn.progress,
      burn.seed,
      cellStep,
    );
  }
}

export function drawBalloonEffect(
  ctx: CanvasRenderingContext2D,
  effect: BalloonEffectDrawState,
  cellStep: number,
): void {
  const [x, y] = effect.cell;
  const [cx, cy] = cellCenter(x, y, cellStep);
  const maxScale = 1 + effect.inflateProgress * 0.42;
  const popScale = effect.popProgress > 0 ? maxScale * (1 - effect.popProgress) : maxScale;
  const alpha = effect.popProgress > 0 ? 1 - effect.popProgress * 0.85 : 1;

  if (effect.popProgress > 0) {
    drawScaledExplosionAt(
      ctx,
      cx,
      cy,
      x,
      y,
      effect.popProgress,
      1.15,
    );
  }

  if (effect.popProgress < 0.95) {
    drawBalloonAt(ctx, cx, cy, cellStep, {
      colorId: effect.colorId,
      colorMix: effect.colorProgress,
      scale: popScale,
      alpha,
    });
  }
}

function drawFlyingCandy(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  colorId: number,
): void {
  const fill = colorForId(colorId);
  ctx.save();
  ctx.shadowColor = "rgba(80, 50, 100, 0.35)";
  ctx.shadowBlur = radius * 0.45;
  ctx.shadowOffsetY = radius * 0.12;
  const grad = ctx.createRadialGradient(
    x - radius * 0.32,
    y - radius * 0.32,
    0,
    x,
    y,
    radius,
  );
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.3, fill);
  grad.addColorStop(1, fill);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.72)";
  ctx.lineWidth = Math.max(1.8, radius * 0.14);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.42)";
  ctx.beginPath();
  ctx.arc(x - radius * 0.28, y - radius * 0.28, radius * 0.26, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawCandyMachineEffect(
  ctx: CanvasRenderingContext2D,
  effect: CandyMachineEffectDrawState,
  cellStep: number,
): void {
  const [mx, my] = effect.machineCell;
  const [mcx, mcy] = cellCenter(mx, my, cellStep);
  const hasFlying = effect.shots.some(
    (s) => !s.arrived && s.flightProgress > 0 && s.flightProgress < 1,
  );
  const buttonPulse = hasFlying
    ? 0.5 + Math.sin(effect.elapsed * 16) * 0.5
    : 0;
  drawCandyMachineAt(ctx, mcx, mcy, cellStep, { buttonPulse });

  const candyR = CELL * 0.22;

  for (const shot of effect.shots) {
    if (shot.arrived) continue;
    if (shot.flightProgress <= 0) continue;
    const [tx, ty] = shot.targetCell;
    const [tcx, tcy] = cellCenter(tx, ty, cellStep);
    const ease = shot.flightProgress * (2 - shot.flightProgress);
    const px = mcx + (tcx - mcx) * ease;
    const py = mcy + (tcy - mcy) * ease;

    if (shot.flightProgress > 0.04) {
      const trailCount = 6;
      for (let i = 0; i < trailCount; i++) {
        const t =
          shot.flightProgress * (1 - (i + 1) / (trailCount + 1.2));
        if (t <= 0) continue;
        const te = t * (2 - t);
        const trailX = mcx + (tcx - mcx) * te;
        const trailY = mcy + (tcy - mcy) * te;
        ctx.save();
        ctx.globalAlpha = 0.18 + (1 - i / trailCount) * 0.38;
        drawFlyingCandy(ctx, trailX, trailY, candyR * 0.78, shot.colorId);
        ctx.restore();
      }
    }

    drawFlyingCandy(ctx, px, py, candyR, shot.colorId);
  }
}

export interface AutoRefreshEffectDrawState {
  progress: number;
  boardWidth: number;
  boardHeight: number;
  seed: number;
}

function hash01(i: number, seed: number): number {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function drawSparkStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rotation: number,
  alpha: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalAlpha *= alpha;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
    const a2 = a + Math.PI / 4;
    ctx.lineTo(Math.cos(a2) * radius * 0.28, Math.sin(a2) * radius * 0.28);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawMagicWand(
  ctx: CanvasRenderingContext2D,
  pivotX: number,
  pivotY: number,
  length: number,
  angle: number,
  glow: number,
): void {
  ctx.save();
  ctx.translate(pivotX, pivotY);
  ctx.rotate(angle);

  const tipY = -length;
  const gripY = length * 0.06;

  if (glow > 0.04) {
    const aura = ctx.createRadialGradient(0, tipY, 0, 0, tipY, length * 0.75);
    aura.addColorStop(0, `rgba(255, 255, 255, ${0.42 * glow})`);
    aura.addColorStop(0.35, `rgba(196, 181, 253, ${0.22 * glow})`);
    aura.addColorStop(1, "rgba(196, 181, 253, 0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, tipY, length * 0.75, 0, Math.PI * 2);
    ctx.fill();
  }

  const shaftW = Math.max(1.6, length * 0.065);
  ctx.lineCap = "round";

  ctx.strokeStyle = "#292524";
  ctx.lineWidth = shaftW;
  ctx.beginPath();
  ctx.moveTo(0, gripY);
  ctx.lineTo(0, tipY + length * 0.2);
  ctx.stroke();

  ctx.strokeStyle = "#a16207";
  ctx.lineWidth = Math.max(1.1, length * 0.04);
  ctx.beginPath();
  ctx.moveTo(0, tipY + length * 0.19);
  ctx.lineTo(0, tipY + length * 0.27);
  ctx.stroke();

  ctx.strokeStyle = "#e7e5e4";
  ctx.lineWidth = Math.max(1.3, length * 0.05);
  ctx.beginPath();
  ctx.moveTo(0, tipY + length * 0.26);
  ctx.lineTo(0, tipY + length * 0.04);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  drawSparkStar(ctx, 0, tipY, length * 0.12, Math.PI / 4, 1);
  ctx.fillStyle = "#e9d5ff";
  drawSparkStar(ctx, 0, tipY, length * 0.07, 0, 0.95);

  if (glow > 0.12) {
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.28 * glow})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, tipY);
    ctx.quadraticCurveTo(length * 0.22, tipY - length * 0.18, length * 0.34, tipY + length * 0.06);
    ctx.stroke();
  }

  ctx.restore();
}

/** 僵局自动刷新：全屏魔法杖挥舞 + 星闪雪花 */
export function drawAutoRefreshEffect(
  ctx: CanvasRenderingContext2D,
  effect: AutoRefreshEffectDrawState,
  cellStep: number,
): void {
  const boardW = effect.boardWidth * cellStep - 1;
  const boardH = effect.boardHeight * cellStep - 1;
  const t = effect.progress;
  const intensity = Math.sin(Math.min(1, t * 1.15) * Math.PI);
  const fadeOut = t > 0.82 ? 1 - (t - 0.82) / 0.18 : 1;
  const alpha = intensity * fadeOut;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, boardW, boardH);
  ctx.clip();

  const vignette = ctx.createRadialGradient(
    boardW * 0.5,
    boardH * 0.5,
    boardW * 0.05,
    boardW * 0.5,
    boardH * 0.5,
    Math.max(boardW, boardH) * 0.75,
  );
  vignette.addColorStop(0, `rgba(196, 181, 253, ${0.22 * alpha})`);
  vignette.addColorStop(0.55, `rgba(129, 140, 248, ${0.12 * alpha})`);
  vignette.addColorStop(1, "rgba(30, 27, 75, 0)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, boardW, boardH);

  const sparkleCount = 72;
  for (let i = 0; i < sparkleCount; i++) {
    const hx = hash01(i, effect.seed);
    const hy = hash01(i + 50, effect.seed);
    const hs = hash01(i + 100, effect.seed);
    const hr = hash01(i + 150, effect.seed);
    const baseX = hx * boardW;
    const drift = (t * 0.35 + hs * 0.2) % 1;
    const baseY = ((hy + drift) % 1) * boardH;
    const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(t * Math.PI * 4 + hs * 20));
    const size = (3 + hs * 5) * (0.7 + 0.3 * twinkle);
    const rot = hr * Math.PI * 2 + t * 2.4;
    const colors = ["#ffffff", "#e0e7ff", "#fef08a", "#ddd6fe"];
    ctx.fillStyle = colors[Math.floor(hr * colors.length)]!;
    drawSparkStar(ctx, baseX, baseY, size, rot, alpha * twinkle * 0.92);
  }

  const centerX = boardW * 0.5;
  const centerY = boardH * 0.5;
  const wandLen = cellStep * 2.15;
  const swingT = Math.min(1, t / 0.72);
  const eased = swingT * swingT * (3 - 2 * swingT);
  const angle = 0.95 - eased * 1.85;
  const wandScale = Math.min(1, t * 5) * alpha;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.scale(wandScale, wandScale);
  drawMagicWand(ctx, 0, 0, wandLen, angle, alpha);
  ctx.restore();

  ctx.restore();
}
