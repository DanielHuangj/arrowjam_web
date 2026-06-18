import type { BombItem, FrozenOverlayItem, MovingWallItem } from "../core/types.ts";
import type { Vec2 } from "../core/types.ts";
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
const ICE_SHADOW = "rgba(14, 116, 144, 0.28)";
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

  ctx.fillStyle = ICE_SHADOW;
  ctx.fillRect(bx + 2, by + 3, bw, bh);

  ctx.beginPath();
  for (const [cx, cy] of cells) {
    const { x0, y0, x1, y1 } = cellRect(cx, cy);
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
  }
  ctx.clip();

  paintIceTexture(ctx, bx - STEP, by - STEP, bw + STEP * 2, bh + STEP * 2);

  ctx.restore();

  drawIceOutline(ctx, cells, cellSet);

  const centerX = ((minX + maxX + 1) * STEP) / 2;
  const centerY = ((minY + maxY + 1) * STEP) / 2;
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
