import type { EditorDocument, RawItem, Vec2 } from "@arrowjaw/shared";
import {
  findItemById,
  getEditableItems,
  nextInstanceId,
} from "@arrowjaw/shared";

export function getActiveItemList(doc: EditorDocument): RawItem[] {
  if (doc.editContext.zoneInstanceId == null) return doc.itemModels;
  const zone = findItemById(doc.itemModels, doc.editContext.zoneInstanceId);
  if (!zone) return doc.itemModels;
  if (!zone.items) zone.items = [];
  return zone.items;
}

export function setActiveItemList(doc: EditorDocument, list: RawItem[]): EditorDocument {
  if (doc.editContext.zoneInstanceId == null) {
    return { ...doc, itemModels: list, dirty: true };
  }
  const zoneId = doc.editContext.zoneInstanceId;
  function updateZones(items: RawItem[]): RawItem[] {
    return items.map((item) => {
      if (item.instanceId === zoneId) {
        return { ...item, items: list };
      }
      if (item.items) return { ...item, items: updateZones(item.items) };
      return item;
    });
  }
  return { ...doc, itemModels: updateZones(doc.itemModels), dirty: true };
}

export function addItem(doc: EditorDocument, item: Omit<RawItem, "instanceId">): EditorDocument {
  const list = [...getActiveItemList(doc)];
  const newItem: RawItem = {
    ...item,
    instanceId: nextInstanceId(doc.itemModels),
  };
  list.push(newItem);
  return {
    ...setActiveItemList(doc, list),
    selectedInstanceIds: [newItem.instanceId],
  };
}

export function removeItems(doc: EditorDocument, ids: number[]): EditorDocument {
  const idSet = new Set(ids);
  function filterList(items: RawItem[]): RawItem[] {
    return items
      .filter((i) => !idSet.has(i.instanceId))
      .map((i) => (i.items ? { ...i, items: filterList(i.items) } : i));
  }
  const next = {
    ...doc,
    itemModels: filterList(doc.itemModels),
    dirty: true,
    selectedInstanceIds: doc.selectedInstanceIds.filter((id) => !idSet.has(id)),
  };
  if (
    doc.editContext.zoneInstanceId != null &&
    idSet.has(doc.editContext.zoneInstanceId)
  ) {
    next.editContext = { zoneInstanceId: null };
  }
  return next;
}

export function updateItem(
  doc: EditorDocument,
  id: number,
  patch: Partial<RawItem>,
): EditorDocument {
  function patchList(items: RawItem[]): RawItem[] {
    return items.map((item) => {
      if (item.instanceId === id) return { ...item, ...patch };
      if (item.items) return { ...item, items: patchList(item.items) };
      return item;
    });
  }
  return { ...doc, itemModels: patchList(doc.itemModels), dirty: true };
}

export function moveItemPositions(
  doc: EditorDocument,
  id: number,
  delta: Vec2,
): EditorDocument {
  const item = findItemById(doc.itemModels, id);
  if (!item) return doc;
  const positions = item.occupiedPositions.map(
    ([x, y]) => [x + delta[0], y + delta[1]] as Vec2,
  );
  return updateItem(doc, id, { occupiedPositions: positions });
}

export function selectItem(doc: EditorDocument, id: number | null, multi = false): EditorDocument {
  if (id == null) return { ...doc, selectedInstanceIds: [] };
  if (multi) {
    const set = new Set(doc.selectedInstanceIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    return { ...doc, selectedInstanceIds: [...set] };
  }
  return { ...doc, selectedInstanceIds: [id] };
}

/** 框选：选中矩形范围内任意占用格落在范围内的物件 */
export function selectItemsInRect(
  doc: EditorDocument,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  addToSelection = false,
): EditorDocument {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const ids: number[] = [];
  for (const item of getEditableItems(doc)) {
    const hit = item.occupiedPositions.some(
      ([x, y]) => x >= minX && x <= maxX && y >= minY && y <= maxY,
    );
    if (hit) ids.push(item.instanceId);
  }
  const selected = addToSelection
    ? [...new Set([...doc.selectedInstanceIds, ...ids])]
    : ids;
  return { ...doc, selectedInstanceIds: selected };
}

export function findItemAtCell(doc: EditorDocument, cell: Vec2): RawItem | null {
  const all = getEditableItems(doc);
  for (let i = all.length - 1; i >= 0; i--) {
    const item = all[i]!;
    if (item.occupiedPositions.some(([x, y]) => x === cell[0] && y === cell[1])) {
      return item;
    }
  }
  return null;
}

export function enterZone(doc: EditorDocument, zoneId: number): EditorDocument {
  return {
    ...doc,
    editContext: { zoneInstanceId: zoneId },
    selectedInstanceIds: [],
  };
}

export function exitZone(doc: EditorDocument): EditorDocument {
  return {
    ...doc,
    editContext: { zoneInstanceId: null },
    selectedInstanceIds: [],
  };
}

export function updateMeta(
  doc: EditorDocument,
  patch: Partial<EditorDocument["meta"]>,
): EditorDocument {
  return { ...doc, meta: { ...doc.meta, ...patch }, dirty: true };
}

export function copyItems(doc: EditorDocument): RawItem[] {
  const ids = new Set(doc.selectedInstanceIds);
  return getEditableItems(doc)
    .filter((i) => ids.has(i.instanceId))
    .map((i) => structuredClone(i));
}

export function pasteItems(doc: EditorDocument, items: RawItem[], offset: Vec2 = [1, 1]): EditorDocument {
  let next = doc;
  const newIds: number[] = [];
  for (const src of items) {
    const positions = src.occupiedPositions.map(
      ([x, y]) => [x + offset[0], y + offset[1]] as Vec2,
    );
    const { instanceId: _id, items: _nested, ...rest } = src;
    const item = addItem(next, { ...rest, occupiedPositions: positions });
    const addedId = item.selectedInstanceIds[0]!;
    newIds.push(addedId);
    next = item;
  }
  return { ...next, selectedInstanceIds: newIds };
}
