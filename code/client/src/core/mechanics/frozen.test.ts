import { describe, expect, it } from "vitest";
import { frozenHealthViewPathIndex } from "@arrowjaw/shared";
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

describe("frozenHealthViewPathIndex", () => {
  it("anchors on middle body cell along tail-to-head path", () => {
    expect(frozenHealthViewPathIndex(2)).toBe(0);
    expect(frozenHealthViewPathIndex(3)).toBe(1);
    expect(frozenHealthViewPathIndex(5)).toBe(2);
  });
});

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

  it("skips damage when overlay filter returns false", () => {
    const mgr = new FrozenManager([{ ...overlay(2), zoneId: 100 }]);
    mgr.onAdjacentElimination(
      [
        {
          kind: 1,
          instanceId: 32,
          layer: 2,
          direction: 4,
          colorId: 3,
          zoneId: null,
          occupiedPositions: [[4, 5], [3, 5]],
        },
      ],
      () => false,
    );
    expect(mgr.getOverlays()[0]!.health).toBe(2);
  });
});
