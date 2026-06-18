import { describe, expect, it } from "vitest";
import { BombManager } from "./bomb.ts";
import type { ArrowItem, BombItem } from "../types.ts";

function bomb(time: number): BombItem {
  return {
    kind: 5,
    instanceId: 1,
    layer: 3,
    time,
    zoneId: null,
    hostArrowId: 10,
    occupiedPositions: [[5, 5]],
  };
}

const hostArrow: ArrowItem = {
  kind: 1,
  instanceId: 10,
  layer: 2,
  direction: 3,
  colorId: 6,
  zoneId: null,
  occupiedPositions: [
    [4, 5],
    [5, 5],
    [6, 5],
  ],
};

describe("BombManager", () => {
  it("activates when host uncovered", () => {
    const mgr = new BombManager([bomb(10)], [hostArrow]);
    mgr.updateActivation(() => false);
    expect(mgr.getUrgentRemaining()).toBe(10);
  });

  it("does not tick before activation", () => {
    const mgr = new BombManager([bomb(10)], [hostArrow]);
    expect(mgr.tick(5)).toEqual([]);
    expect(mgr.getUrgentRemaining()).toBeNull();
  });

  it("explodes when time runs out", () => {
    const mgr = new BombManager([bomb(3)], [hostArrow]);
    mgr.updateActivation(() => false);
    expect(mgr.tick(4)).toEqual([[5, 5]]);
    expect(mgr.getDrawableBombs().length).toBe(0);
  });

  it("removes bomb when host eliminated", () => {
    const mgr = new BombManager([bomb(10)], [hostArrow]);
    mgr.removeForHosts(new Set([10]));
    expect(mgr.getDrawableBombs().length).toBe(0);
  });

  it("follows host arrow segment during movement", () => {
    const mgr = new BombManager([bomb(10)], [hostArrow]);
    const moved: ArrowItem = {
      ...hostArrow,
      occupiedPositions: [
        [5, 5],
        [6, 5],
        [7, 5],
      ],
    };
    mgr.syncWithArrows([moved]);
    expect(mgr.getDrawableBombs()[0]!.occupiedPositions[0]).toEqual([6, 5]);
  });
});
