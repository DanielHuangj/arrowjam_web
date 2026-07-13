import type { BombItem, BuffItem, FrozenOverlayItem, MovingWallItem } from "../core/types.ts";
import type { Vec2 } from "../core/types.ts";
import { frozenHealthViewPathIndex } from "@arrowjaw/shared";
import { vecKey } from "../core/types.ts";
import { STEP, CELL, colorForId } from "./colors.ts";

const WALL_INSET = 1.5;
const BRICK_MORTAR = "#4a4e57";
const BRICK_FACE = "#6b6f78";
const BRICK_FACE_ALT = "#5c6069";
const BRICK_HIGHLIGHT = "#8b909a";
const WALL_SHADOW = "rgba(0,0,0,0.35)";

function cellCenter(x: number, y: number): [number, number] {
  return [x * STEP + CELL / 2, y * STEP + CELL / 2];
}

function cellRect(cx: number, cy: number): {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} {
  return {
    x0: cx * STEP + WALL_INSET,
    y0: cy * STEP + WALL_INSET,
    x1: (cx + 1) * STEP - WALL_INSET,
    y1: (cy + 1) * STEP - WALL_INSET,
  };
}

function paintBrickTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const rowH = Math.max(7, Math.round(STEP * 0.24));
  const brickW = Math.max(14, Math.round(STEP * 0.46));
  const mortar = 2;

  ctx.fillStyle = BRICK_MORTAR;
  ctx.fillRect(x, y, w, h);

  let row = 0;
  for (let py = y; py < y + h; py += rowH) {
    const rh = Math.min(rowH, y + h - py);
    const offset = row % 2 === 0 ? 0 : Math.floor(brickW / 2);
    for (let px = x - offset; px < x + w; px += brickW) {
      const bx = Math.max(x, px);
      const bw = Math.min(brickW - mortar, x + w - bx);
      if (bw <= 0) continue;
      const by = py + mortar / 2;
      const bh = rh - mortar;
      ctx.fillStyle = (row + Math.floor(px / brickW)) % 2 === 0 ? BRICK_FACE : BRICK_FACE_ALT;
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = BRICK_HIGHLIGHT;
      ctx.fillRect(bx, by, bw, 2);
    }
    row += 1;
  }
}

function drawWallOutline(
  ctx: CanvasRenderingContext2D,
  cells: Vec2[],
  cellSet: Set<string>,
): void {
  ctx.save();
  ctx.strokeStyle = "#2f3339";
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();

  for (const [cx, cy] of cells) {
    const { x0, y0, x1, y1 } = cellRect(cx, cy);
    if (!cellSet.has(vecKey([cx, cy - 1]))) {
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y0);
    }
    if (!cellSet.has(vecKey([cx, cy + 1]))) {
      ctx.moveTo(x0, y1);
      ctx.lineTo(x1, y1);
    }
    if (!cellSet.has(vecKey([cx - 1, cy]))) {
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0, y1);
    }
    if (!cellSet.has(vecKey([cx + 1, cy]))) {
      ctx.moveTo(x1, y0);
      ctx.lineTo(x1, y1);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function orthoAdjacent(a: Vec2, b: Vec2): boolean {
  const dx = Math.abs(a[0] - b[0]);
  const dy = Math.abs(a[1] - b[1]);
  return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
}

function splitConnectedCellGroups(cells: Vec2[]): Vec2[][] {
  const pending = new Map(cells.map((c) => [vecKey(c), c]));
  const groups: Vec2[][] = [];

  for (const cell of cells) {
    const startKey = vecKey(cell);
    if (!pending.has(startKey)) continue;

    const group: Vec2[] = [];
    const queue = [cell];
    pending.delete(startKey);

    while (queue.length > 0) {
      const cur = queue.pop()!;
      group.push(cur);
      for (const other of pending.values()) {
        if (!orthoAdjacent(cur, other)) continue;
        pending.delete(vecKey(other));
        queue.push(other);
      }
    }
    groups.push(group);
  }

  return groups;
}

function drawMovingWallGroup(
  ctx: CanvasRenderingContext2D,
  cells: Vec2[],
): void {
  if (cells.length === 0) return;

  const cellSet = new Set(cells.map((p) => vecKey(p)));
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  const bx = minX * STEP + WALL_INSET;
  const by = minY * STEP + WALL_INSET;
  const bw = (maxX - minX + 1) * STEP - WALL_INSET * 2;
  const bh = (maxY - minY + 1) * STEP - WALL_INSET * 2;

  ctx.save();

  ctx.beginPath();
  for (const [cx, cy] of cells) {
    const { x0, y0, x1, y1 } = cellRect(cx, cy);
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
  }
  ctx.clip();

  ctx.fillStyle = WALL_SHADOW;
  ctx.fillRect(bx + 2, by + 3, bw, bh);

  paintBrickTexture(ctx, bx - STEP, by - STEP, bw + STEP * 2, bh + STEP * 2);

  ctx.restore();

  drawWallOutline(ctx, cells, cellSet);
}

export function drawMovingWall(
  ctx: CanvasRenderingContext2D,
  wall: MovingWallItem,
): void {
  const cells = wall.occupiedPositions;
  if (cells.length === 0) return;

  for (const group of splitConnectedCellGroups(cells)) {
    drawMovingWallGroup(ctx, group);
  }
}

const ICE_INSET = 1.5;
const ICE_HIGHLIGHT = "#ecfeff";
const ICE_FACE = "#a5f3fc";
const ICE_FACE_ALT = "#7dd3fc";
const ICE_DEEP = "#38bdf8";
const ICE_OUTLINE = "#0e7490";

function paintIceTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const grad = ctx.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, ICE_HIGHLIGHT);
  grad.addColorStop(0.45, ICE_FACE);
  grad.addColorStop(1, ICE_DEEP);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  const streakH = Math.max(6, Math.round(STEP * 0.2));
  let row = 0;
  for (let py = y; py < y + h; py += streakH) {
    const rh = Math.min(streakH, y + h - py);
    const offset = row % 2 === 0 ? 0 : Math.floor(STEP * 0.22);
    for (let px = x - offset; px < x + w; px += STEP * 0.44) {
      const sx = Math.max(x, px);
      const sw = Math.min(STEP * 0.4, x + w - sx);
      if (sw <= 0) continue;
      ctx.fillStyle = row % 2 === 0 ? ICE_FACE_ALT : "rgba(255,255,255,0.22)";
      ctx.fillRect(sx, py + 1, sw, Math.max(1, rh - 2));
    }
    row += 1;
  }

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  for (let i = 0; i < 6; i++) {
    const sx = x + ((i * 37) % Math.max(1, w - 4)) + 2;
    const sy = y + ((i * 53) % Math.max(1, h - 4)) + 2;
    ctx.beginPath();
    ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawIceOutline(
  ctx: CanvasRenderingContext2D,
  cells: Vec2[],
  cellSet: Set<string>,
): void {
  ctx.save();
  ctx.strokeStyle = ICE_OUTLINE;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();

  for (const [cx, cy] of cells) {
    const { x0, y0, x1, y1 } = cellRect(cx, cy);
    if (!cellSet.has(vecKey([cx, cy - 1]))) {
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y0);
    }
    if (!cellSet.has(vecKey([cx, cy + 1]))) {
      ctx.moveTo(x0, y1);
      ctx.lineTo(x1, y1);
    }
    if (!cellSet.has(vecKey([cx - 1, cy]))) {
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0, y1);
    }
    if (!cellSet.has(vecKey([cx + 1, cy]))) {
      ctx.moveTo(x1, y0);
      ctx.lineTo(x1, y1);
    }
  }
  ctx.stroke();
  ctx.restore();
}

