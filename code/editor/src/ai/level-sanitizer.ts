import type { Direction, LevelData, RawItem, Vec2 } from "@arrowjaw/shared";
import {
  assertLoadableLevelData,
  bombAnchorCell,
  collectAllItems,
  defaultPipeHealthViewPathIndex,
  findArrowCellOverlaps,
  findArrowHostingCell,
  findCornerArrowCellOverlaps,
  findPipeArrowCellOverlaps,
  inBounds,
  isPolylineContinuous,
  vecKey,
} from "@arrowjaw/shared";
import { directionFromLastSegment, flipArrowDirection2 } from "../tools/draw-state.ts";
import type { GenerationForm } from "./types.ts";
import { tryFixOneUselessCorner } from "./level-corner-utility.ts";
import { checkGreedySolvability, type SolvabilityResult } from "./level-solvability.ts";
import { getDifficultyTargets } from "./prompts/playability-rules.ts";

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

type PipePassEntry = { position: Vec2; directions: Vec2[] };

function isVec2(v: unknown): v is Vec2 {
  return Array.isArray(v) && v.length >= 2 && typeof v[0] === "number" && typeof v[1] === "number";
}

function inferPassDirections(positions: Vec2[], which: 0 | 1): Vec2[] {
  if (positions.length < 2) return [[0, 1], [0, -1]];
  const cell = positions[which === 0 ? 0 : positions.length - 1]!;
  const adj = positions[which === 0 ? 1 : positions.length - 2]!;
  const dx = Math.sign(adj[0] - cell[0]);
  const dy = Math.sign(adj[1] - cell[1]);
  if (dx === 0 && dy === 0) return [[0, 1], [0, -1]];
  return [
    [dx, dy],
    [-dx, -dy],
  ];
}

function normalizeDirections(dirs: unknown): Vec2[] | null {
  if (!Array.isArray(dirs) || dirs.length < 2) return null;
  const out: Vec2[] = [];
  for (const d of dirs) {
    if (!isVec2(d)) return null;
    out.push([d[0], d[1]]);
  }
  return out.length >= 2 ? out : null;
}

function normalizePassEntry(
  raw: unknown,
  positions: Vec2[],
  which: 0 | 1,
): PipePassEntry {
  const endpoint = positions[which === 0 ? 0 : positions.length - 1]!;
  const directions = inferPassDirections(positions, which);

  if (raw && typeof raw === "object" && !isVec2(raw)) {
    const parsed = normalizeDirections((raw as Record<string, unknown>).directions);
    if (parsed) {
      return {
        position: [endpoint[0], endpoint[1]],
        directions: parsed,
      };
    }
  }

  return {
    position: [endpoint[0], endpoint[1]],
    directions,
  };
}

function endpointPasses(positions: Vec2[]): [PipePassEntry, PipePassEntry] {
  return [
    {
      position: [positions[0]![0], positions[0]![1]],
      directions: inferPassDirections(positions, 0),
    },
    {
      position: [positions[positions.length - 1]![0], positions[positions.length - 1]![1]],
      directions: inferPassDirections(positions, 1),
    },
  ];
}

