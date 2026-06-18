import type { ArrowItem, BombItem, Vec2 } from "../types.ts";
import { vecKey } from "../types.ts";

export const BOMB_EXPLOSION_DURATION = 1.1;

export interface BombRuntime {
  bomb: BombItem;
  segmentIndex: number;
  remainingTime: number;
  activated: boolean;
}

export interface BombDrawState {
  bomb: BombItem;
  remaining: number | null;
}

export class BombManager {
  private runtime: BombRuntime[];

  constructor(bombs: BombItem[], arrows: ArrowItem[]) {
    this.runtime = bombs.map((bomb) => ({
      bomb: { ...bomb, occupiedPositions: clonePositions(bomb.occupiedPositions) },
      segmentIndex: resolveSegmentIndex(bomb, arrows),
      remainingTime: bomb.time,
      activated: false,
    }));
  }

  get activeBombs(): BombRuntime[] {
    return this.runtime.filter((r) => r.bomb.hostArrowId != null);
  }

  getUrgentRemaining(): number | null {
    const active = this.runtime.filter((r) => r.activated);
    if (active.length === 0) return null;
    return Math.min(...active.map((r) => r.remainingTime));
  }

  removeForHosts(hostIds: Set<number>): void {
    this.runtime = this.runtime.filter((r) => !hostIds.has(r.bomb.hostArrowId));
  }

  syncWithArrows(arrows: ArrowItem[]): void {
    for (const r of this.runtime) {
      const host = arrows.find((a) => a.instanceId === r.bomb.hostArrowId);
      if (!host || host.occupiedPositions.length === 0) continue;
      const idx = Math.min(r.segmentIndex, host.occupiedPositions.length - 1);
      const pos = host.occupiedPositions[idx];
      if (!pos) continue;
      r.bomb.occupiedPositions = [[pos[0], pos[1]]];
    }
  }

  updateActivation(isHostCovered: (hostArrowId: number) => boolean): void {
    for (const r of this.runtime) {
      if (r.activated) continue;
      if (!isHostCovered(r.bomb.hostArrowId)) {
        r.activated = true;
      }
    }
  }

  /** 返回本帧引爆的格子（用于爆炸特效） */
  tick(dt: number): Vec2[] {
    const explodedCells: Vec2[] = [];
    const next: BombRuntime[] = [];
    for (const r of this.runtime) {
      if (!r.activated) {
        next.push(r);
        continue;
      }
      r.remainingTime -= dt;
      if (r.remainingTime <= 0) {
        for (const p of r.bomb.occupiedPositions) {
          explodedCells.push([p[0], p[1]]);
        }
        continue;
      }
      next.push(r);
    }
    this.runtime = next;
    return explodedCells;
  }

  getDrawableStates(): BombDrawState[] {
    return this.runtime.map((r) => ({
      bomb: r.bomb,
      remaining: r.activated ? r.remainingTime : null,
    }));
  }

  getDrawableBombs(): BombItem[] {
    return this.runtime.map((r) => r.bomb);
  }

  getBombAtCell(pos: Vec2): BombRuntime | null {
    const key = vecKey(pos);
    for (const r of this.runtime) {
      if (r.bomb.occupiedPositions.some((p) => vecKey(p) === key)) return r;
    }
    return null;
  }

  isBombActiveOnArrow(arrow: ArrowItem): boolean {
    return this.runtime.some(
      (r) => r.activated && r.bomb.hostArrowId === arrow.instanceId,
    );
  }
}

function clonePositions(positions: Vec2[]): Vec2[] {
  return positions.map(([x, y]) => [x, y] as Vec2);
}

function resolveSegmentIndex(bomb: BombItem, arrows: ArrowItem[]): number {
  const host = arrows.find((a) => a.instanceId === bomb.hostArrowId);
  const bombCell = bomb.occupiedPositions[0];
  if (!host || !bombCell) return 0;
  const idx = host.occupiedPositions.findIndex(
    (p) => p[0] === bombCell[0] && p[1] === bombCell[1],
  );
  return idx >= 0 ? idx : 0;
}
