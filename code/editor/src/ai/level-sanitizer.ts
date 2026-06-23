import type { Direction, LevelData, RawItem, Vec2 } from "@arrowjaw/shared";
import { assertLoadableLevelData, collectAllItems, inBounds, vecKey } from "@arrowjaw/shared";
import { directionFromLastSegment } from "../tools/draw-state.ts";
import type { GenerationForm } from "./types.ts";
import { getDifficultyTargets } from "./prompts/playability-rules.ts";
import { checkGreedySolvability, type SolvabilityResult } from "./level-solvability.ts";

const ARROW_KINDS = new Set([1, 2]);
const ORTH: Vec2[] = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
];

export interface SanitizeOptions {
  /** 不可占用/不可改格位的折线箭格子 */
  frozenArrowCells?: Set<string>;
  /** 不可删除或移动格位的折线箭 id */
  frozenArrowIds?: Set<number>;
  /** 二次填充模式：提高填充目标并优先补空格 */
  fillMode?: boolean;
  baseOccupiedCells?: number;
  fillEmptyCells?: number;
}

export interface SanitizeResult {
  json: string;
  changed: boolean;
  actions: string[];
  error?: string;
}

function cloneLevel(data: LevelData): LevelData {
  return structuredClone(data);
}

function manhattan(a: Vec2, b: Vec2): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

function parseCellKey(key: string): Vec2 {
  const [x, y] = key.split(",").map(Number);
  return [x, y];
}

function orthNeighbors(cell: Vec2): Vec2[] {
  return ORTH.map(([dx, dy]) => [cell[0] + dx, cell[1] + dy] as Vec2);
}

function countArrows(items: RawItem[]): number {
  return collectAllItems(items).filter((i) => ARROW_KINDS.has(i.kind)).length;
}

function countArrowBodyCells(items: RawItem[]): number {
  const cells = new Set<string>();
  for (const item of collectAllItems(items)) {
    if (!ARROW_KINDS.has(item.kind)) continue;
    for (const p of item.occupiedPositions) {
      cells.add(vecKey(p));
    }
  }
  return cells.size;
}

function findArrowCellOverlaps(items: RawItem[]): { cell: string; ids: number[] }[] {
  const cellToIds = new Map<string, Set<number>>();
  for (const item of collectAllItems(items)) {
    if (!ARROW_KINDS.has(item.kind)) continue;
    for (const p of item.occupiedPositions) {
      const key = vecKey(p);
      if (!cellToIds.has(key)) cellToIds.set(key, new Set());
      cellToIds.get(key)!.add(item.instanceId);
    }
  }
  const overlaps: { cell: string; ids: number[] }[] = [];
  for (const [cell, ids] of cellToIds) {
    if (ids.size > 1) overlaps.push({ cell, ids: [...ids] });
  }
  return overlaps;
}

function buildArrowOccupied(items: RawItem[], excludeId?: number): Set<string> {
  const occupied = new Set<string>();
  for (const item of collectAllItems(items)) {
    if (!ARROW_KINDS.has(item.kind)) continue;
    if (excludeId != null && item.instanceId === excludeId) continue;
    for (const p of item.occupiedPositions) {
      occupied.add(vecKey(p));
    }
  }
  return occupied;
}

function findItemById(items: RawItem[], id: number): RawItem | undefined {
  return collectAllItems(items).find((i) => i.instanceId === id);
}

function nextInstanceId(items: RawItem[]): number {
  const all = collectAllItems(items);
  return all.length === 0 ? 1 : Math.max(...all.map((i) => i.instanceId)) + 1;
}

function isFrozenItem(item: RawItem, opts?: SanitizeOptions): boolean {
  return !!opts?.frozenArrowIds?.has(item.instanceId);
}

