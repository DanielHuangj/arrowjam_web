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

const ARROW_BODY_KINDS = new Set([1, 2]);

export interface ArrowCellOverlap {
  cell: string;
  ids: number[];
}

/** kind1/kind2 折线箭身格不可与同作用域内其他折线箭共享（顶层与各子区域分别检测） */
function findArrowCellOverlapsInScope(arrows: RawItem[]): ArrowCellOverlap[] {
  const cellToIds = new Map<string, Set<number>>();
  for (const item of arrows) {
    if (!ARROW_BODY_KINDS.has(item.kind)) continue;
    for (const p of item.occupiedPositions) {
      const key = vecKey(p);
      if (!cellToIds.has(key)) cellToIds.set(key, new Set());
      cellToIds.get(key)!.add(item.instanceId);
    }
  }
  const overlaps: ArrowCellOverlap[] = [];
  for (const [cell, ids] of cellToIds) {
    if (ids.size > 1) overlaps.push({ cell, ids: [...ids] });
  }
  return overlaps;
}

function arrowScopes(items: RawItem[]): RawItem[][] {
  const scopes: RawItem[][] = [];
  const topArrows = items.filter((i) => ARROW_BODY_KINDS.has(i.kind));
  if (topArrows.length > 0) scopes.push(topArrows);
  for (const item of items) {
    if (item.kind === 12 && item.items?.length) {
      const inner = item.items.filter((i) => ARROW_BODY_KINDS.has(i.kind));
      if (inner.length > 0) scopes.push(inner);
    }
  }
  return scopes;
}

/** 顶层 itemModels + 各子区域 items（与折线箭同作用域划分） */
function placementScopes(items: RawItem[]): RawItem[][] {
  const scopes: RawItem[][] = [];
  const top = items.filter((i) => i.kind !== 12);
  if (top.length > 0) scopes.push(top);
  for (const item of items) {
    if (item.kind === 12 && item.items?.length) {
      scopes.push(item.items);
    }
  }
  return scopes;
}

function findPipeArrowCellOverlapsInScope(scope: RawItem[]): PipeArrowOverlap[] {
  const arrowCellToId = new Map<string, number>();
  for (const item of scope) {
    if (!ARROW_BODY_KINDS.has(item.kind)) continue;
    for (const p of item.occupiedPositions) {
      arrowCellToId.set(vecKey(p), item.instanceId);
    }
  }
  const overlaps: PipeArrowOverlap[] = [];
  for (const item of scope) {
    if (item.kind !== 3) continue;
    for (const p of item.occupiedPositions) {
      const key = vecKey(p);
      const arrowId = arrowCellToId.get(key);
      if (arrowId != null) {
        overlaps.push({ cell: key, pipeId: item.instanceId, arrowId });
      }
    }
  }
  return overlaps;
}

function findCornerArrowCellOverlapsInScope(scope: RawItem[]): CornerArrowOverlap[] {
  const arrowCellToId = new Map<string, number>();
  for (const item of scope) {
    if (!ARROW_BODY_KINDS.has(item.kind)) continue;
    for (const p of item.occupiedPositions) {
      arrowCellToId.set(vecKey(p), item.instanceId);
    }
  }
  const overlaps: CornerArrowOverlap[] = [];
  for (const item of scope) {
    if (item.kind !== 4) continue;
    for (const p of item.occupiedPositions) {
      const key = vecKey(p);
      const arrowId = arrowCellToId.get(key);
      if (arrowId != null) {
        overlaps.push({ cell: key, cornerId: item.instanceId, arrowId });
      }
    }
  }
  return overlaps;
}

export function findArrowCellOverlaps(items: RawItem[]): ArrowCellOverlap[] {
  const overlaps: ArrowCellOverlap[] = [];
  for (const scope of arrowScopes(items)) {
    overlaps.push(...findArrowCellOverlapsInScope(scope));
  }
  return overlaps;
}

