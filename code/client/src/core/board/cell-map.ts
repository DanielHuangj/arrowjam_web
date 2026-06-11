import type { ArrowItem, BoardSize, Direction, Vec2 } from "../types.ts";
import { DIR_VEC, vecKey } from "../types.ts";

export class CellMap {
  private cells = new Map<string, Set<number>>();

  static fromArrows(arrows: ArrowItem[]): CellMap {
    const map = new CellMap();
    for (const arrow of arrows) {
      map.addArrow(arrow);
    }
    return map;
  }

  addArrow(arrow: ArrowItem): void {
    for (const pos of arrow.occupiedPositions) {
      const key = vecKey(pos);
      let set = this.cells.get(key);
      if (!set) {
        set = new Set();
        this.cells.set(key, set);
      }
      set.add(arrow.instanceId);
    }
  }

  removeArrow(arrow: ArrowItem): void {
    for (const pos of arrow.occupiedPositions) {
      const key = vecKey(pos);
      const set = this.cells.get(key);
      if (!set) continue;
      set.delete(arrow.instanceId);
      if (set.size === 0) this.cells.delete(key);
    }
  }

  isBlockedByOther(pos: Vec2, excludeId: number): boolean {
    const set = this.cells.get(vecKey(pos));
    if (!set) return false;
    for (const id of set) {
      if (id !== excludeId) return true;
    }
    return false;
  }

  isBlockedExcept(pos: Vec2, excludeIds: Set<number>): boolean {
    const set = this.cells.get(vecKey(pos));
    if (!set) return false;
    for (const id of set) {
      if (!excludeIds.has(id)) return true;
    }
    return false;
  }

  getArrowAt(pos: Vec2): number | null {
    const set = this.cells.get(vecKey(pos));
    if (!set || set.size === 0) return null;
    return [...set].at(-1) ?? null;
  }
}

export function snakeStepPositions(
  positions: Vec2[],
  direction: Direction,
): Vec2[] {
  if (positions.length === 0) return [];
  const head = positions[positions.length - 1]!;
  const d = DIR_VEC[direction];
  const newHead: Vec2 = [head[0] + d[0], head[1] + d[1]];
  const next = positions.slice(1).map(([x, y]) => [x, y] as Vec2);
  next.push(newHead);
  return next;
}

/**
 * Snake-style launch step: head extends in direction, each body segment
 * moves to the previous segment's cell (tail is dropped).
 */
export function snakeStepArrow(
  arrow: ArrowItem,
  direction: Direction = arrow.direction,
): ArrowItem {
  const newPositions = snakeStepPositions(arrow.occupiedPositions, direction);
  return { ...arrow, occupiedPositions: newPositions, direction };
}

export function arrowFullyOffBoard(arrow: ArrowItem, board: BoardSize): boolean {
  return arrow.occupiedPositions.every(
    ([x, y]) => x < 0 || x >= board.width || y < 0 || y >= board.height,
  );
}