function removeDisallowedKinds(
  data: LevelData,
  form: GenerationForm,
  actions: string[],
  opts?: SanitizeOptions,
): void {
  const allowed = new Set(form.allowedKinds);
  const before = collectAllItems(data.itemModels).length;

  function filterItems(items: RawItem[]): RawItem[] {
    return items
      .filter((item) => allowed.has(item.kind) || isFrozenItem(item, opts))
      .map((item) => {
        if (item.kind === 12 && item.items) {
          return { ...item, items: filterItems(item.items) };
        }
        return item;
      });
  }

  data.itemModels = filterItems(data.itemModels);
  const after = collectAllItems(data.itemModels).length;
  if (after < before) {
    actions.push(`AI-KIND removed ${before - after} item(s)`);
  }
}

function fixDirections(data: LevelData, actions: string[]): void {
  for (const item of collectAllItems(data.itemModels)) {
    if (item.kind !== 1 && item.kind !== 2) continue;
    if (item.occupiedPositions.length < 2) continue;
    const dir = directionFromLastSegment(item.occupiedPositions);
    if (item.direction !== dir) {
      item.direction = dir;
      actions.push(`V11 #${item.instanceId} direction→${dir}`);
    }
  }
}

function syncItemDirection(item: RawItem): void {
  if (item.occupiedPositions.length >= 2) {
    item.direction = directionFromLastSegment(item.occupiedPositions);
  }
}

function tryFixOneOverlap(data: LevelData, actions: string[], opts?: SanitizeOptions): boolean {
  const overlaps = findArrowCellOverlaps(data.itemModels);
  if (overlaps.length === 0) return false;

  const { cell, ids } = overlaps[0]!;
  if (opts?.frozenArrowCells?.has(cell)) {
    const fixIds = ids.filter((id) => !opts.frozenArrowIds?.has(id));
    if (fixIds.length === 0) return false;
  }

  const conflict = parseCellKey(cell);
  const fixIds = [...ids].filter((id) => !opts?.frozenArrowIds?.has(id)).sort((a, b) => b - a);
  if (fixIds.length === 0) return false;

  for (const fixId of fixIds) {
    const item = findItemById(data.itemModels, fixId);
    if (!item || !ARROW_KINDS.has(item.kind)) continue;
    const positions = item.occupiedPositions;
    const idx = positions.findIndex((p) => p[0] === conflict[0] && p[1] === conflict[1]);
    if (idx < 0) continue;

    const occupied = buildArrowOccupied(data.itemModels, fixId);
    const w = data.width;
    const h = data.height;

    if (idx > 0 && idx < positions.length - 1) {
      const a = positions[idx - 1]!;
      const b = positions[idx + 1]!;
      if (manhattan(a, b) === 1) {
        positions.splice(idx, 1);
        syncItemDirection(item);
        actions.push(`AI-OVERLAP ${cell} #${fixId} removed middle cell`);
        return true;
      }
    }

    if (idx === 0 && positions.length >= 2) {
      const next = positions[1]!;
      for (const n of orthNeighbors(next)) {
        if (n[0] === next[0] && n[1] === next[1]) continue;
        if (positions.some((p, i) => i !== 0 && p[0] === n[0] && p[1] === n[1])) continue;
        if (!inBounds(n, w, h) || occupied.has(vecKey(n))) continue;
        positions[0] = n;
        syncItemDirection(item);
        actions.push(`AI-OVERLAP ${cell} #${fixId} moved head→${vecKey(n)}`);
        return true;
      }
    }

    if (idx === positions.length - 1 && positions.length >= 2) {
      const prev = positions[idx - 1]!;
      for (const n of orthNeighbors(prev)) {
        if (n[0] === prev[0] && n[1] === prev[1]) continue;
        if (n[0] === conflict[0] && n[1] === conflict[1]) continue;
        if (positions.some((p, i) => i !== idx && p[0] === n[0] && p[1] === n[1])) continue;
        if (!inBounds(n, w, h) || occupied.has(vecKey(n))) continue;
        positions[idx] = n;
        syncItemDirection(item);
        actions.push(`AI-OVERLAP ${cell} #${fixId} moved tail→${vecKey(n)}`);
        return true;
      }
    }
  }

  return false;
}