export function drawFrozenOverlay(
  ctx: CanvasRenderingContext2D,
  overlay: FrozenOverlayItem,
): void {
  const cells = overlay.occupiedPositions;
  if (cells.length === 0) return;

  const cellSet = new Set(cells.map((p) => vecKey(p)));
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  const bx = minX * STEP + ICE_INSET;
  const by = minY * STEP + ICE_INSET;
  const bw = (maxX - minX + 1) * STEP - ICE_INSET * 2;
  const bh = (maxY - minY + 1) * STEP - ICE_INSET * 2;

  ctx.save();

  ctx.beginPath();
  for (const [cx, cy] of cells) {
    const { x0, y0, x1, y1 } = cellRect(cx, cy);
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
  }
  ctx.clip();

  paintIceTexture(ctx, bx - STEP, by - STEP, bw + STEP * 2, bh + STEP * 2);

  ctx.restore();

  drawIceOutline(ctx, cells, cellSet);

  const healthIdx = Math.min(
    frozenHealthViewPathIndex(cells.length),
    cells.length - 1,
  );
  const [hx, hy] = cells[healthIdx]!;
  const centerX = hx * STEP + CELL / 2;
  const centerY = hy * STEP + CELL / 2;
  const fontSize = Math.max(12, Math.round(STEP * 0.42));
  ctx.save();
  ctx.font = `bold ${fontSize}px system-ui,sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#0c4a6e";
  ctx.fillStyle = "#ffffff";
  ctx.strokeText(String(overlay.health), centerX, centerY);
  ctx.fillText(String(overlay.health), centerX, centerY);
  ctx.restore();
}

export function drawBomb(
  ctx: CanvasRenderingContext2D,
  bomb: BombItem,
  remaining: number | null,
): void {
  const [x, y] = bomb.occupiedPositions[0] ?? [0, 0];
  const [cx, cy] = cellCenter(x, y);
  const r = STEP * 0.24;
  const active = remaining != null;

  ctx.save();

  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(cx + 1.5, cy + 2.5, r * 0.95, r * 0.82, 0, 0, Math.PI * 2);
  ctx.fill();

  const bodyGrad = ctx.createRadialGradient(
    cx - r * 0.35,
    cy - r * 0.4,
    r * 0.15,
    cx,
    cy,
    r,
  );
  if (active) {
    bodyGrad.addColorStop(0, "#5c636a");
    bodyGrad.addColorStop(0.55, "#343a40");
    bodyGrad.addColorStop(1, "#1a1d21");
  } else {
    bodyGrad.addColorStop(0, "#868e96");
    bodyGrad.addColorStop(0.55, "#6c757d");
    bodyGrad.addColorStop(1, "#495057");
  }
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.38)";
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.28, cy - r * 0.32, r * 0.26, r * 0.18, -0.5, 0, Math.PI * 2);
  ctx.fill();

  const fuseEndX = cx + r * 0.35;
  const fuseEndY = cy - r - STEP * 0.12;
  ctx.strokeStyle = "#8d6e4c";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, cy - r + 2);
  ctx.quadraticCurveTo(cx + r * 0.15, cy - r - 4, fuseEndX, fuseEndY);
  ctx.stroke();

  if (active) {
    const sparkR = 3 + Math.sin(remaining * 8) * 0.8;
    const sparkGrad = ctx.createRadialGradient(
      fuseEndX,
      fuseEndY - 2,
      0,
      fuseEndX,
      fuseEndY - 2,
      sparkR + 2,
    );
    sparkGrad.addColorStop(0, "#fff3bf");
    sparkGrad.addColorStop(0.5, "#ffd43b");
    sparkGrad.addColorStop(1, "rgba(255,107,107,0)");
    ctx.fillStyle = sparkGrad;
    ctx.beginPath();
    ctx.arc(fuseEndX, fuseEndY - 2, sparkR + 2, 0, Math.PI * 2);
    ctx.fill();

    const fontSize = Math.max(11, Math.round(r * 1.15));
    const label = String(Math.ceil(remaining));
    ctx.font = `bold ${fontSize}px system-ui,sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#212529";
    ctx.fillStyle = "#ffffff";
    ctx.strokeText(label, cx, cy + 1);
    ctx.fillText(label, cx, cy + 1);
  }

  ctx.restore();
}

export function drawBombExplosion(
  ctx: CanvasRenderingContext2D,
  cells: Vec2[],
  progress: number,
): void {
  for (const [cellX, cellY] of cells) {
    const [cx, cy] = cellCenter(cellX, cellY);
    drawScaledExplosionAt(ctx, cx, cy, cellX, cellY, progress, 1);
  }
}

