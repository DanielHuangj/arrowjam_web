import { CELL, GAP, STEP } from "./colors.ts";

/** 连通区域外轮廓凸角圆角半径（像素） */
export const REGION_OUTER_CORNER_RADIUS = 12;

function hasCell(cells: Set<string>, x: number, y: number): boolean {
  return cells.has(`${x},${y}`);
}

function clampRadius(r: number, w: number, h: number): number {
  return Math.max(0, Math.min(r, w / 2, h / 2));
}

/** 单格：仅外凸角圆角，内边与邻格保持直角以便拼合 */
export function appendRoundedRegionCellPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cells: Set<string>,
  cellSize: number = CELL,
  stepSize: number = STEP,
  radius: number = REGION_OUTER_CORNER_RADIUS,
): void {
  const left = hasCell(cells, x - 1, y);
  const right = hasCell(cells, x + 1, y);
  const top = hasCell(cells, x, y - 1);
  const bottom = hasCell(cells, x, y + 1);

  const halfGap = GAP / 2;
  const outerBleed = 0.5;
  let px = x * stepSize - (left ? halfGap : outerBleed);
  let py = y * stepSize - (top ? halfGap : outerBleed);
  const w =
    cellSize +
    (left ? halfGap : outerBleed) +
    (right ? halfGap : outerBleed);
  const h =
    cellSize +
    (top ? halfGap : outerBleed) +
    (bottom ? halfGap : outerBleed);

  let rtl = !left && !top ? radius : 0;
  let rtr = !right && !top ? radius : 0;
  let rbr = !right && !bottom ? radius : 0;
  let rbl = !left && !bottom ? radius : 0;
  rtl = clampRadius(rtl, w, h);
  rtr = clampRadius(rtr, w, h);
  rbr = clampRadius(rbr, w, h);
  rbl = clampRadius(rbl, w, h);

  ctx.moveTo(px + rtl, py);
  ctx.lineTo(px + w - rtr, py);
  if (rtr > 0) ctx.arcTo(px + w, py, px + w, py + rtr, rtr);
  else ctx.lineTo(px + w, py);
  ctx.lineTo(px + w, py + h - rbr);
  if (rbr > 0) ctx.arcTo(px + w, py + h, px + w - rbr, py + h, rbr);
  else ctx.lineTo(px + w, py + h);
  ctx.lineTo(px + rbl, py + h);
  if (rbl > 0) ctx.arcTo(px, py + h, px, py + h - rbl, rbl);
  else ctx.lineTo(px, py + h);
  ctx.lineTo(px, py + rtl);
  if (rtl > 0) ctx.arcTo(px, py, px + rtl, py, rtl);
  else ctx.lineTo(px, py);
  ctx.closePath();
}

export function appendRoundedRegionCellsPath(
  ctx: CanvasRenderingContext2D,
  cells: Set<string>,
  cellSize: number = CELL,
  stepSize: number = STEP,
  radius: number = REGION_OUTER_CORNER_RADIUS,
): void {
  for (const key of cells) {
    const [xs, ys] = key.split(",");
    const x = Number(xs);
    const y = Number(ys);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    appendRoundedRegionCellPath(ctx, x, y, cells, cellSize, stepSize, radius);
  }
}

export function fillRoundedRegionCells(
  ctx: CanvasRenderingContext2D,
  cells: Set<string>,
  fillStyle: string | CanvasGradient | CanvasPattern,
  cellSize: number = CELL,
  stepSize: number = STEP,
  radius: number = REGION_OUTER_CORNER_RADIUS,
): void {
  if (cells.size === 0) return;
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  appendRoundedRegionCellsPath(ctx, cells, cellSize, stepSize, radius);
  ctx.fill("evenodd");
}

export function clipRoundedRegionCells(
  ctx: CanvasRenderingContext2D,
  cells: Set<string>,
  cellSize: number = CELL,
  stepSize: number = STEP,
  radius: number = REGION_OUTER_CORNER_RADIUS,
): void {
  ctx.beginPath();
  appendRoundedRegionCellsPath(ctx, cells, cellSize, stepSize, radius);
  ctx.clip();
}

type Point = { x: number; y: number };

function pointKey(p: Point): string {
  return `${p.x},${p.y}`;
}

