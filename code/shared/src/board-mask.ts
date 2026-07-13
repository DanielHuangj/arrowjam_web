import type { BoardSize, LevelData, MaskRows, Vec2, BoardShape } from "./types.ts";
import { inBounds, vecKey } from "./types.ts";

export type MaskRow = [number, number, number];

export function buildFullBoardPlayable(width: number, height: number): Set<string> {
  const cells = new Set<string>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      cells.add(vecKey([x, y]));
    }
  }
  return cells;
}

export function expandMaskRows(
  width: number,
  height: number,
  rows: MaskRow[],
): Set<string> {
  const cells = new Set<string>();
  for (const [y, startX, endX] of rows) {
    const lo = Math.min(startX, endX);
    const hi = Math.max(startX, endX);
    for (let x = lo; x <= hi; x++) {
      const cell: Vec2 = [x, y];
      if (inBounds(cell, width, height)) cells.add(vecKey(cell));
    }
  }
  return cells;
}

export function compressCellsToRows(
  cells: Iterable<string>,
  width: number,
  height: number,
): MaskRow[] {
  const byY = new Map<number, number[]>();
  for (const key of cells) {
    const [xs, ys] = key.split(",");
    const x = Number(xs);
    const y = Number(ys);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (!inBounds([x, y], width, height)) continue;
    let row = byY.get(y);
    if (!row) {
      row = [];
      byY.set(y, row);
    }
    row.push(x);
  }
  const rows: MaskRow[] = [];
  for (const [y, xs] of [...byY.entries()].sort((a, b) => a[0] - b[0])) {
    xs.sort((a, b) => a - b);
    let start = xs[0]!;
    let prev = xs[0]!;
    for (let i = 1; i < xs.length; i++) {
      const x = xs[i]!;
      if (x === prev + 1) {
        prev = x;
        continue;
      }
      rows.push([y, start, prev]);
      start = x;
      prev = x;
    }
    rows.push([y, start, prev]);
  }
  return rows;
}

export function normalizeMaskRows(rows: MaskRow[]): MaskRow[] {
  const cells = new Set<string>();
  for (const [y, a, b] of rows) {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    for (let x = lo; x <= hi; x++) cells.add(`${x},${y}`);
  }
  return compressCellsToRows(cells, 9999, 9999).map(([y, sx, ex]) => [y, sx, ex]);
}

export function resolveBoardShape(data: Pick<LevelData, "boardShape">): BoardShape {
  return data.boardShape === "custom" ? "custom" : "full";
}

export function buildBoardMaskFromLevel(data: Pick<LevelData, "width" | "height" | "boardShape" | "playableMask" | "blackHoleRegions">): {
  boardShape: BoardShape;
  playableCells: Set<string>;
  blackHoleCells: Set<string>;
} {
  const boardShape = resolveBoardShape(data);
  const playableCells =
    boardShape === "custom" && data.playableMask?.rows?.length
      ? expandMaskRows(data.width, data.height, data.playableMask.rows)
      : buildFullBoardPlayable(data.width, data.height);

  const blackHoleCells = new Set<string>();
  for (const region of data.blackHoleRegions ?? []) {
    for (const key of expandMaskRows(data.width, data.height, region.rows ?? [])) {
      blackHoleCells.add(key);
    }
  }

  return { boardShape, playableCells, blackHoleCells };
}

export function isPlayableCell(
  cell: Vec2,
  board: BoardSize,
  playableCells: Set<string>,
): boolean {
  return inBounds(cell, board.width, board.height) && playableCells.has(vecKey(cell));
}

export function isBlackHoleCell(cell: Vec2, blackHoleCells: Set<string>): boolean {
  return blackHoleCells.has(vecKey(cell));
}

export function isOrthogonallyConnected(cells: Set<string>): boolean {
  if (cells.size <= 1) return cells.size === 1;
  const start = cells.values().next().value!;
  const queue = [start];
  const seen = new Set<string>([start]);
  let head = 0;
  while (head < queue.length) {
    const key = queue[head++]!;
    const [xs, ys] = key.split(",");
    const x = Number(xs);
    const y = Number(ys);
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as Vec2[]) {
      const nk = vecKey([x + dx, y + dy]);
      if (!cells.has(nk) || seen.has(nk)) continue;
      seen.add(nk);
      queue.push(nk);
    }
  }
  return seen.size === cells.size;
}

export function maskRowsFromSet(
  cells: Set<string>,
  width: number,
  height: number,
): MaskRows {
  return { rows: compressCellsToRows(cells, width, height) };
}
