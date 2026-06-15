import type { RawItem, Vec2 } from "./types.ts";
import { vecKey } from "./types.ts";

export function collectAllItems(items: RawItem[]): RawItem[] {
  const out: RawItem[] = [];
  function walk(list: RawItem[]) {
    for (const item of list) {
      out.push(item);
      if (item.kind === 12 && item.items) walk(item.items);
    }
  }
  walk(items);
  return out;
}

export function findDuplicateInstanceIds(items: RawItem[]): number[] {
  const seen = new Map<number, number>();
  const dups: number[] = [];
  for (const item of collectAllItems(items)) {
    const n = (seen.get(item.instanceId) ?? 0) + 1;
    seen.set(item.instanceId, n);
    if (n === 2) dups.push(item.instanceId);
  }
  return dups;
}

export function reassignDuplicateIds(items: RawItem[]): { items: RawItem[]; reassigned: number[] } {
  const all = collectAllItems(items);
  const seen = new Set<number>();
  const reassigned: number[] = [];
  let nextId = Math.max(0, ...all.map((i) => i.instanceId)) + 1;

  function walk(list: RawItem[]): RawItem[] {
    return list.map((item) => {
      let id = item.instanceId;
      if (seen.has(id)) {
        reassigned.push(id);
        id = nextId++;
      }
      seen.add(id);
      const copy: RawItem = { ...item, instanceId: id };
      if (item.items) copy.items = walk(item.items);
      return copy;
    });
  }

  return { items: walk(items), reassigned };
}

export function getEditableItems(doc: { itemModels: RawItem[]; editContext: { zoneInstanceId: number | null } }): RawItem[] {
  if (doc.editContext.zoneInstanceId == null) return doc.itemModels;
  const zone = findItemById(doc.itemModels, doc.editContext.zoneInstanceId);
  return zone?.items ?? [];
}

export function findItemById(items: RawItem[], id: number): RawItem | null {
  for (const item of items) {
    if (item.instanceId === id) return item;
    if (item.items) {
      const found = findItemById(item.items, id);
      if (found) return found;
    }
  }
  return null;
}

export function findItemParentList(
  items: RawItem[],
  id: number,
): { list: RawItem[]; index: number } | null {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (item.instanceId === id) return { list: items, index: i };
    if (item.items) {
      const found = findItemParentList(item.items, id);
      if (found) return found;
    }
  }
  return null;
}

export function isRectangular(positions: [number, number][]): boolean {
  if (positions.length === 0) return false;
  const xs = positions.map((p) => p[0]);
  const ys = positions.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const expected = (maxX - minX + 1) * (maxY - minY + 1);
  if (expected !== positions.length) return false;
  const set = new Set(positions.map((p) => vecKey(p)));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!set.has(vecKey([x, y]))) return false;
    }
  }
  return true;
}

export function rectPositions(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number][] {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const out: [number, number][] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) out.push([x, y]);
  }
  return out;
}

export function isPolylineContinuous(positions: Vec2[]): boolean {
  for (let i = 1; i < positions.length; i++) {
    const a = positions[i - 1]!;
    const b = positions[i]!;
    const dist = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
    if (dist !== 1) return false;
  }
  return positions.length > 0;
}

export function nextInstanceId(items: RawItem[]): number {
  const all = collectAllItems(items);
  if (all.length === 0) return 1;
  return Math.max(...all.map((i) => i.instanceId)) + 1;
}

export function levelDataFromDocument(doc: {
  meta: {
    width: number;
    height: number;
    name: string;
    durationInSec: number;
    difficulty: number;
    levelKind?: number;
  };
  itemModels: RawItem[];
}): import("./types.ts").LevelData {
  const data: import("./types.ts").LevelData = {
    width: doc.meta.width,
    height: doc.meta.height,
    name: doc.meta.name,
    durationInSec: doc.meta.durationInSec,
    difficulty: doc.meta.difficulty,
    itemModels: doc.itemModels,
  };
  if (doc.meta.levelKind != null) data.levelKind = doc.meta.levelKind;
  return data;
}
