import type { EditorDocument, InvalidCellColorId, MaskRows, Vec2 } from "@arrowjaw/shared";
import {
  buildFullBoardPlayable,
  buildInvalidCellColorMap,
  compressCellsToRows,
  expandMaskRows,
  vecKey,
} from "@arrowjaw/shared";
import { getEditableItems } from "@arrowjaw/shared";

export function resolvePlayableCells(doc: EditorDocument): Set<string> {
  const { width, height, boardShape, playableMask } = doc.meta;
  if (boardShape === "custom" && playableMask?.rows?.length) {
    return expandMaskRows(width, height, playableMask.rows);
  }
  return buildFullBoardPlayable(width, height);
}

export function resolveInvalidCells(doc: EditorDocument): Set<string> {
  const { width, height, boardShape } = doc.meta;
  if (boardShape !== "custom") return new Set();
  const playable = resolvePlayableCells(doc);
  const invalid = new Set<string>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const key = vecKey([x, y]);
      if (!playable.has(key)) invalid.add(key);
    }
  }
  return invalid;
}

export function hasCustomInvalidRegion(doc: EditorDocument): boolean {
  if (doc.meta.boardShape !== "custom") return false;
  const total = doc.meta.width * doc.meta.height;
  return resolvePlayableCells(doc).size < total;
}

export function loadInvalidColorDraft(doc: EditorDocument): Map<string, InvalidCellColorId> {
  return buildInvalidCellColorMap({
    width: doc.meta.width,
    height: doc.meta.height,
    invalidCellColors: doc.meta.invalidCellColors,
  });
}

export function resolveBlackHoleCells(doc: EditorDocument): Set<string> {
  const { width, height, blackHoleRegions } = doc.meta;
  const cells = new Set<string>();
  for (const region of blackHoleRegions ?? []) {
    for (const key of expandMaskRows(width, height, region.rows ?? [])) {
      cells.add(key);
    }
  }
  return cells;
}

export function loadRegionDraftCells(
  doc: EditorDocument,
  mode: "playable" | "blackHole",
): Set<string> {
  if (mode === "playable") return new Set(resolvePlayableCells(doc));
  return new Set(resolveBlackHoleCells(doc));
}

export function toggleRegionDraftCell(draft: Set<string>, cell: Vec2): Set<string> {
  const key = vecKey(cell);
  const next = new Set(draft);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export function applyRegionDraftRect(
  draft: Set<string>,
  cells: Vec2[],
  mode: "toggle" | "select" | "deselect",
): Set<string> {
  const next = new Set(draft);
  for (const cell of cells) {
    const key = vecKey(cell);
    if (mode === "toggle") {
      if (next.has(key)) next.delete(key);
      else next.add(key);
    } else if (mode === "select") {
      next.add(key);
    } else {
      next.delete(key);
    }
  }
  return next;
}

export function cellsToMaskRows(
  doc: EditorDocument,
  cells: Set<string>,
): MaskRows {
  return { rows: compressCellsToRows(cells, doc.meta.width, doc.meta.height) };
}

export function findItemsOutsidePlayable(
  doc: EditorDocument,
  playable: Set<string>,
): number[] {
  const ids: number[] = [];
  for (const item of getEditableItems(doc)) {
    if (item.occupiedPositions.some((p) => !playable.has(vecKey(p)))) {
      ids.push(item.instanceId);
    }
  }
  return ids;
}

export function findItemsOnBlackHoleCells(
  doc: EditorDocument,
  blackHole: Set<string>,
): number[] {
  const ids: number[] = [];
  for (const item of getEditableItems(doc)) {
    if (item.occupiedPositions.some((p) => blackHole.has(vecKey(p)))) {
      ids.push(item.instanceId);
    }
  }
  return ids;
}

export type PlayableCommitError =
  | "empty"
  | "itemsOutside"
  | "blackHolesOutside";

export function validatePlayableCommit(
  doc: EditorDocument,
  cells: Set<string>,
): PlayableCommitError | null {
  if (cells.size === 0) return "empty";
  if (findItemsOutsidePlayable(doc, cells).length > 0) return "itemsOutside";
  for (const key of resolveBlackHoleCells(doc)) {
    if (!cells.has(key)) return "blackHolesOutside";
  }
  return null;
}

/** 有效格编辑时，已设黑洞格不可被 toggle 为无效 */
export function enforceBlackHolesInPlayableDraft(
  doc: EditorDocument,
  draft: Set<string>,
): Set<string> {
  const blackHoles = resolveBlackHoleCells(doc);
  if (blackHoles.size === 0) return draft;
  const next = new Set(draft);
  for (const key of blackHoles) next.add(key);
  return next;
}

export type BlackHoleCommitError = "outsidePlayable" | "itemsOverlap";

export function validateBlackHoleCommit(
  doc: EditorDocument,
  cells: Set<string>,
  playable: Set<string>,
): BlackHoleCommitError | null {
  for (const key of cells) {
    if (!playable.has(key)) return "outsidePlayable";
  }
  if (findItemsOnBlackHoleCells(doc, cells).length > 0) return "itemsOverlap";
  return null;
}

export function isCellPlacementAllowed(
  doc: EditorDocument,
  cell: Vec2,
): boolean {
  if (doc.editContext.regionEditMode != null) return false;
  const key = vecKey(cell);
  const playable = resolvePlayableCells(doc);
  if (!playable.has(key)) return false;
  if (resolveBlackHoleCells(doc).has(key)) return false;
  return true;
}

export function arePositionsPlacementAllowed(
  doc: EditorDocument,
  positions: Vec2[],
): boolean {
  return positions.every((p) => isCellPlacementAllowed(doc, p));
}

export function playableCommitErrorMessage(err: PlayableCommitError): string {
  switch (err) {
    case "empty":
      return "有效格不能为空";
    case "itemsOutside":
      return "有物件位于无效格，请先移出再完成编辑";
    case "blackHolesOutside":
      return "不能将黑洞格设为无效格，请先删除对应黑洞区域";
  }
}

export function blackHoleCommitErrorMessage(err: BlackHoleCommitError): string {
  switch (err) {
    case "outsidePlayable":
      return "黑洞格必须在有效格内";
    case "itemsOverlap":
      return "黑洞格不可与物件重叠，请先移出物件";
  }
}
