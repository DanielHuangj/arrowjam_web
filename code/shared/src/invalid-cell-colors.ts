import type { ColoredMaskEntry, InvalidCellColorId, LevelData, MaskRows } from "./types.ts";
import { compressCellsToRows, expandMaskRows } from "./board-mask.ts";

/** 无效格默认色（白色，不写入关卡 JSON） */
export const INVALID_CELL_COLOR_WHITE = 0 as const;
/** 无效格黑色 */
export const INVALID_CELL_COLOR_BLACK = 9 as const;

export const INVALID_CELL_PAINT_COLOR_IDS = [
  1, 2, 3, 4, 6, 7, 8, INVALID_CELL_COLOR_BLACK,
] as const;

const VALID_STORED = new Set<number>([...INVALID_CELL_PAINT_COLOR_IDS]);

export function isValidInvalidCellColorId(color: number): color is InvalidCellColorId {
  return VALID_STORED.has(color);
}

export function buildInvalidCellColorMap(
  data: Pick<LevelData, "width" | "height" | "invalidCellColors">,
): Map<string, InvalidCellColorId> {
  const map = new Map<string, InvalidCellColorId>();
  for (const entry of data.invalidCellColors ?? []) {
    if (!isValidInvalidCellColorId(entry.color)) continue;
    for (const key of expandMaskRows(data.width, data.height, entry.rows ?? [])) {
      map.set(key, entry.color);
    }
  }
  return map;
}

export function serializeInvalidCellColors(
  colorByCell: ReadonlyMap<string, InvalidCellColorId>,
  width: number,
  height: number,
): ColoredMaskEntry[] | undefined {
  if (colorByCell.size === 0) return undefined;
  const byColor = new Map<number, Set<string>>();
  for (const [key, color] of colorByCell) {
    if (!isValidInvalidCellColorId(color)) continue;
    let set = byColor.get(color);
    if (!set) {
      set = new Set();
      byColor.set(color, set);
    }
    set.add(key);
  }
  if (byColor.size === 0) return undefined;
  const entries: ColoredMaskEntry[] = [];
  for (const [color, cells] of [...byColor.entries()].sort((a, b) => a[0] - b[0])) {
    entries.push({
      color: color as InvalidCellColorId,
      rows: compressCellsToRows(cells, width, height),
    });
  }
  return entries;
}

export function coloredMaskToMap(
  width: number,
  height: number,
  entries: ColoredMaskEntry[] | undefined,
): Map<string, InvalidCellColorId> {
  return buildInvalidCellColorMap({ width, height, invalidCellColors: entries });
}

export function pruneInvalidCellColors(
  colorByCell: Map<string, InvalidCellColorId>,
  invalidCells: Set<string>,
): Map<string, InvalidCellColorId> {
  const next = new Map<string, InvalidCellColorId>();
  for (const [key, color] of colorByCell) {
    if (invalidCells.has(key)) next.set(key, color);
  }
  return next;
}

export function applyInvalidCellColor(
  draft: Map<string, InvalidCellColorId>,
  cells: Iterable<string>,
  color: InvalidCellColorId,
): Map<string, InvalidCellColorId> {
  const next = new Map(draft);
  for (const key of cells) {
    if (color === INVALID_CELL_COLOR_WHITE) next.delete(key);
    else next.set(key, color);
  }
  return next;
}

export function cloneColoredMaskEntries(
  entries: ColoredMaskEntry[] | undefined,
): ColoredMaskEntry[] | undefined {
  if (!entries?.length) return undefined;
  return entries.map((e) => ({
    color: e.color,
    rows: e.rows.map(([y, a, b]) => [y, a, b] as [number, number, number]),
  }));
}

export function maskRowsFromColorMap(
  colorByCell: ReadonlyMap<string, InvalidCellColorId>,
  width: number,
  height: number,
): MaskRows[] {
  const entries = serializeInvalidCellColors(colorByCell, width, height);
  if (!entries) return [];
  return entries.map((e) => ({ rows: e.rows }));
}
