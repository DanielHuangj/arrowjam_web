import type { ArrowItem, CurtainItem, Vec2 } from "../types.ts";
import { vecKey } from "../types.ts";

export interface CurtainState extends CurtainItem {
  cells: Set<string>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

function buildCurtainState(item: CurtainItem): CurtainState {
  const cells = new Set(item.occupiedPositions.map((p) => vecKey(p)));
  const xs = item.occupiedPositions.map((p) => p[0]);
  const ys = item.occupiedPositions.map((p) => p[1]);
  return {
    ...item,
    cells,
    bounds: {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    },
  };
}

/**
 * kind 6 幕布：覆盖格阻挡路径；health 归零后消失；
 * 多幕布时仅 order 最小的未消除幕布接受钥匙计数。
 */
export class CurtainManager {
  private curtains: CurtainState[];

  constructor(curtains: CurtainItem[]) {
    this.curtains = curtains
      .map((c) => buildCurtainState({ ...c, health: c.health }))
      .sort((a, b) => a.order - b.order || a.instanceId - b.instanceId);
  }

  getActiveCurtains(): CurtainState[] {
    return this.curtains.filter((c) => c.health > 0);
  }

  getActiveCellKeys(): Set<string> {
    const keys = new Set<string>();
    for (const curtain of this.getActiveCurtains()) {
      for (const key of curtain.cells) keys.add(key);
    }
    return keys;
  }

  isCellCovered(pos: Vec2): boolean {
    return this.getActiveCellKeys().has(vecKey(pos));
  }

  isArrowHidden(arrow: ArrowItem): boolean {
    return arrow.occupiedPositions.some((p) => this.isCellCovered(p));
  }

  arePositionsHidden(positions: Vec2[]): boolean {
    return positions.some((p) => this.isCellCovered(p));
  }

  /** order 最小且 health > 0 的幕布 */
  getTargetCurtain(): CurtainState | null {
    const active = this.getActiveCurtains();
    if (active.length === 0) return null;
    return active.reduce((min, c) => (c.order < min.order ? c : min), active[0]!);
  }

  applyKey(count = 1): void {
    const target = this.getTargetCurtain();
    if (!target) return;
    target.health = Math.max(0, target.health - count);
  }
}