function tryFixUnsolvable(data: LevelData, actions: string[], opts?: SanitizeOptions): boolean {
  const check = checkGreedySolvability(data);
  if (check.solvable || check.stuckIds.length === 0) return false;

  const w = data.width;
  const h = data.height;
  const stuckSet = new Set(check.stuckIds);

  for (const id of check.stuckIds) {
    if (opts?.frozenArrowIds?.has(id)) continue;
    const item = findItemById(data.itemModels, id);
    if (!item || !ARROW_KINDS.has(item.kind)) continue;
    const positions = item.occupiedPositions;
    if (positions.length < 2) continue;

    const idx = positions.length - 1;
    const head = positions[idx]!;
    const prev = positions[idx - 1]!;
    const occupied = buildArrowOccupied(data.itemModels, id);

    const candidates = orthNeighbors(prev)
      .filter((n) => n[0] !== prev[0] || n[1] !== prev[1])
      .sort((a, b) => interiorScore(b, w, h) - interiorScore(a, w, h));

    for (const n of candidates) {
      if (n[0] === head[0] && n[1] === head[1]) continue;
      if (!inBounds(n, w, h) || occupied.has(vecKey(n))) continue;
      if (positions.some((p, i) => i !== idx && p[0] === n[0] && p[1] === n[1])) continue;

      positions[idx] = n;
      syncItemDirection(item);
      const recheck = checkGreedySolvability(data);
      if (recheck.solvable || recheck.stuckIds.length < check.stuckIds.length) {
        actions.push(`AI-UNSOLVABLE #${id} moved head→${vecKey(n)}`);
        return true;
      }
      positions[idx] = head;
      syncItemDirection(item);
    }

    if (positions.length >= 3) {
      const mid = Math.floor(positions.length / 2);
      const midCell = positions[mid]!;
      if (positions.filter((p) => p[0] === midCell[0] && p[1] === midCell[1]).length === 1) {
        const a = positions[mid - 1]!;
        const b = positions[mid + 1]!;
        if (manhattan(a, b) === 1) {
          positions.splice(mid, 1);
          syncItemDirection(item);
          const recheck = checkGreedySolvability(data);
          if (recheck.solvable || recheck.stuckIds.length < check.stuckIds.length) {
            actions.push(`AI-UNSOLVABLE #${id} removed bend at ${vecKey(midCell)}`);
            return true;
          }
          positions.splice(mid, 0, midCell);
          syncItemDirection(item);
        }
      }
    }
  }

  for (const id of check.stuckIds) {
    if (opts?.frozenArrowIds?.has(id)) continue;
    if (!stuckSet.has(id)) continue;
    const item = findItemById(data.itemModels, id);
    if (!item || item.kind !== 1) continue;
    if (item.occupiedPositions.length <= 2) continue;
    const tail = item.occupiedPositions[0]!;
    const occupied = buildArrowOccupied(data.itemModels, id);
    for (const n of orthNeighbors(tail)) {
      if (!inBounds(n, w, h) || occupied.has(vecKey(n))) continue;
      if (item.occupiedPositions.some((p) => p[0] === n[0] && p[1] === n[1])) continue;
      if (manhattan(n, item.occupiedPositions[1]!) !== 1) continue;
      item.occupiedPositions.unshift(n);
      syncItemDirection(item);
      const recheck = checkGreedySolvability(data);
      if (recheck.solvable || recheck.stuckIds.length < check.stuckIds.length) {
        actions.push(`AI-UNSOLVABLE #${id} moved tail→${vecKey(n)}`);
        return true;
      }
      item.occupiedPositions.shift();
      syncItemDirection(item);
    }
  }

  return false;
}

function interiorScore(cell: Vec2, width: number, height: number): number {
  const [x, y] = cell;
  return Math.min(x, y, width - 1 - x, height - 1 - y);
}