function segmentsForCell(
  x: number,
  y: number,
  cells: Set<string>,
  cellSize: number,
  stepSize: number,
): [Point, Point][] {
  const px = x * stepSize;
  const py = y * stepSize;
  const segs: [Point, Point][] = [];
  const top: Point = { x: px, y: py };
  const tr: Point = { x: px + cellSize, y: py };
  const br: Point = { x: px + cellSize, y: py + cellSize };
  const bl: Point = { x: px, y: py + cellSize };
  if (!hasCell(cells, x, y - 1)) segs.push([top, tr]);
  if (!hasCell(cells, x + 1, y)) segs.push([tr, br]);
  if (!hasCell(cells, x, y + 1)) segs.push([br, bl]);
  if (!hasCell(cells, x - 1, y)) segs.push([bl, top]);
  return segs;
}

/** 外轮廓描边（不含区域内部网格线） */
export function strokeRoundedRegionOutline(
  ctx: CanvasRenderingContext2D,
  cells: Set<string>,
  strokeStyle: string,
  lineWidth: number,
  cellSize: number = CELL,
  stepSize: number = STEP,
  radius: number = REGION_OUTER_CORNER_RADIUS,
): void {
  if (cells.size === 0) return;

  const adj = new Map<string, Point[]>();
  const addEdge = (a: Point, b: Point) => {
    const ka = pointKey(a);
    const kb = pointKey(b);
    if (!adj.has(ka)) adj.set(ka, []);
    if (!adj.has(kb)) adj.set(kb, []);
    adj.get(ka)!.push(b);
    adj.get(kb)!.push(a);
  };

  for (const key of cells) {
    const [xs, ys] = key.split(",");
    const x = Number(xs);
    const y = Number(ys);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    for (const [a, b] of segmentsForCell(x, y, cells, cellSize, stepSize)) {
      addEdge(a, b);
    }
  }

  const startKey = [...adj.keys()].sort((a, b) => {
    const [ax, ay] = a.split(",").map(Number);
    const [bx, by] = b.split(",").map(Number);
    return ay - by || ax - bx;
  })[0];
  if (!startKey) return;

  const parse = (k: string): Point => {
    const [x, y] = k.split(",").map(Number);
    return { x: x!, y: y! };
  };

  const loop: Point[] = [parse(startKey)];
  let prev = loop[0]!;
  let cur = adj.get(startKey)!.sort((a, b) => a.x - b.x || a.y - b.y)[0]!;

  while (loop.length < 10000) {
    loop.push(cur);
    const neighbors = adj.get(pointKey(cur))!.filter(
      (p) => p.x !== prev.x || p.y !== prev.y,
    );
    if (neighbors.length === 0) break;
    const next = neighbors[0]!;
    if (next.x === loop[0]!.x && next.y === loop[0]!.y && loop.length > 2) break;
    prev = cur;
    cur = next;
  }

  if (loop.length < 3) return;

  const r = Math.max(0, radius);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.beginPath();

  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const prevPt = loop[(i - 1 + n) % n]!;
    const curPt = loop[i]!;
    const nextPt = loop[(i + 1) % n]!;

    const inDx = curPt.x - prevPt.x;
    const inDy = curPt.y - prevPt.y;
    const outDx = nextPt.x - curPt.x;
    const outDy = nextPt.y - curPt.y;

    const inLen = Math.hypot(inDx, inDy) || 1;
    const outLen = Math.hypot(outDx, outDy) || 1;
    const inUx = inDx / inLen;
    const inUy = inDy / inLen;
    const outUx = outDx / outLen;
    const outUy = outDy / outLen;

    const cross = inUx * outUy - inUy * outUx;
    const isConvex = cross > 0;
    const trim = isConvex ? Math.min(r, inLen / 2, outLen / 2) : 0;

    const entry = {
      x: curPt.x - inUx * trim,
      y: curPt.y - inUy * trim,
    };
    const exit = {
      x: curPt.x + outUx * trim,
      y: curPt.y + outUy * trim,
    };

    if (i === 0) ctx.moveTo(entry.x, entry.y);
    else ctx.lineTo(entry.x, entry.y);

    if (trim > 0 && isConvex) {
      ctx.quadraticCurveTo(curPt.x, curPt.y, exit.x, exit.y);
    } else {
      ctx.lineTo(exit.x, exit.y);
    }
  }

  ctx.closePath();
  ctx.stroke();
}