function explosionHash(cellX: number, cellY: number, index: number): number {
  let h = (cellX * 374761393 + cellY * 668265263 + index * 1274126177) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function explosionRand(cellX: number, cellY: number, index: number): number {
  return explosionHash(cellX, cellY, index) / 0xffffffff;
}

export function drawScaledExplosionAt(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cellX: number,
  cellY: number,
  progress: number,
  scale: number,
): void {
  ctx.save();

  if (progress < 0.18) {
    const flashT = progress / 0.18;
    const flashR = STEP * (0.25 + flashT * 0.55) * scale;
    const flashAlpha = (1 - flashT) * 0.85;
    const flash = ctx.createRadialGradient(cx, cy, 0, cx, cy, flashR);
    flash.addColorStop(0, `rgba(255, 248, 220, ${flashAlpha})`);
    flash.addColorStop(0.35, `rgba(255, 180, 80, ${flashAlpha * 0.65})`);
    flash.addColorStop(1, "rgba(120, 80, 60, 0)");
    ctx.fillStyle = flash;
    ctx.beginPath();
    ctx.arc(cx, cy, flashR, 0, Math.PI * 2);
    ctx.fill();
  }

  const smokeCount = Math.round(28 * Math.sqrt(scale));
  for (let i = 0; i < smokeCount; i++) {
    const seed = explosionRand(cellX, cellY, i);
    const seed2 = explosionRand(cellX, cellY, i + 100);
    const seed3 = explosionRand(cellX, cellY, i + 200);
    const angle = seed * Math.PI * 2;
    const speed = (0.35 + seed2 * 0.9) * STEP * scale;
    const delay = seed3 * 0.12;
    const life = 0.55 + seed2 * 0.4;
    const t = (progress - delay) / life;
    if (t <= 0 || t >= 1) continue;

    const ease = 1 - (1 - t) ** 2;
    const dist = speed * ease;
    const rise = STEP * (0.15 + seed * 0.55) * ease * scale;
    const px = cx + Math.cos(angle) * dist;
    const py = cy + Math.sin(angle) * dist * 0.65 - rise;
    const baseSize = STEP * (0.14 + seed2 * 0.22) * scale;
    const radius = baseSize * (0.6 + ease * 2.2);
    const alpha = (1 - t) ** 1.6 * (0.55 - progress * 0.15);

    const gray = 72 + Math.floor(seed * 48);
    const warm = Math.floor(seed2 * 28);
    const r = gray + warm;
    const g = gray + Math.floor(warm * 0.5);
    const b = gray - Math.floor(seed3 * 18);

    const puff = ctx.createRadialGradient(px, py, 0, px, py, radius);
    puff.addColorStop(0, `rgba(${r},${g},${b},${alpha * 0.75})`);
    puff.addColorStop(0.45, `rgba(${r - 8},${g - 8},${b - 6},${alpha * 0.4})`);
    puff.addColorStop(1, `rgba(${r - 16},${g - 16},${b - 12}, 0)`);
    ctx.fillStyle = puff;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const dustCount = Math.round(14 * Math.sqrt(scale));
  for (let i = 0; i < dustCount; i++) {
    const seed = explosionRand(cellX, cellY, i + 400);
    const seed2 = explosionRand(cellX, cellY, i + 500);
    const angle = seed * Math.PI * 2;
    const speed = (0.6 + seed2 * 1.1) * STEP * scale;
    const delay = seed * 0.06;
    const life = 0.35 + seed2 * 0.25;
    const t = (progress - delay) / life;
    if (t <= 0 || t >= 1) continue;

    const ease = 1 - (1 - t) ** 3;
    const px = cx + Math.cos(angle) * speed * ease;
    const py = cy + Math.sin(angle) * speed * ease * 0.7 - STEP * 0.2 * ease * scale;
    const size = (1.5 + seed2 * 3.5 * (1 - t * 0.7)) * scale;
    const alpha = (1 - t) ** 1.2 * 0.9;
    const tone = 90 + Math.floor(seed * 50);

    ctx.globalAlpha = alpha;
    ctx.fillStyle = `rgb(${tone},${tone - 12},${tone - 22})`;
    ctx.beginPath();
    ctx.arc(px, py, size, 0, Math.PI * 2);
    ctx.fill();
  }

  if (progress < 0.45) {
    const ringT = progress / 0.45;
    const ringAlpha = (1 - ringT) * 0.35;
    const ringR = STEP * (0.2 + ringT * 1.1) * scale;
    ctx.globalAlpha = ringAlpha;
    ctx.strokeStyle = "rgba(160, 145, 130, 0.8)";
    ctx.lineWidth = 2 + (1 - ringT) * 5;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function shrinkCellCenter(x: number, y: number, step: number): [number, number] {
  return [x * step + CELL / 2, y * step + CELL / 2];
}

const SHRINK_BAND_W = 15;
const SHRINK_HUG_PX = 7;
const SHRINK_STRIPE_W = 5;

function stripCellsForDraw(strip: import("../core/types.ts").ShrinkPipeItem): Vec2[] {
  const bindKey = vecKey(strip.bindCoordinate);
  return strip.occupiedPositions.filter((p) => vecKey(p) !== bindKey);
}

function cellSegmentAngle(
  strip: Vec2[],
  index: number,
): number {
  const cell = strip[index]!;
  let dx = 0;
  let dy = 0;
  if (index > 0) {
    const prev = strip[index - 1]!;
    dx += cell[0] - prev[0];
    dy += cell[1] - prev[1];
  }
  if (index < strip.length - 1) {
    const next = strip[index + 1]!;
    dx += next[0] - cell[0];
    dy += next[1] - cell[1];
  }
  if (dx === 0 && dy === 0) return 0;
  return Math.atan2(dy, dx);
}

function drawBarberPoleBand(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  angle: number,
  length: number,
): void {
  const halfL = length / 2;
  const halfW = SHRINK_BAND_W / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.beginPath();
  const r = 5;
  ctx.moveTo(-halfL + r, -halfW);
  ctx.lineTo(halfL - r, -halfW);
  ctx.quadraticCurveTo(halfL, -halfW, halfL, -halfW + r);
  ctx.lineTo(halfL, halfW - r);
  ctx.quadraticCurveTo(halfL, halfW, halfL - r, halfW);
  ctx.lineTo(-halfL + r, halfW);
  ctx.quadraticCurveTo(-halfL, halfW, -halfL, halfW - r);
  ctx.lineTo(-halfL, -halfW + r);
  ctx.quadraticCurveTo(-halfL, -halfW, -halfL + r, -halfW);
  ctx.closePath();
  ctx.clip();

  ctx.fillStyle = "#b91c1c";
  ctx.fillRect(-halfL - halfW, -halfW, length + SHRINK_BAND_W * 2, SHRINK_BAND_W);

  ctx.fillStyle = "#f8fafc";
  const stripeStep = SHRINK_STRIPE_W * 2;
  for (let x = -halfL - halfW * 2; x < halfL + halfW * 2; x += stripeStep) {
    ctx.save();
    ctx.translate(x, 0);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-1, -halfW * 2, SHRINK_STRIPE_W, halfW * 4);
    ctx.restore();
  }

  ctx.restore();
}

function drawShrinkClasp(
  ctx: CanvasRenderingContext2D,
  bind: Vec2,
  firstStrip: Vec2,
  step: number,
): void {
  const [bx, by] = shrinkCellCenter(bind[0], bind[1], step);
  const [fx, fy] = shrinkCellCenter(firstStrip[0], firstStrip[1], step);
  const mx = (bx + fx) / 2;
  const my = (by + fy) / 2;
  const angle = Math.atan2(fy - by, fx - bx);

  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(angle + Math.PI / 2);

  ctx.fillStyle = "#6b7280";
  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-9, -5, 18, 10, 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#374151";
  ctx.beginPath();
  ctx.arc(-5, 0, 2, 0, Math.PI * 2);
  ctx.arc(5, 0, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#9ca3af";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-3, -7);
  ctx.lineTo(-3, -11);
  ctx.moveTo(3, -7);
  ctx.lineTo(3, -11);
  ctx.stroke();

  ctx.restore();
}

export function drawShrinkPipe(
  ctx: CanvasRenderingContext2D,
  strip: import("../core/types.ts").ShrinkPipeItem,
  step: number,
): void {
  const cells = stripCellsForDraw(strip);
  if (cells.length === 0) return;

  const bind = strip.bindCoordinate;
  const first = cells[0]!;
  const hugDx = Math.sign(first[0] - bind[0]);
  const hugDy = Math.sign(first[1] - bind[1]);
  const bandLen = CELL - 2;

  ctx.save();

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]!;
    const [cx, cy] = shrinkCellCenter(cell[0], cell[1], step);
    const px = cx + hugDx * SHRINK_HUG_PX;
    const py = cy + hugDy * SHRINK_HUG_PX;
    const angle = cellSegmentAngle(cells, i);

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1;
    drawBarberPoleBand(ctx, px, py, angle, bandLen);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.lineWidth = 1;
    ctx.translate(px, py);
    ctx.rotate(angle);
    const halfL = bandLen / 2;
    const halfW = SHRINK_BAND_W / 2;
    ctx.strokeRect(-halfL, -halfW, bandLen, SHRINK_BAND_W);
    ctx.restore();
  }

  drawShrinkClasp(ctx, bind, first, step);
  ctx.restore();
}

export function drawToggle(
  ctx: CanvasRenderingContext2D,
  toggle: import("../core/types.ts").ToggleItem,
  step: number,
): void {
  const [x, y] = toggle.occupiedPositions[0] ?? [0, 0];
  const [cx, cy] = shrinkCellCenter(x, y, step);
  const leverLeft = toggle.direction === 1;

  const housingW = STEP * 0.84;
  const housingH = STEP * 0.58;
  const housingR = STEP * 0.1;
  const trackW = STEP * 0.7;
  const trackH = STEP * 0.2;
  const leverW = STEP * 0.3;
  const leverH = STEP * 0.46;
  const leverTravel = STEP * 0.17;

  ctx.save();

  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.ellipse(cx + 1, cy + housingH * 0.34, housingW * 0.44, housingH * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();

  const hx = cx - housingW / 2;
  const hy = cy - housingH / 2;

  const housingGrad = ctx.createLinearGradient(hx, hy, hx, hy + housingH);
  housingGrad.addColorStop(0, "#f87171");
  housingGrad.addColorStop(0.35, "#ef4444");
  housingGrad.addColorStop(0.72, "#dc2626");
  housingGrad.addColorStop(1, "#991b1b");
  ctx.fillStyle = housingGrad;
  roundRect(ctx, hx, hy, housingW, housingH, housingR);
  ctx.fill();

  ctx.strokeStyle = "#7f1d1d";
  ctx.lineWidth = 1.5;
  roundRect(ctx, hx, hy, housingW, housingH, housingR);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.42)";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(hx + housingR * 0.8, hy + 1.5);
  ctx.lineTo(hx + housingW - housingR * 0.8, hy + 1.5);
  ctx.stroke();

  const trackX = cx - trackW / 2;
  const trackY = cy - trackH / 2;
  const trackGrad = ctx.createLinearGradient(trackX, trackY, trackX, trackY + trackH);
  trackGrad.addColorStop(0, "#450a0a");
  trackGrad.addColorStop(0.45, "#7f1d1d");
  trackGrad.addColorStop(1, "#450a0a");
  ctx.fillStyle = trackGrad;
  roundRect(ctx, trackX, trackY, trackW, trackH, trackH / 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  roundRect(ctx, trackX, trackY, trackW, trackH, trackH / 2);
  ctx.stroke();

  const leverCx = cx + (leverLeft ? -leverTravel : leverTravel);
  const leverX = leverCx - leverW / 2;
  const leverY = cy - leverH / 2;
  const leverR = leverW * 0.42;

  ctx.fillStyle = "rgba(0,0,0,0.28)";
  roundRect(ctx, leverX + 1.5, leverY + 2, leverW, leverH, leverR);
  ctx.fill();

  const leverGrad = ctx.createLinearGradient(leverX, leverY, leverX + leverW, leverY + leverH);
  leverGrad.addColorStop(0, "#fff1f2");
  leverGrad.addColorStop(0.28, "#fecaca");
  leverGrad.addColorStop(0.55, "#f87171");
  leverGrad.addColorStop(1, "#b91c1c");
  ctx.fillStyle = leverGrad;
  roundRect(ctx, leverX, leverY, leverW, leverH, leverR);
  ctx.fill();

  ctx.strokeStyle = "#7f1d1d";
  ctx.lineWidth = 1.25;
  roundRect(ctx, leverX, leverY, leverW, leverH, leverR);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  roundRect(ctx, leverX + leverW * 0.12, leverY + leverH * 0.1, leverW * 0.35, leverH * 0.22, leverR * 0.35);
  ctx.fill();

  ctx.strokeStyle = "#fca5a5";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(leverCx, leverY + leverH * 0.22);
  ctx.lineTo(leverCx, leverY + leverH * 0.78);
  ctx.stroke();

  const badgeW = Math.max(16, STEP * 0.38);
  const badgeH = Math.max(12, STEP * 0.3);
  const badgeX = cx - badgeW / 2;
  const badgeY = hy - badgeH - 3;
  const badgeGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX, badgeY + badgeH);
  badgeGrad.addColorStop(0, "#450a0a");
  badgeGrad.addColorStop(1, "#7f1d1d");
  ctx.fillStyle = badgeGrad;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 4);
  ctx.fill();
  ctx.strokeStyle = "#fca5a5";
  ctx.lineWidth = 1;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 4);
  ctx.stroke();

  const fontSize = Math.max(10, Math.round(STEP * 0.3));
  ctx.font = `bold ${fontSize}px system-ui,sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#450a0a";
  ctx.fillStyle = "#fff1f2";
  const label = String(toggle.groupID);
  ctx.strokeText(label, cx, badgeY + badgeH / 2);
  ctx.fillText(label, cx, badgeY + badgeH / 2);

  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export function drawController(
  ctx: CanvasRenderingContext2D,
  ctrl: import("../core/types.ts").ControllerItem,
  step: number,
  flash: boolean,
): void {
  const [x, y] = ctrl.occupiedPositions[0] ?? [0, 0];
  const [cx, cy] = shrinkCellCenter(x, y, step);
  drawControllerAt(ctx, cx, cy, ctrl.groupID, flash);
}

export function drawControllerAt(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  groupID: number,
  flash: boolean,
  options: { compact?: boolean } = {},
): void {
  const compact = options.compact ?? false;
  const outerR = compact ? 8 : 10;
  const innerR = compact ? 4 : 5;
  const labelOffset = compact ? 12 : 18;
  const fontSize = compact ? 8 : 9;

  ctx.save();
  ctx.fillStyle = flash ? "#fca5a5" : "#1f2937";
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = flash ? "#ef4444" : "#dc2626";
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f9fafb";
  ctx.font = `bold ${fontSize}px system-ui,sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(groupID), cx, cy + labelOffset);
  ctx.restore();
}

