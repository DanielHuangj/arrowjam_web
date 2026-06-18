import { describe, expect, it } from "vitest";
import { MovingWallManager, wouldStepIntoWall } from "./moving-wall.ts";
import type { MovingWallItem } from "../types.ts";

function wall(): MovingWallItem {
  return {
    kind: 7,
    instanceId: 1,
    layer: 2,
    occupiedPositions: [[8, 5]],
    movingPath: [
      [8, 5],
      [8, 4],
      [8, 3],
      [8, 2],
    ],
    movingDistance: 1,
    movingType: 1,
    zoneId: null,
  };
}

function wrapWall(): MovingWallItem {
  return {
    kind: 7,
    instanceId: 2,
    layer: 2,
    occupiedPositions: [
      [8, 5],
      [8, 4],
    ],
    movingPath: [
      [8, 5],
      [8, 4],
      [8, 3],
      [8, 2],
    ],
    movingDistance: 1,
    movingType: 2,
    zoneId: null,
  };
}

describe("MovingWallManager", () => {
  it("advances along ping-pong path", () => {
    const mgr = new MovingWallManager([wall()]);
    mgr.advanceAll();
    expect(mgr.getWalls()[0]!.occupiedPositions[0]).toEqual([8, 4]);
    mgr.advanceAll();
    expect(mgr.getWalls()[0]!.occupiedPositions[0]).toEqual([8, 3]);
  });

  it("exposes blocker cells", () => {
    const mgr = new MovingWallManager([wall()]);
    expect(mgr.getBlockerCells().has("8,5")).toBe(true);
  });

  it("detects edge collision before entering wall cell", () => {
    const cells = new Set(["8,5"]);
    expect(wouldStepIntoWall([7, 5], 3, cells)).toBe(true);
    expect(wouldStepIntoWall([7, 5], 1, cells)).toBe(false);
    expect(wouldStepIntoWall([8, 5], 3, cells)).toBe(false);
  });

  it("wraps multi-cell wall segment by segment", () => {
    const mgr = new MovingWallManager([wrapWall()]);
    expect(mgr.getWalls()[0]!.occupiedPositions).toEqual([
      [8, 5],
      [8, 4],
    ]);

    mgr.advanceAll();
    expect(mgr.getWalls()[0]!.occupiedPositions).toEqual([
      [8, 4],
      [8, 3],
    ]);

    mgr.advanceAll();
    expect(mgr.getWalls()[0]!.occupiedPositions).toEqual([
      [8, 3],
      [8, 2],
    ]);

    mgr.advanceAll();
    expect(mgr.getWalls()[0]!.occupiedPositions).toEqual([
      [8, 2],
      [8, 5],
    ]);

    mgr.advanceAll();
    expect(mgr.getWalls()[0]!.occupiedPositions).toEqual([
      [8, 5],
      [8, 4],
    ]);
  });

  it("ping-pong multi-cell wall reverses before tail leaves path", () => {
    const mgr = new MovingWallManager([
      { ...wrapWall(), movingType: 1 },
    ]);
    mgr.advanceAll();
    mgr.advanceAll();
    expect(mgr.getWalls()[0]!.occupiedPositions).toEqual([
      [8, 3],
      [8, 2],
    ]);
    mgr.advanceAll();
    expect(mgr.getWalls()[0]!.occupiedPositions).toEqual([
      [8, 4],
      [8, 3],
    ]);
  });
});
