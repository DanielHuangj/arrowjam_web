import type { EditorDocument, RawItem, Vec2 } from "@arrowjaw/shared";
import {
  findItemById,
  findItemParentList,
  getEditableItems,
  nextInstanceId,
  hostMiddleCell,
  nextControllerCellForHost,
  vecKey,
} from "@arrowjaw/shared";
import {
  canPlaceArrowInEditContext,
  canPlaceInEditContext,
} from "./zone-bounds.ts";

function positionsEqual(a: Vec2[], b: Vec2[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((p, i) => p[0] === b[i]![0] && p[1] === b[i]![1]);
}

function rigidTranslationDelta(old: Vec2[], next: Vec2[]): Vec2 | null {
  if (old.length !== next.length || old.length === 0) return null;
  const dx = next[0]![0] - old[0]![0];
  const dy = next[0]![1] - old[0]![1];
  for (let i = 1; i < old.length; i++) {
    if (next[i]![0] - old[i]![0] !== dx || next[i]![1] - old[i]![1] !== dy) {
      return null;
    }
  }
  return [dx, dy];
}

function translateVec2List(list: Vec2[], dx: number, dy: number): Vec2[] {
  return list.map(([x, y]) => [x + dx, y + dy] as Vec2);
}

function translatePipePasses(passes: unknown, dx: number, dy: number): unknown {
  if (!Array.isArray(passes)) return passes;
  return passes.map((entry) => {
    if (entry && typeof entry === "object" && "position" in entry) {
      const pass = entry as { position: Vec2; directions?: Vec2[] };
      return {
        ...pass,
        position: [pass.position[0] + dx, pass.position[1] + dy] as Vec2,
      };
    }
    if (Array.isArray(entry) && entry.length >= 2) {
      return [entry[0] + dx, entry[1] + dy];
    }
    return entry;
  });
}

function syncRigidItemTranslation(
  item: RawItem,
  oldPositions: Vec2[],
  newPositions: Vec2[],
  patch: Partial<RawItem>,
): Partial<RawItem> {
  const delta = rigidTranslationDelta(oldPositions, newPositions);
  if (!delta) return patch;
  const [dx, dy] = delta;
  const next = { ...patch };

  if (item.kind === 3 && patch.passes === undefined && item.passes != null) {
    next.passes = translatePipePasses(item.passes, dx, dy);
  }
  if (item.kind === 7 && patch.movingPath === undefined && item.movingPath?.length) {
    next.movingPath = translateVec2List(item.movingPath, dx, dy);
  }
  return next;
}

function syncShrinkPipesForPipe(
  doc: EditorDocument,
  pipeId: number,
  oldPositions: Vec2[],
  newPositions: Vec2[],
): EditorDocument {
  const delta = rigidTranslationDelta(oldPositions, newPositions);
  if (!delta) return doc;
  const [dx, dy] = delta;
  const oldPipeKeys = new Set(oldPositions.map((p) => vecKey(p)));

  function patchList(items: RawItem[]): RawItem[] {
    return items.map((item) => {
      let next = item;
      if (item.kind === 14) {
        const bind = item.bindCoordinate as Vec2 | undefined;
        if (bind && oldPipeKeys.has(vecKey(bind))) {
          next = {
            ...next,
            bindCoordinate: [bind[0] + dx, bind[1] + dy] as Vec2,
            occupiedPositions: translateVec2List(item.occupiedPositions, dx, dy),
          };
        }
      }
      if (item.items) next = { ...next, items: patchList(item.items) };
      return next;
    });
  }

  return { ...doc, itemModels: patchList(doc.itemModels), dirty: true };
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
  const hostItem = parent.list[parent.index];

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
    if (item.kind === 16 && item.bindInstanceId === hostId) {
      if (hostItem?.kind === 14) {
        const middle = hostMiddleCell(hostPositions);
        return { ...item, occupiedPositions: [[middle[0], middle[1]]] };
      }
      const nextCell = nextControllerCellForHost(item, ref, hostPositions);
      return { ...item, occupiedPositions: [[nextCell[0], nextCell[1]]] };
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
  const oldItem = findItemById(doc.itemModels, id);
  let effectivePatch = patch;
  if (oldItem && patch.occupiedPositions) {
    effectivePatch = syncRigidItemTranslation(
      oldItem,
      oldItem.occupiedPositions,
      patch.occupiedPositions,
      patch,
    );
  }

  function patchList(items: RawItem[]): RawItem[] {
    return items.map((item) => {
      if (item.instanceId === id) return { ...item, ...effectivePatch };
      if (item.items) return { ...item, items: patchList(item.items) };
      return item;
    });
  }
  let next = { ...doc, itemModels: patchList(doc.itemModels), dirty: true };
  if (effectivePatch.occupiedPositions && oldItem) {
    if (
      oldItem.kind === 1 ||
      oldItem.kind === 2 ||
      oldItem.kind === 7 ||
      oldItem.kind === 14
    ) {
      next = syncAttachmentsForHost(
        next,
        id,
        effectivePatch.occupiedPositions,
        oldItem.occupiedPositions,
      );
    }
    if (oldItem.kind === 3) {
      next = syncShrinkPipesForPipe(
        next,
        id,
        oldItem.occupiedPositions,
        effectivePatch.occupiedPositions,
      );
    }
  }
  return next;
}

export type DragPositionSnapshots = Map<number, Vec2[]>;

function canPlaceDraggedItem(
  doc: EditorDocument,
  item: RawItem,
  positions: Vec2[],
  movingIds: Set<number>,
): boolean {
  if (item.kind === 1 || item.kind === 2) {
    return canPlaceArrowInEditContext(doc, positions, movingIds);
  }
  if (item.kind === 16) {
    const host = findItemById(doc.itemModels, item.bindInstanceId as number);
    if (!host) return false;
    const hostKeys = new Set(host.occupiedPositions.map((p) => vecKey(p)));
    if (!positions.every((p) => hostKeys.has(vecKey(p)))) return false;
  }
  return canPlaceInEditContext(doc, positions);
}

/** 按拖拽起点与当前格，整体平移一组物件；无法放置时返回 null */
export function applyDragDelta(
  doc: EditorDocument,
  snapshots: DragPositionSnapshots,
  origin: Vec2,
  currentCell: Vec2,
): EditorDocument | null {
  const dx = currentCell[0] - origin[0];
  const dy = currentCell[1] - origin[1];
  if (dx === 0 && dy === 0) return doc;

  const movingIds = new Set(snapshots.keys());
  for (const [id, orig] of snapshots) {
    const item = findItemById(doc.itemModels, id);
    if (!item) continue;
    const positions = translateVec2List(orig, dx, dy);
    if (!canPlaceDraggedItem(doc, item, positions, movingIds)) return null;
  }

  let next = doc;
  for (const [id, orig] of snapshots) {
    next = updateItem(next, id, {
      occupiedPositions: translateVec2List(orig, dx, dy),
    });
  }
  return next;
}

export function revertDragSnapshots(
  doc: EditorDocument,
  snapshots: DragPositionSnapshots,
): EditorDocument {
  let next = doc;
  for (const [id, orig] of snapshots) {
    next = updateItem(next, id, { occupiedPositions: orig });
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
