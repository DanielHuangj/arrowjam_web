import { describe, expect, it } from "vitest";
import type { ArrowItem, BuffItem } from "../types.ts";
import { BundleManager } from "./bundle.ts";
import {
  areAllBuffsUntriggerable,
  buildLaunchUnits,
  isBoardStalemate,
  pickAutoRefreshArrowIds,
  type BoardStalemateContext,
} from "./board-stalemate.ts";

function baseCtx(
  arrows: ArrowItem[],
  buffs: BuffItem[] = [],
  launchableIds: Set<number> = new Set(),
): BoardStalemateContext {
  const bundleManager = new BundleManager([], arrows);
  return {
    board: { width: 10, height: 10 },
    arrows,
    buffs,
    launchableIds,
    launchUnits: buildLaunchUnits(arrows, bundleManager),
    blockingArrows: arrows,
    activeCorners: [],
    pipes: [],
    curtainCells: new Set(),
    wallCells: new Set(),
    canClickBuffs: true,
    activeBlackHoleIds: new Set(),
    balloonArrowFilter: () => true,
  };
}

describe("board-stalemate", () => {
  it("detects stalemate when all arrows blocked and no buffs", () => {
    const arrows: ArrowItem[] = [
      {
        kind: 1,
        instanceId: 1,
        layer: 2,
        direction: 3,
        colorId: 7,
        zoneId: null,
        occupiedPositions: [
          [3, 5],
          [4, 5],
          [5, 5],
        ],
      },
      {
        kind: 1,
        instanceId: 2,
        layer: 2,
        direction: 4,
        colorId: 6,
        zoneId: null,
        occupiedPositions: [
          [6, 5],
          [7, 5],
          [8, 5],
        ],
      },
    ];
    const ctx = baseCtx(arrows, [], new Set());
    expect(isBoardStalemate(ctx)).toBe(true);
  });

  it("balloon is triggerable when an arrow bump path crosses it", () => {
    const arrows: ArrowItem[] = [
      {
        kind: 1,
        instanceId: 1,
        layer: 2,
        direction: 3,
        colorId: 7,
        zoneId: null,
        occupiedPositions: [
          [3, 5],
          [4, 5],
          [5, 5],
        ],
      },
      {
        kind: 1,
        instanceId: 2,
        layer: 2,
        direction: 4,
        colorId: 6,
        zoneId: null,
        occupiedPositions: [
          [7, 5],
          [8, 5],
          [9, 5],
        ],
      },
    ];
    const buffs: BuffItem[] = [
      {
        kind: 20,
        instanceId: 100,
        layer: 2,
        zoneId: null,
        occupiedPositions: [[6, 5]],
      },
    ];
    const ctx = baseCtx(arrows, buffs, new Set());
    expect(areAllBuffsUntriggerable(ctx)).toBe(false);
    expect(isBoardStalemate(ctx)).toBe(false);
  });

  it("balloon is untriggerable without hit path or nearby explosive", () => {
    const arrows: ArrowItem[] = [
      {
        kind: 1,
        instanceId: 1,
        layer: 2,
        direction: 3,
        colorId: 7,
        zoneId: null,
        occupiedPositions: [
          [3, 5],
          [4, 5],
          [5, 5],
        ],
      },
      {
        kind: 1,
        instanceId: 2,
        layer: 2,
        direction: 4,
        colorId: 6,
        zoneId: null,
        occupiedPositions: [
          [7, 5],
          [8, 5],
          [9, 5],
        ],
      },
    ];
    const buffs: BuffItem[] = [
      {
        kind: 20,
        instanceId: 100,
        layer: 2,
        zoneId: null,
        occupiedPositions: [[1, 1]],
      },
    ];
    const ctx = baseCtx(arrows, buffs, new Set());
    expect(areAllBuffsUntriggerable(ctx)).toBe(true);
  });

  it("clickable bomb prevents stalemate", () => {
    const arrows: ArrowItem[] = [
      {
        kind: 1,
        instanceId: 1,
        layer: 2,
        direction: 3,
        colorId: 7,
        zoneId: null,
        occupiedPositions: [
          [3, 5],
          [4, 5],
          [5, 5],
        ],
      },
      {
        kind: 1,
        instanceId: 2,
        layer: 2,
        direction: 4,
        colorId: 6,
        zoneId: null,
        occupiedPositions: [
          [6, 5],
          [7, 5],
          [8, 5],
        ],
      },
    ];
    const buffs: BuffItem[] = [
      {
        kind: 17,
        instanceId: 100,
        layer: 2,
        zoneId: null,
        occupiedPositions: [[1, 1]],
        bombRadius: 1,
      },
    ];
    const ctx = baseCtx(arrows, buffs, new Set());
    expect(isBoardStalemate(ctx)).toBe(false);
  });

  it("pickAutoRefreshArrowIds chooses half of eligible arrows", () => {
    const arrows: ArrowItem[] = [
      {
        kind: 1,
        instanceId: 1,
        layer: 2,
        direction: 3,
        colorId: 7,
        zoneId: null,
        occupiedPositions: [[0, 0]],
      },
      {
        kind: 1,
        instanceId: 2,
        layer: 2,
        direction: 3,
        colorId: 7,
        zoneId: null,
        occupiedPositions: [[1, 0]],
      },
      {
        kind: 1,
        instanceId: 3,
        layer: 2,
        direction: 3,
        colorId: 7,
        zoneId: null,
        occupiedPositions: [[2, 0]],
      },
    ];
    const ids = pickAutoRefreshArrowIds(arrows, () => true, () => 0);
    expect(ids.size).toBe(2);
  });
});