function passesEqual(a: PipePassEntry[], b: PipePassEntry[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function fixPipeItem(item: RawItem, actions: string[]): boolean {
  if (item.kind !== 3) return false;

  let changed = false;
  const id = item.instanceId;
  if (!Array.isArray(item.occupiedPositions)) return false;

  const positions: Vec2[] = [];
  for (const p of item.occupiedPositions) {
    if (!isVec2(p)) return false;
    positions.push([p[0], p[1]]);
  }
  if (positions.length < 2) return false;

  if (positions.length !== item.occupiedPositions.length) {
    item.occupiedPositions = positions;
    changed = true;
  }

  if (item.health == null || typeof item.health !== "number" || item.health < 1) {
    item.health = positions.length;
    changed = true;
    actions.push(`pipe #${id} health=${item.health}`);
  }

  const midAnchor = defaultPipeHealthViewPathIndex(positions.length);
  const hvpi = item.healthViewPathIndex as number | undefined;
  if (
    hvpi == null ||
    hvpi < 0 ||
    hvpi >= positions.length ||
    (hvpi === 0 && positions.length >= 3)
  ) {
    if (item.healthViewPathIndex !== midAnchor) {
      item.healthViewPathIndex = midAnchor;
      changed = true;
      actions.push(`pipe #${id} healthViewPathIndex→${midAnchor}`);
    }
  }

  if (item.layer !== 2) {
    item.layer = 2;
    changed = true;
  }

  let targetPasses = endpointPasses(positions);
  const rawPasses = item.passes as unknown;
  if (Array.isArray(rawPasses) && rawPasses.length >= 2) {
    const p0 = normalizePassEntry(rawPasses[0], positions, 0);
    const p1 = normalizePassEntry(rawPasses[1], positions, 1);
    const hadBareCoords = isVec2(rawPasses[0]) || isVec2(rawPasses[1]);
    const hadWrongPos =
      !hadBareCoords &&
      [rawPasses[0], rawPasses[1]].some((raw, i) => {
        if (!raw || typeof raw !== "object" || isVec2(raw)) return false;
        const pos = (raw as Record<string, unknown>).position;
        if (!isVec2(pos)) return false;
        const ep = positions[i === 0 ? 0 : positions.length - 1]!;
        return pos[0] !== ep[0] || pos[1] !== ep[1];
      });
    targetPasses = [p0, p1];
    if (hadBareCoords) {
      actions.push(`pipe #${id} converted bare-coordinate passes`);
      changed = true;
    } else if (hadWrongPos) {
      actions.push(`pipe #${id} snapped pass positions to path endpoints`);
      changed = true;
    }
  } else {
    actions.push(`pipe #${id} created passes from path endpoints`);
    changed = true;
  }

  const current = item.passes as PipePassEntry[] | undefined;
  if (!current || !passesEqual(current, targetPasses)) {
    item.passes = targetPasses;
    changed = true;
    if (!actions.some((a) => a.includes(`pipe #${id}`))) {
      actions.push(`pipe #${id} normalized passes`);
    }
  }

  return changed;
}

function fixPipes(data: LevelData, actions: string[]): boolean {
  let changed = false;
  for (const item of collectAllItems(data.itemModels)) {
    if (fixPipeItem(item, actions)) changed = true;
  }
  return changed;
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

function hasArrowOverlaps(items: RawItem[]): boolean {
  return findArrowCellOverlaps(items).length > 0;
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

/** 箭/管道格均不可再放置折线箭身 */
function buildPlacementOccupied(items: RawItem[], excludeId?: number): Set<string> {
  const occupied = buildArrowOccupied(items, excludeId);
  for (const item of collectAllItems(items)) {
    if (item.kind !== 3) continue;
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

function removeItemById(items: RawItem[], id: number): RawItem[] {
  return items
    .filter((item) => item.instanceId !== id)
    .map((item) => {
      if (item.kind === 12 && item.items) {
        return { ...item, items: removeItemById(item.items, id) };
      }
      return item;
    });
}

function buildOccupiedCells(items: RawItem[], excludeId?: number): Set<string> {
  const occupied = new Set<string>();
  for (const item of collectAllItems(items)) {
    if (excludeId != null && item.instanceId === excludeId) continue;
    for (const p of item.occupiedPositions) {
      occupied.add(vecKey(p));
    }
  }
  return occupied;
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
    if (item.occupiedPositions.length < 2) continue;

    if (item.kind === 1) {
      const dir = directionFromLastSegment(item.occupiedPositions);
      if (item.direction !== dir) {
        item.direction = dir;
        actions.push(`V11 #${item.instanceId} direction→${dir}`);
      }
      continue;
    }

    if (item.kind === 2) {
      const d1 = directionFromLastSegment(item.occupiedPositions);
      const d2 = flipArrowDirection2(item.occupiedPositions);
      let changed = false;
      if (item.direction1 !== d1) {
        item.direction1 = d1;
        changed = true;
      }
      if (item.direction2 !== d2) {
        item.direction2 = d2;
        changed = true;
      }
      if (item.direction !== d1) {
        item.direction = d1;
        changed = true;
      }
      if (changed) {
        actions.push(`V11 #${item.instanceId} flip d1→${d1} d2→${d2}`);
      }
    }
  }
}

function syncItemDirection(item: RawItem): void {
  if (item.occupiedPositions.length < 2) return;
  if (item.kind === 1) {
    item.direction = directionFromLastSegment(item.occupiedPositions);
  } else if (item.kind === 2) {
    item.direction1 = directionFromLastSegment(item.occupiedPositions);
    item.direction2 = flipArrowDirection2(item.occupiedPositions);
    item.direction = item.direction1;
  }
}

function tryShiftArrowPolyline(
  item: RawItem,
  data: LevelData,
  w: number,
  h: number,
): boolean {
  const positions = item.occupiedPositions;
  if (positions.length < 2) return false;
  const occupied = buildPlacementOccupied(data.itemModels, item.instanceId);

  for (const [dx, dy] of ORTH) {
    const shifted = positions.map((p) => [p[0] + dx, p[1] + dy] as Vec2);
    if (!shifted.every((p) => inBounds(p, w, h))) continue;
    if (shifted.some((p) => occupied.has(vecKey(p)))) continue;
    item.occupiedPositions = shifted;
    syncItemDirection(item);
    return true;
  }
  return false;
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

    const occupied = buildPlacementOccupied(data.itemModels, fixId);
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

    if (tryShiftArrowPolyline(item, data, w, h)) {
      actions.push(`AI-OVERLAP ${cell} #${fixId} shifted polyline`);
      return true;
    }

    const otherArrowCells = buildArrowCellSetExcluding(data.itemModels, fixId);

    if (idx >= 1) {
      const prefix = positions.slice(0, idx).map((p) => [p[0], p[1]] as Vec2);
      if (
        prefix.length >= 2 &&
        isPolylineContinuous(prefix) &&
        !prefix.some((p) => otherArrowCells.has(vecKey(p)))
      ) {
        item.occupiedPositions = prefix;
        syncItemDirection(item);
        actions.push(`AI-OVERLAP ${cell} #${fixId} truncated before conflict`);
        return true;
      }
    }

    if (idx < positions.length - 1) {
      const suffix = positions.slice(idx + 1).map((p) => [p[0], p[1]] as Vec2);
      if (
        suffix.length >= 2 &&
        isPolylineContinuous(suffix) &&
        !suffix.some((p) => otherArrowCells.has(vecKey(p)))
      ) {
        item.occupiedPositions = suffix;
        syncItemDirection(item);
        actions.push(`AI-OVERLAP ${cell} #${fixId} truncated after conflict`);
        return true;
      }
    }

    for (const [dx, dy] of ORTH) {
      for (let steps = 2; steps <= 4; steps++) {
        const shifted = positions.map(
          (p) => [p[0] + dx * steps, p[1] + dy * steps] as Vec2,
        );
        if (!shifted.every((p) => inBounds(p, w, h))) continue;
        const occupiedShift = buildPlacementOccupied(data.itemModels, fixId);
        if (shifted.some((p) => occupiedShift.has(vecKey(p)))) continue;
        item.occupiedPositions = shifted;
        syncItemDirection(item);
        actions.push(`AI-OVERLAP ${cell} #${fixId} shifted×${steps}`);
        return true;
      }
    }
  }

  return false;
}

function fixBombAnchors(data: LevelData, actions: string[]): void {
  for (const bomb of collectAllItems(data.itemModels)) {
    if (bomb.kind !== 5) continue;
    const cell = bomb.occupiedPositions[0];
    if (!cell) continue;
    const host = findArrowHostingCell(data.itemModels, cell, bomb.instanceId);
    if (!host || host.occupiedPositions.length < 2) continue;
    const anchor = bombAnchorCell(host.occupiedPositions);
    if (cell[0] === anchor[0] && cell[1] === anchor[1]) continue;
    bomb.occupiedPositions = [[anchor[0], anchor[1]]];
    actions.push(`AI-BOMB-ANCHOR #${bomb.instanceId}→${vecKey(anchor)}`);
  }
}

function fixDiscontinuousArrows(data: LevelData, actions: string[]): void {
  for (const item of collectAllItems(data.itemModels)) {
    if (!ARROW_KINDS.has(item.kind)) continue;
    const pos = item.occupiedPositions;
    if (pos.length < 2 || isPolylineContinuous(pos)) continue;

    let cut = pos.length;
    for (let i = 1; i < pos.length; i++) {
      if (manhattan(pos[i - 1]!, pos[i]!) !== 1) {
        cut = i;
        break;
      }
    }
    if (cut >= 2 && cut < pos.length) {
      item.occupiedPositions = pos.slice(0, cut).map((p) => [p[0], p[1]] as Vec2);
      syncItemDirection(item);
      actions.push(`V04 #${item.instanceId} truncated to ${cut} cells`);
      continue;
    }

    if (pos.length >= 3) {
      let start = 0;
      for (let i = 1; i < pos.length; i++) {
        if (manhattan(pos[i - 1]!, pos[i]!) !== 1) {
          start = i;
          break;
        }
      }
      const suffix = pos.slice(start).map((p) => [p[0], p[1]] as Vec2);
      if (suffix.length >= 2 && isPolylineContinuous(suffix)) {
        item.occupiedPositions = suffix;
        syncItemDirection(item);
        actions.push(`V04 #${item.instanceId} kept suffix ${suffix.length} cells`);
      }
    }
  }
}

function buildArrowCellSet(items: RawItem[]): Set<string> {
  const cells = new Set<string>();
  for (const item of collectAllItems(items)) {
    if (!ARROW_KINDS.has(item.kind)) continue;
    for (const p of item.occupiedPositions) {
      cells.add(vecKey(p));
    }
  }
  return cells;
}

function buildArrowCellSetExcluding(items: RawItem[], excludeId: number): Set<string> {
  const cells = new Set<string>();
  for (const item of collectAllItems(items)) {
    if (!ARROW_KINDS.has(item.kind)) continue;
    if (item.instanceId === excludeId) continue;
    for (const p of item.occupiedPositions) {
      cells.add(vecKey(p));
    }
  }
  return cells;
}

function tryFixOnePipeArrowOverlap(data: LevelData, actions: string[]): boolean {
  const overlaps = findPipeArrowCellOverlaps(data.itemModels);
  if (overlaps.length === 0) return false;

  const { cell, pipeId } = overlaps[0]!;
  const pipe = findItemById(data.itemModels, pipeId);
  if (!pipe || pipe.kind !== 3) return false;

  const beforeCount = overlaps.filter((o) => o.pipeId === pipeId).length;
  const conflict = parseCellKey(cell);
  const original = pipe.occupiedPositions.map((p) => [p[0], p[1]] as Vec2);
  const positions = pipe.occupiedPositions;
  const idx = positions.findIndex((p) => p[0] === conflict[0] && p[1] === conflict[1]);
  if (idx < 0) return false;

  const arrowCells = buildArrowCellSet(data.itemModels);
  const w = data.width;
  const h = data.height;

  const commit = (label: string): boolean => {
    if (positions.length < 2) {
      pipe.occupiedPositions = original.map((p) => [p[0], p[1]]);
      return false;
    }
    fixPipeItem(pipe, actions);
    const after = findPipeArrowCellOverlaps(data.itemModels).filter((o) => o.pipeId === pipeId).length;
    if (after < beforeCount) {
      actions.push(label);
      return true;
    }
    pipe.occupiedPositions = original.map((p) => [p[0], p[1]]);
    fixPipeItem(pipe, actions);
    return false;
  };

  if (idx > 0 && idx < positions.length - 1) {
    const a = positions[idx - 1]!;
    const b = positions[idx + 1]!;
    if (manhattan(a, b) === 1) {
      positions.splice(idx, 1);
      if (commit(`AI-PIPE-OVERLAP ${cell} pipe #${pipeId} removed middle cell`)) return true;
    }
  }

  if (idx === 0 && positions.length > 2) {
    positions.shift();
    if (commit(`AI-PIPE-OVERLAP ${cell} pipe #${pipeId} trimmed start`)) return true;
  }

  if (idx === positions.length - 1 && positions.length > 2) {
    positions.pop();
    if (commit(`AI-PIPE-OVERLAP ${cell} pipe #${pipeId} trimmed end`)) return true;
  }

  for (const [ndx, ndy] of ORTH) {
    const shifted = original.map((p) => [p[0] + ndx, p[1] + ndy] as Vec2);
    if (!shifted.every((p) => inBounds(p, w, h))) continue;
    if (shifted.some((p) => arrowCells.has(vecKey(p)))) continue;
    pipe.occupiedPositions = shifted;
    if (commit(`AI-PIPE-OVERLAP ${cell} pipe #${pipeId} shifted [${ndx},${ndy}]`)) return true;
  }

  return false;
}

function tryFixArrowOffCell(
  data: LevelData,
  arrowId: number,
  cell: Vec2,
  actions: string[],
  opts?: SanitizeOptions,
): boolean {
  if (opts?.frozenArrowIds?.has(arrowId)) return false;
  const item = findItemById(data.itemModels, arrowId);
  if (!item || !ARROW_KINDS.has(item.kind)) return false;

  const positions = item.occupiedPositions;
  const idx = positions.findIndex((p) => p[0] === cell[0] && p[1] === cell[1]);
  if (idx < 0) return false;

  const occupied = buildPlacementOccupied(data.itemModels, arrowId);
  const w = data.width;
  const h = data.height;
  const cellKey = vecKey(cell);

  if (idx > 0 && idx < positions.length - 1) {
    const a = positions[idx - 1]!;
    const b = positions[idx + 1]!;
    if (manhattan(a, b) === 1) {
      positions.splice(idx, 1);
      syncItemDirection(item);
      actions.push(`AI-CORNER-OVERLAP ${cellKey} #${arrowId} removed middle cell`);
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
      actions.push(`AI-CORNER-OVERLAP ${cellKey} #${arrowId} moved head→${vecKey(n)}`);
      return true;
    }
  }

  if (idx === positions.length - 1 && positions.length >= 2) {
    const prev = positions[idx - 1]!;
    for (const n of orthNeighbors(prev)) {
      if (n[0] === prev[0] && n[1] === prev[1]) continue;
      if (positions.some((p, i) => i !== idx && p[0] === n[0] && p[1] === n[1])) continue;
      if (!inBounds(n, w, h) || occupied.has(vecKey(n))) continue;
      positions[idx] = n;
      syncItemDirection(item);
      actions.push(`AI-CORNER-OVERLAP ${cellKey} #${arrowId} moved tail→${vecKey(n)}`);
      return true;
    }
  }

  return false;
}

function tryFixOneCornerArrowOverlap(
  data: LevelData,
  actions: string[],
  opts?: SanitizeOptions,
): boolean {
  const overlaps = findCornerArrowCellOverlaps(data.itemModels);
  if (overlaps.length === 0) return false;

  const { cell, cornerId, arrowId } = overlaps[0]!;
  const corner = findItemById(data.itemModels, cornerId);
  if (!corner || corner.kind !== 4) return false;

  const conflict = parseCellKey(cell);
  const original = corner.occupiedPositions[0]!;
  const w = data.width;
  const h = data.height;
  const blocked = buildOccupiedCells(data.itemModels, cornerId);

  for (const n of orthNeighbors(conflict).sort(
    (a, b) => interiorScore(b, w, h) - interiorScore(a, w, h),
  )) {
    if (!inBounds(n, w, h) || blocked.has(vecKey(n))) continue;
    corner.occupiedPositions = [[n[0], n[1]]];
    const still = findCornerArrowCellOverlaps(data.itemModels).some(
      (o) => o.cornerId === cornerId && o.cell === cell,
    );
    if (!still) {
      actions.push(`AI-CORNER-OVERLAP ${cell} corner #${cornerId} moved→${vecKey(n)}`);
      return true;
    }
  }
  corner.occupiedPositions = [[original[0], original[1]]];

  if (tryFixArrowOffCell(data, arrowId, conflict, actions, opts)) {
    return true;
  }

  data.itemModels = removeItemById(data.itemModels, cornerId);
  actions.push(`AI-CORNER-OVERLAP ${cell} removed corner #${cornerId}`);
  return true;
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
    const occupied = buildPlacementOccupied(data.itemModels, id);

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
    const occupied = buildPlacementOccupied(data.itemModels, id);
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
  const t = getDifficultyTargets(form);
  const global = t.occupancyCellTarget;
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
  if (hasArrowOverlaps(data.itemModels)) return false;

  const fillGoal = occupancyFillGoal(form, opts);
  if (countArrowBodyCells(data.itemModels) >= fillGoal) return false;

  const beforeSol = checkGreedySolvability(data);
  const occupied = buildPlacementOccupied(data.itemModels);
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
  if (hasArrowOverlaps(data.itemModels)) return false;

  const fillGoal = occupancyFillGoal(form, opts);
  if (countArrowBodyCells(data.itemModels) >= fillGoal) return false;
  if (countArrows(data.itemModels) >= densityArrowCap(form)) return false;
  if (!form.allowedKinds.includes(1)) return false;

  const beforeSol = checkGreedySolvability(data);
  const occupied = buildPlacementOccupied(data.itemModels);
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
  if (fixPipes(data, actions)) changed = true;

  if (tryFixOnePipeArrowOverlap(data, actions)) changed = true;
  if (tryFixOneCornerArrowOverlap(data, actions, opts)) changed = true;
  if (tryFixOneUselessCorner(data, actions)) changed = true;
  if (tryFixUnsolvable(data, actions, opts)) changed = true;
  if (tryFixOneOverlap(data, actions, opts)) changed = true;
  if (!hasArrowOverlaps(data.itemModels)) {
    if (tryExtendArrowForDensity(data, form, actions, opts)) changed = true;
    if (addShortArrow(data, form, actions, opts)) changed = true;
  }

  fixDiscontinuousArrows(data, actions);
  fixBombAnchors(data, actions);
  fixDirections(data, actions);

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

  for (let i = 0; i < 80; i++) {
    if (!tryFixOneOverlap(working, actions, opts)) break;
  }

  fixDiscontinuousArrows(working, actions);
  fixBombAnchors(working, actions);
  fixDirections(working, actions);

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
