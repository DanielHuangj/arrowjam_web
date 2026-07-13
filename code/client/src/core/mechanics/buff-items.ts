import type { ArrowItem, BuffItem, Vec2 } from "../types.ts";
import { vecKey } from "../types.ts";
import { splitArrowByDestroyedCells } from "./arrow-split.ts";

export function cellsInSquare(center: Vec2, radius: number): Vec2[] {
  const [cx, cy] = center;
  const out: Vec2[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      out.push([cx + dx, cy + dy]);
    }
  }
  return out;
}

export function cellsInCross(center: Vec2, arm: number): Vec2[] {
  const [cx, cy] = center;
  const out: Vec2[] = [[cx, cy]];
  for (let i = 1; i <= arm; i++) {
    out.push([cx, cy - i], [cx, cy + i], [cx + i, cy], [cx - i, cy]);
  }
  return out;
}

export function collectArrowCellsInRegion(
  arrows: ArrowItem[],
  region: Vec2[],
): Map<number, Set<string>> {
  const regionSet = new Set(region.map(vecKey));
  const hit = new Map<number, Set<string>>();
  for (const arrow of arrows) {
    for (const p of arrow.occupiedPositions) {
      if (regionSet.has(vecKey(p))) {
        let set = hit.get(arrow.instanceId);
        if (!set) {
          set = new Set();
          hit.set(arrow.instanceId, set);
        }
        set.add(vecKey(p));
      }
    }
  }
  return hit;
}

export interface BuffSplitOutcome {
  arrows: ArrowItem[];
  removedIds: number[];
  credits: number;
}

export function applyPartialArrowDestruction(
  arrows: ArrowItem[],
  destroyedByArrow: Map<number, Set<string>>,
  nextInstanceId: () => number,
): BuffSplitOutcome {
  const removedIds: number[] = [];
  let credits = 0;
  const next: ArrowItem[] = [];

  for (const arrow of arrows) {
    const destroyed = destroyedByArrow.get(arrow.instanceId);
    if (!destroyed || destroyed.size === 0) {
      next.push(arrow);
      continue;
    }
    const results = splitArrowByDestroyedCells(arrow, destroyed, nextInstanceId);
    for (const r of results) {
      if (r.credit) credits += 1;
      if (r.removed) {
        removedIds.push(arrow.instanceId);
      } else if (r.arrow) {
        next.push(r.arrow);
      }
    }
  }

  const deduped: ArrowItem[] = [];
  const seen = new Set<number>();
  for (const a of next) {
    if (seen.has(a.instanceId)) continue;
    seen.add(a.instanceId);
    deduped.push(a);
  }

  return { arrows: deduped, removedIds, credits };
}

export function regionForBuff(buff: BuffItem): Vec2[] {
  const cell = buff.occupiedPositions[0];
  if (!cell) return [];
  if (buff.kind === 17) {
    return cellsInSquare(cell, buff.bombRadius === 2 ? 2 : 1);
  }
  if (buff.kind === 18) {
    return cellsInCross(cell, buff.crossArm === 5 ? 5 : 2);
  }
  if (buff.kind === 19) {
    return cellsInSquare(cell, 1);
  }
  return [cell];
}

export function arrowsFullyInCells(arrows: ArrowItem[], cells: Set<string>): ArrowItem[] {
  return arrows.filter((arrow) =>
    arrow.occupiedPositions.every((p) => cells.has(vecKey(p))),
  );
}

/** 统计箭数量最多的 colorId；无箭时返回 null。 */
export function dominantArrowColorId(
  arrows: ArrowItem[],
  includeArrow: (arrow: ArrowItem) => boolean = () => true,
): number | null {
  const ranked = rankArrowColorIds(arrows, includeArrow);
  return ranked[0] ?? null;
}

/** 按箭数量从多到少排列 colorId（同数时 colorId 升序）。 */
export function rankArrowColorIds(
  arrows: ArrowItem[],
  includeArrow: (arrow: ArrowItem) => boolean = () => true,
): number[] {
  const counts = new Map<number, number>();
  for (const arrow of arrows) {
    if (!includeArrow(arrow)) continue;
    counts.set(arrow.colorId, (counts.get(arrow.colorId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([colorId]) => colorId);
}

export function manhattanDistance(a: Vec2, b: Vec2): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}