function occupancyFillGoal(form: GenerationForm, opts?: SanitizeOptions): number {
  const global = getDifficultyTargets(form).occupancyCellTarget;
  if (
    opts?.fillMode &&
    opts.baseOccupiedCells != null &&
    opts.fillEmptyCells != null &&
    opts.fillEmptyCells > 0
  ) {
    const fillTarget = opts.baseOccupiedCells + Math.ceil(opts.fillEmptyCells * 0.2);
    return Math.max(global, fillTarget);
  }
  return global;
}

function densityArrowCap(form: GenerationForm): number {
  const t = getDifficultyTargets(form);
  return Math.max(t.arrowCountMax, Math.ceil(t.occupancyCellTarget / 3));
}

function listEmptyStarts(
  occupied: Set<string>,
  width: number,
  height: number,
): { cell: Vec2; score: number }[] {
  const starts: { cell: Vec2; score: number }[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell: Vec2 = [x, y];
      if (!occupied.has(vecKey(cell))) {
        starts.push({ cell, score: interiorScore(cell, width, height) });
      }
    }
  }
  starts.sort((a, b) => b.score - a.score);
  return starts;
}

function tryBuildLine(
  start: Vec2,
  delta: Vec2,
  length: number,
  occupied: Set<string>,
  width: number,
  height: number,
): Vec2[] | null {
  const cells: Vec2[] = [start];
  let cur = start;
  for (let i = 1; i < length; i++) {
    cur = [cur[0] + delta[0], cur[1] + delta[1]];
    if (!inBounds(cur, width, height) || occupied.has(vecKey(cur))) return null;
    cells.push(cur);
  }
  return cells;
}

function solvabilityImproved(before: SolvabilityResult, after: SolvabilityResult): boolean {
  if (after.solvable) return true;
  if (before.solvable && !after.solvable) return false;
  return after.stuckIds.length < before.stuckIds.length;
}

function tryExtendArrowForDensity(
  data: LevelData,
  form: GenerationForm,
  actions: string[],
  opts?: SanitizeOptions,
): boolean {
  const fillGoal = occupancyFillGoal(form, opts);
  if (countArrowBodyCells(data.itemModels) >= fillGoal) return false;

  const beforeSol = checkGreedySolvability(data);
  const occupied = buildArrowOccupied(data.itemModels);
  for (const key of opts?.frozenArrowCells ?? []) {
    occupied.add(key);
  }
  const w = data.width;
  const h = data.height;

  const items = collectAllItems(data.itemModels)
    .filter((i) => i.kind === 1 || i.kind === 2)
    .sort((a, b) => {
      const sa = interiorScore(a.occupiedPositions[0] ?? [0, 0], w, h);
      const sb = interiorScore(b.occupiedPositions[0] ?? [0, 0], w, h);
      return sb - sa;
    });

  for (const item of items) {
    if (isFrozenItem(item, opts)) continue;
    const positions = item.occupiedPositions;
    if (positions.length >= 8) continue;

    const head = positions.at(-1)!;
    const headCandidates = orthNeighbors(head).sort(
      (a, b) => interiorScore(b, w, h) - interiorScore(a, w, h),
    );
    for (const n of headCandidates) {
      if (!inBounds(n, w, h) || occupied.has(vecKey(n))) continue;
      if (positions.some((p) => p[0] === n[0] && p[1] === n[1])) continue;
      positions.push(n);
      syncItemDirection(item);
      const afterSol = checkGreedySolvability(data);
      if (solvabilityImproved(beforeSol, afterSol)) {
        actions.push(`AI-DENSITY extended #${item.instanceId} tail→${vecKey(n)}`);
        return true;
      }
      positions.pop();
      syncItemDirection(item);
    }

    const tail = positions[0]!;
    const tailCandidates = orthNeighbors(tail).sort(
      (a, b) => interiorScore(b, w, h) - interiorScore(a, w, h),
    );
    for (const n of tailCandidates) {
      if (!inBounds(n, w, h) || occupied.has(vecKey(n))) continue;
      if (positions.some((p) => p[0] === n[0] && p[1] === n[1])) continue;
      positions.unshift(n);
      syncItemDirection(item);
      const afterSol = checkGreedySolvability(data);
      if (solvabilityImproved(beforeSol, afterSol)) {
        actions.push(`AI-DENSITY extended #${item.instanceId} head→${vecKey(n)}`);
        return true;
      }
      positions.shift();
      syncItemDirection(item);
    }
  }
  return false;
}

