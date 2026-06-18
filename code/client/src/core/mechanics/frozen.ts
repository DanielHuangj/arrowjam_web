import type { ArrowItem, FrozenOverlayItem, Vec2 } from "../types.ts";

const ORTHO: Vec2[] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

function areOrthoAdjacent(a: Vec2, b: Vec2): boolean {
  return ORTHO.some(([dx, dy]) => a[0] + dx === b[0] && a[1] + dy === b[1]);
}

export class FrozenManager {
  private overlays: FrozenOverlayItem[];

  constructor(overlays: FrozenOverlayItem[]) {
    this.overlays = overlays.map((o) => ({ ...o }));
  }

  getOverlays(): FrozenOverlayItem[] {
    return this.overlays;
  }

  isHostFrozen(hostArrowId: number): boolean {
    return this.overlays.some((o) => o.hostArrowId === hostArrowId);
  }

  getOverlayForHost(hostArrowId: number): FrozenOverlayItem | null {
    return this.overlays.find((o) => o.hostArrowId === hostArrowId) ?? null;
  }

  onAdjacentElimination(removedArrows: ArrowItem[]): void {
    if (removedArrows.length === 0 || this.overlays.length === 0) return;

    const removedCells: Vec2[] = [];
    for (const arrow of removedArrows) {
      for (const p of arrow.occupiedPositions) {
        removedCells.push(p);
      }
    }

    const next: FrozenOverlayItem[] = [];
    for (const overlay of this.overlays) {
      let damage = 0;
      for (const removed of removedCells) {
        for (const frozenCell of overlay.occupiedPositions) {
          if (areOrthoAdjacent(removed, frozenCell)) {
            damage = 1;
            break;
          }
        }
        if (damage > 0) break;
      }
      if (damage === 0) {
        next.push(overlay);
        continue;
      }
      const health = overlay.health - 1;
      if (health > 0) {
        next.push({ ...overlay, health });
      }
    }
    this.overlays = next;
  }
}
