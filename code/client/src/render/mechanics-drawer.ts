import type { BombItem, FrozenOverlayItem, MovingWallItem } from "../core/types.ts";
import type { Vec2 } from "../core/types.ts";
import { frozenHealthViewPathIndex } from "@arrowjaw/shared";
import { vecKey } from "../core/types.ts";
import { STEP, CELL } from "./colors.ts";

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
    drawExplosionAt(ctx, cx, cy, cellX, cellY, progress);
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

function drawExplosionAt(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cellX: number,
  cellY: number,
  progress: number,
): void {
  ctx.save();

  if (progress < 0.18) {
    const flashT = progress / 0.18;
    const flashR = STEP * (0.25 + flashT * 0.55);
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

  const smokeCount = 28;
  for (let i = 0; i < smokeCount; i++) {
    const seed = explosionRand(cellX, cellY, i);
    const seed2 = explosionRand(cellX, cellY, i + 100);
    const seed3 = explosionRand(cellX, cellY, i + 200);
    const angle = seed * Math.PI * 2;
    const speed = (0.35 + seed2 * 0.9) * STEP;
    const delay = seed3 * 0.12;
    const life = 0.55 + seed2 * 0.4;
    const t = (progress - delay) / life;
    if (t <= 0 || t >= 1) continue;

    const ease = 1 - (1 - t) ** 2;
    const dist = speed * ease;
    const rise = STEP * (0.15 + seed * 0.55) * ease;
    const px = cx + Math.cos(angle) * dist;
    const py = cy + Math.sin(angle) * dist * 0.65 - rise;
    const baseSize = STEP * (0.14 + seed2 * 0.22);
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

  const dustCount = 14;
  for (let i = 0; i < dustCount; i++) {
    const seed = explosionRand(cellX, cellY, i + 400);
    const seed2 = explosionRand(cellX, cellY, i + 500);
    const angle = seed * Math.PI * 2;
    const speed = (0.6 + seed2 * 1.1) * STEP;
    const delay = seed * 0.06;
    const life = 0.35 + seed2 * 0.25;
    const t = (progress - delay) / life;
    if (t <= 0 || t >= 1) continue;

    const ease = 1 - (1 - t) ** 3;
    const px = cx + Math.cos(angle) * speed * ease;
    const py = cy + Math.sin(angle) * speed * ease * 0.7 - STEP * 0.2 * ease;
    const size = 1.5 + seed2 * 3.5 * (1 - t * 0.7);
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
    const ringR = STEP * (0.2 + ringT * 1.1);
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
