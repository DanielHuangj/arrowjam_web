import { describe, expect, it } from "vitest";
import { GoalTracker } from "./goal-tracker.ts";
import type { ArrowItem } from "../types.ts";

function arrow(id: number, colorId: number): ArrowItem {
  return {
    kind: 1,
    instanceId: id,
    layer: 2,
    direction: 1,
    colorId,
    zoneId: null,
    occupiedPositions: [[0, 0], [0, 1]],
  };
}

describe("GoalTracker", () => {
  it("tracks clearArrowCount goal", () => {
    const gt = new GoalTracker([{ type: "clearArrowCount", count: 3 }], true);
    gt.onEliminationBatch([arrow(1, 7)]);
    expect(gt.isMet()).toBe(false);
    gt.onEliminationBatch([arrow(2, 3), arrow(3, 6)]);
    expect(gt.isMet()).toBe(true);
  });

  it("tracks color goals", () => {
    const gt = new GoalTracker(
      [{ type: "clearColorArrows", targets: [{ colorId: 7, count: 2 }] }],
      true,
    );
    gt.onEliminationBatch([arrow(1, 3)]);
    expect(gt.isMet()).toBe(false);
    gt.onEliminationBatch([arrow(2, 7), arrow(3, 7)]);
    expect(gt.isMet()).toBe(true);
    const progress = gt.getProgress()[0]!;
    expect(progress.colorId).toBe(7);
    expect(progress.current).toBe(2);
    expect(progress.target).toBe(2);
  });

  it("disabled when not rush", () => {
    const gt = new GoalTracker([{ type: "clearArrowCount", count: 1 }], false);
    gt.onEliminationBatch([arrow(1, 7)]);
    expect(gt.isMet()).toBe(false);
  });
});
