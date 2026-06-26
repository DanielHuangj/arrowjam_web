import type { EditorDocument, RawItem, Vec2 } from "@arrowjaw/shared";
import {
  arrowPathSelfOverlaps,
  arrowPositionsOverlapExisting,
  getEditableItems,
} from "@arrowjaw/shared";
import { findItemById, vecKey } from "@arrowjaw/shared";

export function getActiveZone(doc: EditorDocument): RawItem | null {
  const zid = doc.editContext.zoneInstanceId;
  if (zid == null) return null;
  const zone = findItemById(doc.itemModels, zid);
  return zone?.kind === 12 ? zone : null;
}

export function getZoneCellSet(zone: RawItem): Set<string> {
  return new Set(zone.occupiedPositions.map((p) => vecKey(p)));
}

export function positionsWithinZone(zone: RawItem, positions: Vec2[]): boolean {
  if (positions.length === 0) return false;
  const cells = getZoneCellSet(zone);
  return positions.every((p) => cells.has(vecKey(p)));
}

/** 顶层编辑时不限制；子区域编辑时所有占用格须在子区域矩形内 */
export function canPlaceInEditContext(doc: EditorDocument, positions: Vec2[]): boolean {
  const zone = getActiveZone(doc);
  if (!zone) return true;
  return positionsWithinZone(zone, positions);
}

export type ArrowPlacementBlockReason = "zone" | "self" | "overlap";

/** 折线箭放置：子区域范围 + 不自交 + 不与其他箭同格 */
export function getArrowPlacementBlockReason(
  doc: EditorDocument,
  positions: Vec2[],
  excludeInstanceId?: number,
): ArrowPlacementBlockReason | null {
  if (!canPlaceInEditContext(doc, positions)) return "zone";
  if (arrowPathSelfOverlaps(positions)) return "self";
  if (arrowPositionsOverlapExisting(getEditableItems(doc), positions, excludeInstanceId)) {
    return "overlap";
  }
  return null;
}

export function canPlaceArrowInEditContext(
  doc: EditorDocument,
  positions: Vec2[],
  excludeInstanceId?: number,
): boolean {
  return getArrowPlacementBlockReason(doc, positions, excludeInstanceId) == null;
}

export function arrowPlacementBlockMessage(reason: ArrowPlacementBlockReason): string {
  switch (reason) {
    case "zone":
      return "物件超出子区域范围";
    case "self":
      return "折线箭路径不可自交";
    case "overlap":
      return "折线箭不可与其他箭占用同一格";
  }
}