function addShortArrow(
  data: LevelData,
  form: GenerationForm,
  actions: string[],
  opts?: SanitizeOptions,
): boolean {
  const fillGoal = occupancyFillGoal(form, opts);
  if (countArrowBodyCells(data.itemModels) >= fillGoal) return false;
  if (countArrows(data.itemModels) >= densityArrowCap(form)) return false;
  if (!form.allowedKinds.includes(1)) return false;

  const beforeSol = checkGreedySolvability(data);
  const occupied = buildArrowOccupied(data.itemModels);
  for (const key of opts?.frozenArrowCells ?? []) {
    occupied.add(key);
  }
  const w = data.width;
  const h = data.height;

  for (const { cell: start } of listEmptyStarts(occupied, w, h)) {
    for (const delta of ORTH) {
      for (const len of [5, 4, 3, 2]) {
        const line = tryBuildLine(start, delta, len, occupied, w, h);
        if (!line) continue;
        const direction = directionFromLastSegment(line) as Direction;
        const id = nextInstanceId(data.itemModels);
        const newItem: RawItem = {
          kind: 1,
          instanceId: id,
          layer: 2,
          direction,
          colorId: 6,
          occupiedPositions: line,
        };
        data.itemModels.push(newItem);
        const afterSol = checkGreedySolvability(data);
        if (solvabilityImproved(beforeSol, afterSol)) {
          actions.push(`AI-DENSITY added #${id} ${len} cells at ${vecKey(start)}`);
          return true;
        }
        data.itemModels.pop();
      }
    }
  }
  return false;
}

function runSanitizePass(
  data: LevelData,
  form: GenerationForm,
  actions: string[],
  opts?: SanitizeOptions,
): boolean {
  let changed = false;
  const beforeLen = actions.length;

  removeDisallowedKinds(data, form, actions, opts);
  fixDirections(data, actions);

  if (tryFixUnsolvable(data, actions, opts)) changed = true;
  if (tryFixOneOverlap(data, actions, opts)) changed = true;
  if (tryExtendArrowForDensity(data, form, actions, opts)) changed = true;
  if (addShortArrow(data, form, actions, opts)) changed = true;

  if (actions.length > beforeLen) changed = true;
  return changed;
}

export function sanitizeLevelData(
  data: LevelData,
  form: GenerationForm,
  opts?: SanitizeOptions,
): SanitizeResult {
  const actions: string[] = [];
  const working = cloneLevel(data);

  for (let i = 0; i < 120; i++) {
    const changed = runSanitizePass(working, form, actions, opts);
    if (!changed) break;
  }

  for (let i = 0; i < 60; i++) {
    if (!tryFixUnsolvable(working, actions, opts)) break;
  }

  return {
    json: JSON.stringify(working),
    changed: actions.length > 0,
    actions,
  };
}

export function sanitizeLevelJson(
  json: string,
  form: GenerationForm,
  opts?: SanitizeOptions,
): SanitizeResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return {
      json,
      changed: false,
      actions: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }

  try {
    const data = assertLoadableLevelData(raw);
    return sanitizeLevelData(data, form, opts);
  } catch (e) {
    return {
      json,
      changed: false,
      actions: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function summarizeSanitizeActions(actions: string[], limit = 5): string {
  if (actions.length === 0) return "none";
  const head = actions.slice(0, limit).join("; ");
  if (actions.length <= limit) return head;
  return `${head}; +${actions.length - limit} more`;
}
