import { describe, expect, it } from "vitest";
import { flipArrow, flipBoardArrow, flipUncoveredArrows } from "./flip.ts";
import type { ArrowItem } from "../types.ts";

function flipArrowItem(id: number, dir1: 1 | 3, dir2: 4): ArrowItem {
  return {
    kind: 2,
    instanceId: id,
    layer: 2,
    direction: dir1,
    direction1: dir1,
    direction2: dir2,
    colorId: 7,
    zoneId: null,
    occupiedPositions: [
      [5, 5],
      [6, 5],
      [7, 5],
    ],
  };
}

describe("flip", () => {
  it("reverses positions and toggles direction", () => {
    const a = flipArrowItem(1, 3, 4);
    const flipped = flipArrow(a);
    expect(flipped.direction).toBe(4);
    expect(flipped.occupiedPositions[0]).toEqual([7, 5]);
    expect(flipped.occupiedPositions.at(-1)).toEqual([5, 5]);
  });

  it("skips covered arrows in batch flip", () => {
    const arrows = [flipArrowItem(1, 3, 4), flipArrowItem(2, 3, 4)];
    const result = flipUncoveredArrows(arrows, (a) => a.instanceId === 2);
    expect(result[0]!.direction).toBe(4);
    expect(result[1]!.direction).toBe(3);
  });

  it("flipBoardArrow reverses kind 1 arrow head and tail", () => {
    const normal: ArrowItem = {
      kind: 1,
      instanceId: 3,
      layer: 2,
      direction: 3,
      colorId: 7,
      zoneId: null,
      occupiedPositions: [
        [5, 5],
        [6, 5],
        [7, 5],
      ],
    };
    const flipped = flipBoardArrow(normal);
    expect(flipped.direction).toBe(4);
    expect(flipped.occupiedPositions[0]).toEqual([7, 5]);
    expect(flipped.occupiedPositions.at(-1)).toEqual([5, 5]);
  });

  it("flipBoardArrow uses head segment direction for bent kind 1 arrow", () => {
    const bent: ArrowItem = {
      kind: 1,
      instanceId: 4,
      layer: 2,
      direction: 1,
      colorId: 7,
      zoneId: null,
      occupiedPositions: [
        [5, 5],
        [6, 5],
        [6, 6],
      ],
    };
    const flipped = flipBoardArrow(bent);
    expect(flipped.direction).toBe(4);
    expect(flipped.occupiedPositions.at(-1)).toEqual([5, 5]);
  });

  it("flipBoardArrow uses head segment direction for bent kind 2 arrow", () => {
    const bent: ArrowItem = {
      kind: 2,
      instanceId: 5,
      layer: 2,
      direction: 1,
      direction1: 1,
      direction2: 4,
      colorId: 7,
      zoneId: null,
      occupiedPositions: [
        [5, 5],
        [6, 5],
        [6, 6],
      ],
    };
    const flipped = flipBoardArrow(bent);
    expect(flipped.direction).toBe(4);
    expect(flipped.occupiedPositions.at(-1)).toEqual([5, 5]);
  });
});
