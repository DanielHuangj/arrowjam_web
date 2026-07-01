import { describe, expect, it } from "vitest";
import {
  getReflectedDirection,
  isValidCornerEntry,
  rotateCorner,
} from "./corner.ts";
import type { CornerItem } from "../types.ts";

const bottomLeftCorner: CornerItem = {
  kind: 4,
  instanceId: 1,
  layer: 2,
  occupiedPositions: [[6, 25]],
  direction1: [1, 0],
  direction2: [0, -1],
  zoneId: null,
};

describe("corner reflection", () => {
  it("allows entry from down into bottom corner", () => {
    expect(isValidCornerEntry(1, bottomLeftCorner)).toBe(true);
  });

  it("blocks entry from right (back face)", () => {
    expect(isValidCornerEntry(3, bottomLeftCorner)).toBe(false);
  });

  it("reflects down to right for bottom-left corner", () => {
    expect(getReflectedDirection(1, bottomLeftCorner)).toBe(3);
  });

  it("reflects down to left for bottom-right corner", () => {
    const corner: CornerItem = {
      ...bottomLeftCorner,
      direction1: [-1, 0],
    };
    expect(getReflectedDirection(1, corner)).toBe(4);
  });

  it("rotateCorner spins reflection vectors", () => {
    const rotated = rotateCorner(bottomLeftCorner, 90, 0);
    expect(rotated.direction1).toEqual([0, 1]);
    expect(rotated.direction2).toEqual([1, 0]);
  });
});
