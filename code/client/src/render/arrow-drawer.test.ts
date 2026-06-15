import { describe, expect, it } from "vitest";
import type { ArrowItem } from "../core/types.ts";
import { arrowBodyCellCount } from "./arrow-drawer.ts";

describe("arrow-drawer", () => {
  it("arrowBodyCellCount excludes head cell", () => {
    const arrow: ArrowItem = {
      kind: 1,
      instanceId: 1,
      layer: 2,
      direction: 3,
      colorId: 6,
      zoneId: null,
      occupiedPositions: [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
    };
    expect(arrowBodyCellCount(arrow)).toBe(2);
  });
});
