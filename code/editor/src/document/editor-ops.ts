import type { EditorDocument, RawItem, Vec2 } from "@arrowjaw/shared";
import {
  findItemById,
  findItemParentList,
  getEditableItems,
  nextInstanceId,
} from "@arrowjaw/shared";

function positionsEqual(a: Vec2[], b: Vec2[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((p, i) => p[0] === b[i]![0] && p[1] === b[i]![1]);
}

function setSiblingList(doc: EditorDocument, hostId: number, newList: RawItem[]): EditorDocument {
  function replace(items: RawItem[]): RawItem[] {
    if (items.some((i) => i.instanceId === hostId)) return newList;
    return items.map((item) =>
      item.items?.length ? { ...item, items: replace(item.items) } : item,
    );
  }
  return { ...doc, itemModels: replace(doc.itemModels), dirty: true };
}

/** 宿主箭移动/改坐标后，同步同层 kind5/kind13 绑定坐标 */
export function syncAttachmentsForHost(
  doc: EditorDocument,
  hostId: number,
  hostPositions: Vec2[],
  previousPositions?: Vec2[],
): EditorDocument {
  const parent = findItemParentList(doc.itemModels, hostId);
  if (!parent) return doc;
  const ref = previousPositions ?? hostPositions;

  const newList = parent.list.map((item) => {
    if (item.instanceId === hostId) return item;
    if (item.kind === 13) {
      if (positionsEqual(item.occupiedPositions, ref)) {
        return {
          ...item,
          occupiedPositions: hostPositions.map(([x, y]) => [x, y] as Vec2),
        };
      }
    }
    if (item.kind === 5) {
      const cell = item.occupiedPositions[0];
      if (!cell) return item;
      const idx = ref.findIndex((p) => p[0] === cell[0] && p[1] === cell[1]);
      if (idx >= 0 && idx < hostPositions.length) {
        const nextCell = hostPositions[idx]!;
        return { ...item, occupiedPositions: [[nextCell[0], nextCell[1]]] };
      }
    }
    return item;
  });

  return setSiblingList(doc, hostId, newList);
}

function attachmentIdsToRemove(items: RawItem[], removedHostId: number): number[] {
  const parent = findItemParentList(items, removedHostId);
  if (!parent) return [];
  const removedHost = parent.list[parent.index];
  if (!removedHost || (removedHost.kind !== 1 && removedHost.kind !== 2)) return [];

  const ids: number[] = [];
  for (const item of parent.list) {
    if (item.instanceId === removedHostId) continue;
    if (item.kind === 13 && positionsEqual(item.occupiedPositions, removedHost.occupiedPositions)) {
      ids.push(item.instanceId);
    }
    if (item.kind === 5) {
      const cell = item.occupiedPositions[0];
      if (
        cell &&
        removedHost.occupiedPositions.some((p) => p[0] === cell[0] && p[1] === cell[1])
      ) {
        ids.push(item.instanceId);
      }
    }
  }
  return ids;
}

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
  const extra = new Set<number>();
  for (const id of ids) {
    const item = findItemById(doc.itemModels, id);
    if (item && (item.kind === 1 || item.kind === 2)) {
      for (const attachId of attachmentIdsToRemove(doc.itemModels, id)) {
        extra.add(attachId);
      }
    }
  }
  for (const id of extra) idSet.add(id);
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
  let next = { ...doc, itemModels: patchList(doc.itemModels), dirty: true };
  if (patch.occupiedPositions) {
    const oldItem = findItemById(doc.itemModels, id);
    if (oldItem && (oldItem.kind === 1 || oldItem.kind === 2)) {
      next = syncAttachmentsForHost(
        next,
        id,
        patch.occupiedPositions,
        oldItem.occupiedPositions,
      );
    }
  }
  return next;
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
