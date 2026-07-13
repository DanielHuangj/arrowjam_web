import { describe, expect, it } from "vitest";
import { dominantArrowColorId, rankArrowColorIds } from "./buff-items.ts";
import type { ArrowItem } from "../types.ts";

function arrow(id: number, colorId: number): ArrowItem {
  return {
    kind: 1,
    instanceId: id,
    layer: 2,
    direction: 3,
    colorId,
    zoneId: null,
    occupiedPositions: [[0, 0]],
  };
}

describe("dominantArrowColorId", () => {
  it("returns color with the most arrows", () => {
    expect(
      dominantArrowColorId([
        arrow(1, 6),
        arrow(2, 6),
        arrow(3, 3),
      ]),
    ).toBe(6);
  });

  it("rankArrowColorIds orders by count then id", () => {
    expect(
      rankArrowColorIds([
        arrow(1, 6),
        arrow(2, 6),
        arrow(3, 3),
      ]),
    ).toEqual([6, 3]);
  });

  it("returns null when no arrows match filter", () => {
    expect(
      dominantArrowColorId([arrow(1, 6)], () => false),
    ).toBeNull();
  });
});