export function arrowPathSelfOverlaps(positions: Vec2[]): boolean {
  const seen = new Set<string>();
  for (const p of positions) {
    const key = vecKey(p);
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

/** 候选格是否与同作用域内已有折线箭（可排除正在编辑的一条或多条）占用同一格 */
export function arrowPositionsOverlapExisting(
  scopeItems: RawItem[],
  positions: Vec2[],
  excludeInstanceId?: number | Set<number>,
): boolean {
  const exclude = new Set<number>();
  if (typeof excludeInstanceId === "number") exclude.add(excludeInstanceId);
  else if (excludeInstanceId) for (const id of excludeInstanceId) exclude.add(id);

  const occupied = new Set<string>();
  for (const item of scopeItems) {
    if (!ARROW_BODY_KINDS.has(item.kind)) continue;
    if (exclude.has(item.instanceId)) continue;
    for (const p of item.occupiedPositions) {
      occupied.add(vecKey(p));
    }
  }
  return positions.some((p) => occupied.has(vecKey(p)));
}

export interface PipeArrowOverlap {
  cell: string;
  pipeId: number;
  arrowId: number;
}

/** kind3 管身格与 kind1/2 箭身格不可重叠（顶层与各子区域分别检测） */
export function findPipeArrowCellOverlaps(items: RawItem[]): PipeArrowOverlap[] {
  const overlaps: PipeArrowOverlap[] = [];
  for (const scope of placementScopes(items)) {
    overlaps.push(...findPipeArrowCellOverlapsInScope(scope));
  }
  return overlaps;
}

export interface CornerArrowOverlap {
  cell: string;
  cornerId: number;
  arrowId: number;
}

/** kind4 反射角格与 kind1/2 箭身格不可重叠（顶层与各子区域分别检测） */
export function findCornerArrowCellOverlaps(items: RawItem[]): CornerArrowOverlap[] {
  const overlaps: CornerArrowOverlap[] = [];
  for (const scope of placementScopes(items)) {
    overlaps.push(...findCornerArrowCellOverlapsInScope(scope));
  }
  return overlaps;
}

/** 与编辑器手绘管道一致：血量 UI 锚在管身中段 */
export function defaultPipeHealthViewPathIndex(pathLength: number): number {
  return Math.floor(pathLength / 2);
}

const ARROW_HOST_KINDS = new Set([1, 2]);

/** 炸弹绑定在宿主箭身的索引（尾→头，与手绘 buildBombItem 一致） */
export function bombAnchorIndex(hostLength: number): number {
  return Math.max(0, Math.floor(hostLength / 2));
}

export function bombAnchorCell(hostPositions: Vec2[]): Vec2 {
  const idx = bombAnchorIndex(hostPositions.length);
  return hostPositions[idx] ?? hostPositions[0]!;
}

export function getItemSiblingList(items: RawItem[], itemId: number): RawItem[] | null {
  return findItemParentList(items, itemId)?.list ?? null;
}

export function findArrowHostingCell(
  items: RawItem[],
  cell: Vec2,
  scopeItemId?: number,
): RawItem | undefined {
  const key = vecKey(cell);
  const pool =
    scopeItemId != null
      ? (getItemSiblingList(items, scopeItemId) ?? [])
      : collectAllItems(items);
  return pool.find(
    (o) =>
      ARROW_HOST_KINDS.has(o.kind) &&
      o.occupiedPositions.some((p) => vecKey(p) === key),
  );
}

/** 冻结 overlay 等同路径宿主箭，仅在 scopeItemId 所在层级查找 */
export function findArrowHostingPositions(
  items: RawItem[],
  positions: Vec2[],
  scopeItemId: number,
): RawItem | undefined {
  const siblings = getItemSiblingList(items, scopeItemId) ?? [];
  return siblings.find(
    (o) =>
      ARROW_HOST_KINDS.has(o.kind) &&
      o.occupiedPositions.length === positions.length &&
      o.occupiedPositions.every(
        (p, i) => p[0] === positions[i]![0] && p[1] === positions[i]![1],
      ),
  );
}

/** 炸弹须在宿主箭身中段（非头尾）；宿主箭至少 3 格 */
export function isBombAnchoredOnMidBody(hostPositions: Vec2[], bombCell: Vec2): boolean {
  if (hostPositions.length < 3) return false;
  const anchor = bombAnchorCell(hostPositions);
  const idx = hostPositions.findIndex((p) => p[0] === bombCell[0] && p[1] === bombCell[1]);
  if (idx <= 0 || idx >= hostPositions.length - 1) return false;
  return anchor[0] === bombCell[0] && anchor[1] === bombCell[1];
}
