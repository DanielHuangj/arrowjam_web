import { describe, expect, it } from "vitest";
import { FrozenManager } from "./frozen.ts";
import type { ArrowItem, FrozenOverlayItem } from "../types.ts";

function overlay(health: number): FrozenOverlayItem {
  return {
    kind: 13,
    instanceId: 31,
    layer: 8,
    health,
    zoneId: null,
    hostArrowId: 30,
    occupiedPositions: [
      [5, 5],
      [6, 5],
    ],
  };
}

describe("FrozenManager", () => {
  it("reduces health on adjacent elimination", () => {
    const mgr = new FrozenManager([overlay(2)]);
    mgr.onAdjacentElimination([
      {
        kind: 1,
        instanceId: 32,
        layer: 2,
        direction: 4,
        colorId: 3,
        zoneId: null,
        occupiedPositions: [
          [4, 5],
          [3, 5],
        ],
      },
    ]);
    expect(mgr.getOverlays()[0]!.health).toBe(1);
    expect(mgr.isHostFrozen(30)).toBe(true);
  });

  it("removes overlay at zero health", () => {
    const mgr = new FrozenManager([overlay(1)]);
    mgr.onAdjacentElimination([
      {
        kind: 1,
        instanceId: 32,
        layer: 2,
        direction: 4,
        colorId: 3,
        zoneId: null,
        occupiedPositions: [[4, 5], [3, 5]],
      },
    ]);
    expect(mgr.getOverlays().length).toBe(0);
    expect(mgr.isHostFrozen(30)).toBe(false);
  });
});
