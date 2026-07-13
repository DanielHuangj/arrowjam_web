import { describe, expect, it } from "vitest";
import type { ArrowItem } from "../types.ts";
import { splitArrowByDestroyedCells, splitIntoContiguousSegments } from "./arrow-split.ts";

function arrow(positions: [number, number][], direction = 3): ArrowItem {
  return {
    kind: 1,
    instanceId: 1,
    layer: 2,
    direction,
    colorId: 7,
    occupiedPositions: positions,
    zoneId: null,
  };
}

describe("splitIntoContiguousSegments", () => {
  it("splits gapped path into separate segments", () => {
    const segments = splitIntoContiguousSegments([
      [0, 0],
      [1, 0],
      [3, 0],
      [4, 0],
    ]);
    expect(segments).toEqual([
      [
        [0, 0],
        [1, 0],
      ],
      [
        [3, 0],
        [4, 0],
      ],
    ]);
  });
});

describe("splitArrowByDestroyedCells", () => {
  it("does not keep one arrow with a gap after middle cells are destroyed", () => {
    const a = arrow([
      [0, 5],
      [1, 5],
      [2, 5],
      [3, 5],
      [4, 5],
    ]);
    const destroyed = new Set(["1,5", "2,5"]);
    const results = splitArrowByDestroyedCells(a, destroyed, () => 99);
    const survivors = results.filter((r) => r.arrow).map((r) => r.arrow!.occupiedPositions);

    expect(survivors).toEqual([
      [
        [3, 5],
        [4, 5],
      ],
    ]);
    for (const positions of survivors) {
      for (let i = 1; i < positions.length; i++) {
        const prev = positions[i - 1]!;
        const cur = positions[i]!;
        expect(Math.abs(prev[0] - cur[0]) + Math.abs(prev[1] - cur[1])).toBe(1);
      }
    }
  });

  it("keeps head segment on original instance id", () => {
    const a = arrow([
      [0, 5],
      [1, 5],
      [2, 5],
      [3, 5],
    ]);
    const destroyed = new Set(["0,5", "1,5"]);
    const results = splitArrowByDestroyedCells(a, destroyed, () => 99);
    const headSegment = results.find((r) => r.arrow?.occupiedPositions.at(-1)?.join(",") === "3,5");
    expect(headSegment?.arrow?.instanceId).toBe(1);
  });
});