function cellCenterBuff(x: number, y: number, step: number): [number, number] {
  return [x * step + step / 2, y * step + step / 2];
}

function drawBuffLabel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  text: string,
  fontSize: number,
): void {
  ctx.font = `bold ${fontSize}px system-ui,sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = Math.max(2.5, fontSize * 0.22);
  ctx.strokeStyle = "rgba(0,0,0,0.65)";
  ctx.fillStyle = "#ffffff";
  ctx.strokeText(text, cx, cy);
  ctx.fillText(text, cx, cy);
}

function drawAreaBombBuff(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  step: number,
  bombRadius: 1 | 2,
): void {
  const isLarge = bombRadius === 2;
  const r = step * (isLarge ? 0.3 : 0.26);
  const label = isLarge ? "5" : "3";
  const blastHalf = step * (isLarge ? 0.5 : 0.44);

  ctx.save();

  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = isLarge ? "rgba(251, 146, 60, 0.5)" : "rgba(248, 113, 113, 0.45)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx - blastHalf, cy - blastHalf, blastHalf * 2, blastHalf * 2);
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(cx + 2, cy + 3, r * 0.92, r * 0.78, 0, 0, Math.PI * 2);
  ctx.fill();

  const bodyGrad = ctx.createRadialGradient(
    cx - r * 0.32,
    cy - r * 0.38,
    r * 0.12,
    cx + r * 0.05,
    cy + r * 0.05,
    r * 1.05,
  );
  if (isLarge) {
    bodyGrad.addColorStop(0, "#fdba74");
    bodyGrad.addColorStop(0.35, "#f97316");
    bodyGrad.addColorStop(0.72, "#c2410c");
    bodyGrad.addColorStop(1, "#7c2d12");
  } else {
    bodyGrad.addColorStop(0, "#fca5a5");
    bodyGrad.addColorStop(0.35, "#ef4444");
    bodyGrad.addColorStop(0.72, "#b91c1c");
    bodyGrad.addColorStop(1, "#7f1d1d");
  }
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = isLarge ? "#9a3412" : "#7f1d1d";
  ctx.lineWidth = isLarge ? 2 : 1.8;
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.3, cy - r * 0.34, r * 0.28, r * 0.2, -0.45, 0, Math.PI * 2);
  ctx.fill();

  const bandY = cy + r * 0.08;
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  ctx.lineWidth = isLarge ? 2 : 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.72, bandY);
  ctx.lineTo(cx + r * 0.72, bandY);
  ctx.stroke();

  const fuseEndX = cx + r * 0.22;
  const fuseEndY = cy - r - step * 0.08;
  ctx.strokeStyle = "#a16207";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, cy - r + 2);
  ctx.quadraticCurveTo(cx + r * 0.1, cy - r - 4, fuseEndX, fuseEndY);
  ctx.stroke();

  const sparkGrad = ctx.createRadialGradient(fuseEndX, fuseEndY - 1, 0, fuseEndX, fuseEndY - 1, 4);
  sparkGrad.addColorStop(0, "#fff7ed");
  sparkGrad.addColorStop(0.45, "#fb923c");
  sparkGrad.addColorStop(1, "rgba(251, 146, 60, 0)");
  ctx.fillStyle = sparkGrad;
  ctx.beginPath();
  ctx.arc(fuseEndX, fuseEndY - 1, 4, 0, Math.PI * 2);
  ctx.fill();

  const badgeR = isLarge ? 9.5 : 9;
  const badgeY = cy + r * 0.42;
  ctx.fillStyle = isLarge ? "#7c2d12" : "#991b1b";
  ctx.beginPath();
  ctx.arc(cx, badgeY, badgeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#fff7ed";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  drawBuffLabel(ctx, cx, badgeY, label, isLarge ? 12 : 11);

  ctx.restore();
}

function drawCrossBombBuff(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  step: number,
  crossArm: 2 | 5,
): void {
  const isLarge = crossArm === 5;
  const label = isLarge ? "10" : "5";
  const blastHalf = step * (isLarge ? 0.54 : 0.46);
  const bodyW = step * (isLarge ? 0.46 : 0.4);
  const bodyH = step * (isLarge ? 0.5 : 0.46);
  const tilt = -0.42;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  ctx.translate(-cx, -cy);

  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = isLarge ? "rgba(134, 239, 172, 0.45)" : "rgba(74, 222, 128, 0.4)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx - blastHalf, cy - blastHalf, blastHalf * 2, blastHalf * 2);
  ctx.setLineDash([]);

  const bx = cx - bodyW / 2;
  const by = cy - bodyH / 2 + step * 0.02;

  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.ellipse(cx + 2, cy + bodyH * 0.38, bodyW * 0.42, bodyH * 0.14, tilt, 0, Math.PI * 2);
  ctx.fill();

  const bodyGrad = ctx.createLinearGradient(bx, by, bx + bodyW, by + bodyH);
  bodyGrad.addColorStop(0, "#4d7c0f");
  bodyGrad.addColorStop(0.25, "#3f6212");
  bodyGrad.addColorStop(0.55, "#365314");
  bodyGrad.addColorStop(0.85, "#1a2e05");
  bodyGrad.addColorStop(1, "#14532d");
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, bx, by, bodyW, bodyH, bodyW * 0.48);
  ctx.fill();

  ctx.strokeStyle = "#14532d";
  ctx.lineWidth = 1.8;
  roundRect(ctx, bx, by, bodyW, bodyH, bodyW * 0.48);
  ctx.stroke();

  const segCount = 5;
  const segGap = bodyH / (segCount + 1);
  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  ctx.lineWidth = 1.2;
  for (let i = 1; i <= segCount; i++) {
    const sy = by + segGap * i;
    ctx.beginPath();
    ctx.moveTo(bx + bodyW * 0.14, sy);
    ctx.lineTo(bx + bodyW * 0.86, sy);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.ellipse(cx - bodyW * 0.14, by + bodyH * 0.22, bodyW * 0.12, bodyH * 0.18, -0.3, 0, Math.PI * 2);
  ctx.fill();

  const capH = step * 0.12;
  const capY = by - capH + 3;
  const capGrad = ctx.createLinearGradient(cx - bodyW * 0.2, capY, cx + bodyW * 0.2, capY + capH);
  capGrad.addColorStop(0, "#78716c");
  capGrad.addColorStop(0.5, "#57534e");
  capGrad.addColorStop(1, "#44403c");
  ctx.fillStyle = capGrad;
  roundRect(ctx, cx - bodyW * 0.22, capY, bodyW * 0.44, capH, 3);
  ctx.fill();

  ctx.strokeStyle = "#292524";
  ctx.lineWidth = 1.2;
  roundRect(ctx, cx - bodyW * 0.22, capY, bodyW * 0.44, capH, 3);
  ctx.stroke();

  const leverY = capY - step * 0.08;
  ctx.strokeStyle = "#d6d3d1";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - bodyW * 0.18, leverY);
  ctx.lineTo(cx + bodyW * 0.18, leverY);
  ctx.stroke();

  ctx.fillStyle = "#a8a29e";
  ctx.beginPath();
  ctx.arc(cx, leverY - 3, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#57534e";
  ctx.lineWidth = 1;
  ctx.stroke();

  const crossLen = bodyW * 0.32;
  const crossCy = cy + step * 0.01;
  ctx.strokeStyle = "#ecfccb";
  ctx.lineWidth = 2.8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - crossLen, crossCy);
  ctx.lineTo(cx + crossLen, crossCy);
  ctx.moveTo(cx, crossCy - crossLen);
  ctx.lineTo(cx, crossCy + crossLen);
  ctx.stroke();

  ctx.strokeStyle = "rgba(22, 101, 52, 0.9)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - crossLen, crossCy);
  ctx.lineTo(cx + crossLen, crossCy);
  ctx.moveTo(cx, crossCy - crossLen);
  ctx.lineTo(cx, crossCy + crossLen);
  ctx.stroke();

  const badgeR = isLarge ? 9.5 : 9;
  const badgeY = cy + bodyH * 0.38;
  ctx.fillStyle = "#14532d";
  ctx.beginPath();
  ctx.arc(cx, badgeY, badgeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ecfccb";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  drawBuffLabel(ctx, cx, badgeY, label, isLarge ? 11 : 10);

  ctx.restore();
}

function drawFireBombBuff(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  step: number,
): void {
  const s = step * 0.42;
  const bodyW = s * 0.96;
  const bodyH = s * 1.12;
  const neckW = s * 0.34;
  const neckH = s * 0.38;
  const bodyTop = cy - s * 0.02;
  const bodyBottom = bodyTop + bodyH;
  const neckBottom = bodyTop;
  const neckTop = neckBottom - neckH;
  const bx = cx - bodyW / 2;

  ctx.save();

  ctx.fillStyle = "rgba(0,0,0,0.26)";
  ctx.beginPath();
  ctx.ellipse(cx + 1.5, bodyBottom - s * 0.06, bodyW * 0.4, s * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();

  const bottlePath = (): void => {
    ctx.beginPath();
    ctx.moveTo(cx - bodyW * 0.42, bodyBottom - s * 0.1);
    ctx.quadraticCurveTo(cx - bodyW * 0.5, bodyTop + bodyH * 0.35, cx - bodyW * 0.4, bodyTop + bodyH * 0.08);
    ctx.lineTo(cx - neckW / 2, neckBottom);
    ctx.lineTo(cx - neckW / 2, neckTop + s * 0.06);
    ctx.quadraticCurveTo(cx - neckW / 2, neckTop, cx, neckTop);
    ctx.quadraticCurveTo(cx + neckW / 2, neckTop, cx + neckW / 2, neckTop + s * 0.06);
    ctx.lineTo(cx + neckW / 2, neckBottom);
    ctx.lineTo(cx + bodyW * 0.4, bodyTop + bodyH * 0.08);
    ctx.quadraticCurveTo(cx + bodyW * 0.5, bodyTop + bodyH * 0.35, cx + bodyW * 0.42, bodyBottom - s * 0.1);
    ctx.quadraticCurveTo(cx, bodyBottom + s * 0.07, cx - bodyW * 0.42, bodyBottom - s * 0.1);
    ctx.closePath();
  };

  bottlePath();
  const glassGrad = ctx.createLinearGradient(bx, bodyTop, bx + bodyW, bodyBottom);
  glassGrad.addColorStop(0, "#bbf7d0");
  glassGrad.addColorStop(0.28, "#86efac");
  glassGrad.addColorStop(0.55, "#4ade80");
  glassGrad.addColorStop(0.82, "#22c55e");
  glassGrad.addColorStop(1, "#16a34a");
  ctx.fillStyle = glassGrad;
  ctx.fill();

  ctx.strokeStyle = "#15803d";
  ctx.lineWidth = 2;
  ctx.stroke();

  bottlePath();
  ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.ellipse(cx - bodyW * 0.18, bodyTop + bodyH * 0.28, bodyW * 0.11, bodyH * 0.4, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(34, 197, 94, 0.35)";
  ctx.fillRect(bx + bodyW * 0.08, bodyTop + bodyH * 0.55, bodyW * 0.84, bodyH * 0.38);
  ctx.restore();
  ctx.save();

  ctx.strokeStyle = "#166534";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(cx - bodyW * 0.28, bodyTop + bodyH * 0.42);
  ctx.lineTo(cx + bodyW * 0.28, bodyTop + bodyH * 0.42);
  ctx.stroke();

  ctx.fillStyle = "#78716c";
  ctx.fillRect(cx - neckW * 0.58, neckTop - 2.5, neckW * 1.16, 3.5);
  ctx.strokeStyle = "#57534e";
  ctx.lineWidth = 1.2;
  ctx.strokeRect(cx - neckW * 0.58, neckTop - 2.5, neckW * 1.16, 3.5);

  const ragGrad = ctx.createLinearGradient(cx - s * 0.28, neckTop - s * 0.72, cx + s * 0.28, neckTop);
  ragGrad.addColorStop(0, "#fef9c3");
  ragGrad.addColorStop(0.45, "#fde68a");
  ragGrad.addColorStop(1, "#d6d3d1");
  ctx.fillStyle = ragGrad;
  ctx.strokeStyle = "#a8a29e";
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(cx - neckW * 0.5, neckTop);
  ctx.quadraticCurveTo(cx - s * 0.32, neckTop - s * 0.48, cx - s * 0.12, neckTop - s * 0.78);
  ctx.quadraticCurveTo(cx + s * 0.06, neckTop - s * 0.92, cx + s * 0.28, neckTop - s * 0.55);
  ctx.quadraticCurveTo(cx + neckW * 0.55, neckTop - s * 0.16, cx + neckW * 0.5, neckTop);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx + neckW * 0.25, neckTop + 1);
  ctx.quadraticCurveTo(cx + s * 0.46, neckTop + s * 0.12, cx + s * 0.38, neckTop + s * 0.38);
  ctx.quadraticCurveTo(cx + s * 0.24, neckTop + s * 0.56, cx + s * 0.1, neckTop + s * 0.3);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - neckW * 0.3, neckTop + 2);
  ctx.quadraticCurveTo(cx - s * 0.42, neckTop + s * 0.22, cx - s * 0.32, neckTop + s * 0.44);
  ctx.stroke();

  ctx.strokeStyle = "#d6d3d1";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - neckW * 0.22, neckTop - s * 0.12);
  ctx.quadraticCurveTo(cx, neckTop - s * 0.32, cx + neckW * 0.2, neckTop - s * 0.08);
  ctx.stroke();

  ctx.restore();
}

function drawBalloonShape(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  step: number,
  fillStops: { offset: number; color: string }[],
  strokeColor: string,
): void {
  const balloonRx = step * 0.28;
  const balloonRy = step * 0.33;
  const balloonCy = cy - step * 0.12;
  const neckY = balloonCy + balloonRy * 0.68;
  const knotY = neckY + 5;

  const bodyGrad = ctx.createRadialGradient(
    cx - balloonRx * 0.28,
    balloonCy - balloonRy * 0.32,
    balloonRx * 0.15,
    cx,
    balloonCy,
    balloonRy * 1.05,
  );
  for (const stop of fillStops) {
    bodyGrad.addColorStop(stop.offset, stop.color);
  }
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.ellipse(cx, balloonCy, balloonRx, balloonRy, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1.8;
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.beginPath();
  ctx.ellipse(
    cx - balloonRx * 0.28,
    balloonCy - balloonRy * 0.28,
    balloonRx * 0.22,
    balloonRy * 0.16,
    -0.35,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - balloonRx * 0.22, neckY - 2);
  ctx.quadraticCurveTo(cx, neckY + 4, cx + balloonRx * 0.22, neckY - 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - balloonRx * 0.18, neckY + 1);
  ctx.lineTo(cx + balloonRx * 0.18, neckY - 4);
  ctx.stroke();

  ctx.fillStyle = "#e2e8f0";
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx, neckY);
  ctx.lineTo(cx - 3.5, knotY + 5);
  ctx.lineTo(cx + 3.5, knotY + 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(cx - 5, knotY + 2);
  ctx.quadraticCurveTo(cx - 8, knotY - 1, cx - 4, neckY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 5, knotY + 2);
  ctx.quadraticCurveTo(cx + 8, knotY - 1, cx + 4, neckY);
  ctx.stroke();

  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, knotY + 2);
  ctx.quadraticCurveTo(cx + step * 0.1, cy + step * 0.18, cx + step * 0.05, cy + step * 0.36);
  ctx.stroke();

  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, knotY + 2);
  ctx.quadraticCurveTo(cx - step * 0.06, cy + step * 0.22, cx - step * 0.02, cy + step * 0.38);
  ctx.stroke();
}

export function drawBalloonAt(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  step: number,
  opts?: {
    colorId?: number;
    colorMix?: number;
    scale?: number;
    alpha?: number;
  },
): void {
  const colorMix = Math.max(0, Math.min(1, opts?.colorMix ?? 0));
  const scale = opts?.scale ?? 1;
  const alpha = opts?.alpha ?? 1;
  const tint = opts?.colorId != null ? colorForId(opts.colorId) : null;

  ctx.save();
  ctx.globalAlpha = alpha;
  if (scale !== 1) {
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
  }

  drawBalloonShape(ctx, cx, cy, step, [
    { offset: 0, color: "#ffffff" },
    { offset: 0.42, color: "#f8fafc" },
    { offset: 0.78, color: "#e2e8f0" },
    { offset: 1, color: "#cbd5e1" },
  ], "#94a3b8");

  if (tint && colorMix > 0) {
    ctx.save();
    ctx.globalAlpha = colorMix;
    drawBalloonShape(ctx, cx, cy, step, [
      { offset: 0, color: tint },
      { offset: 0.45, color: tint },
      { offset: 0.82, color: tint },
      { offset: 1, color: tint },
    ], tint);
    ctx.restore();
  }

  ctx.restore();
}

function drawBalloonBuff(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  step: number,
): void {
  drawBalloonAt(ctx, cx, cy, step);
}

function drawFlipButtonArrow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  step: number,
  pointingRight: boolean,
): void {
  const halfLen = step * 0.105;
  const head = step * 0.075;
  const shaft = step * 0.095;
  ctx.save();
  ctx.translate(cx, cy);
  if (!pointingRight) ctx.scale(-1, 1);
  ctx.strokeStyle = "#111827";
  ctx.fillStyle = "#111827";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(-halfLen, 0);
  ctx.lineTo(halfLen, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(halfLen, 0);
  ctx.lineTo(halfLen - shaft, -head);
  ctx.lineTo(halfLen - shaft, head);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawFlipButtonBuff(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  step: number,
): void {
  const r = step * 0.32;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 2.4;
  ctx.stroke();
  const offsetY = step * 0.075;
  drawFlipButtonArrow(ctx, cx, cy - offsetY, step, true);
  drawFlipButtonArrow(ctx, cx, cy + offsetY, step, false);
}

export function drawCandyMachineAt(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  step: number,
  opts?: { buttonPulse?: number },
): void {
  const bodyW = step * 0.78;
  const bodyH = step * 0.13;
  const bodyTop = cy + step * 0.12;
  const domeR = step * 0.42;
  const domeCy = bodyTop - domeR * 0.52;
  const pulse = opts?.buttonPulse ?? 0;

  ctx.save();

  // 玻璃罩（占主体大部分高度）
  ctx.beginPath();
  ctx.arc(cx, domeCy + domeR * 0.12, domeR, Math.PI, 0);
  ctx.lineTo(cx + domeR * 0.92, bodyTop);
  ctx.lineTo(cx - domeR * 0.92, bodyTop);
  ctx.closePath();
  const glass = ctx.createLinearGradient(cx, domeCy - domeR, cx, bodyTop);
  glass.addColorStop(0, "rgba(210, 235, 255, 0.48)");
  glass.addColorStop(0.55, "rgba(180, 220, 255, 0.26)");
  glass.addColorStop(1, "rgba(255, 255, 255, 0.14)");
  ctx.fillStyle = glass;
  ctx.fill();
  ctx.strokeStyle = "rgba(70, 90, 120, 0.62)";
  ctx.lineWidth = 2.4;
  ctx.stroke();

  // 罩内糖果
  const candyDots: [number, number, number][] = [
    [-0.12, -0.06, 1],
    [0.11, -0.1, 2],
    [-0.03, 0.06, 3],
    [0.14, 0.04, 4],
    [-0.15, 0.06, 6],
    [0.02, -0.16, 7],
    [0.16, -0.04, 8],
    [-0.08, -0.14, 3],
  ];
  for (const [ox, oy, colorId] of candyDots) {
    const px = cx + ox * step;
    const py = domeCy + oy * step;
    const cr = step * 0.095;
    const fill = colorForId(colorId);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(px, py, cr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.38)";
    ctx.beginPath();
    ctx.arc(px - cr * 0.25, py - cr * 0.25, cr * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // 机身
  roundRect(ctx, cx - bodyW / 2, bodyTop, bodyW, bodyH, step * 0.04);
  const bodyGrad = ctx.createLinearGradient(cx, bodyTop, cx, bodyTop + bodyH);
  bodyGrad.addColorStop(0, "#FF8AC2");
  bodyGrad.addColorStop(1, "#E85A9A");
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.strokeStyle = "#9E3D6E";
  ctx.lineWidth = 2;
  ctx.stroke();

  // 扭蛋按钮
  const btnCy = bodyTop + bodyH * 0.62;
  const btnR = step * 0.125 * (1 + pulse * 0.1);
  const btnGrad = ctx.createRadialGradient(
    cx - btnR * 0.25,
    btnCy - btnR * 0.25,
    0,
    cx,
    btnCy,
    btnR,
  );
  btnGrad.addColorStop(0, "#FFE566");
  btnGrad.addColorStop(0.55, "#FFAA44");
  btnGrad.addColorStop(1, "#E87830");
  ctx.fillStyle = btnGrad;
  ctx.beginPath();
  ctx.arc(cx, btnCy, btnR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#B45309";
  ctx.lineWidth = 1.8;
  ctx.stroke();

  ctx.restore();
}

function drawCandyMachineBuff(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  step: number,
): void {
  drawCandyMachineAt(ctx, cx, cy, step);
}

function drawBlackHoleBuff(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  step: number,
  rotation = 0,
  vanishProgress = 0,
): void {
  const shrink = 1 - vanishProgress * 0.92;
  const fade = 1 - vanishProgress * 0.85;
  const spiralReach = 1 - vanishProgress * 0.75;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalAlpha *= fade;
  ctx.scale(shrink, shrink);
  ctx.rotate(rotation);

  for (let arm = 0; arm < 3; arm++) {
    const base = (arm / 3) * Math.PI * 2;
    ctx.strokeStyle = "rgba(180, 130, 230, 0.88)";
    ctx.lineWidth = step * 0.058 * (1 - vanishProgress * 0.35);
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let t = 0; t <= 1; t += 0.04) {
      const angle = base + t * Math.PI * 1.65;
      const r = step * (0.2 + t * 0.38) * spiralReach;
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      if (t === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  const ringR = step * 0.23 * (1 - vanishProgress * 0.55);
  ctx.beginPath();
  ctx.arc(0, 0, ringR, 0, Math.PI * 2);
  ctx.strokeStyle = "#C89BFF";
  ctx.lineWidth = 2.6 * (1 - vanishProgress * 0.4);
  ctx.stroke();

  const coreR = step * 0.19 * (1 - vanishProgress * 0.65);
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
  core.addColorStop(0, "#050505");
  core.addColorStop(0.55, "#0f0f14");
  core.addColorStop(1, "#1a1a24");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, coreR, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function drawBuff(
  ctx: CanvasRenderingContext2D,
  buff: BuffItem,
  step: number,
  alpha = 1,
  opts?: {
    spawnScale?: number;
    blackHoleRotation?: number;
    blackHoleVanishProgress?: number;
  },
): void {
  const [x, y] = buff.occupiedPositions[0] ?? [0, 0];
  const [cx, cy] = cellCenterBuff(x, y, step);
  ctx.save();
  ctx.globalAlpha = alpha;
  const scale = opts?.spawnScale ?? 1;
  if (scale !== 1) {
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
  }
  if (buff.kind === 17) {
    drawAreaBombBuff(ctx, cx, cy, step, buff.bombRadius === 2 ? 2 : 1);
  } else if (buff.kind === 18) {
    drawCrossBombBuff(ctx, cx, cy, step, buff.crossArm === 5 ? 5 : 2);
  } else if (buff.kind === 19) {
    drawFireBombBuff(ctx, cx, cy, step);
  } else if (buff.kind === 20) {
    drawBalloonBuff(ctx, cx, cy, step);
  } else if (buff.kind === 21) {
    drawBlackHoleBuff(
      ctx,
      cx,
      cy,
      step,
      opts?.blackHoleRotation ?? 0,
      opts?.blackHoleVanishProgress ?? 0,
    );
  } else if (buff.kind === 22) {
    drawFlipButtonBuff(ctx, cx, cy, step);
  } else if (buff.kind === 23) {
    drawCandyMachineBuff(ctx, cx, cy, step);
  }
  ctx.restore();
}
