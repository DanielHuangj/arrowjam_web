import type { EditorDocument, RawItem, Vec2 } from "@arrowjaw/shared";
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
