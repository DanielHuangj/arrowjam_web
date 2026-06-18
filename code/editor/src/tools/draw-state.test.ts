import { describe, expect, it } from "vitest";
import {
  buildFlipArrowItem,
  extendPolylineToCell,
  tailMatchesDirection,
} from "./draw-state.ts";

describe("extendPolylineToCell", () => {
  it("extends horizontally on drag", () => {
    const result = extendPolylineToCell([[2, 2]], [5, 2]);
    expect(result).toEqual([
      [2, 2],
      [3, 2],
      [4, 2],
      [5, 2],
    ]);
  });

  it("extends with L-turn (x then y)", () => {
    const result = extendPolylineToCell([[1, 1]], [3, 4]);
    expect(result).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
      [3, 2],
      [3, 3],
      [3, 4],
    ]);
  });

  it("stops on self-intersection", () => {
    const result = extendPolylineToCell(
      [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
      [0, 0],
    );
    expect(result.length).toBeLessThan(5);
    expect(result.at(-1)).not.toEqual([0, 0]);
  });

  it("builds flip arrow item", () => {
    const item = buildFlipArrowItem(
      [
        [1, 5],
        [2, 5],
        [3, 5],
      ],
      3,
      4,
      6,
    );
    expect(item.kind).toBe(2);
    expect(item.direction1).toBe(3);
    expect(item.direction2).toBe(4);
  });

  it("validates direction2 against first segment", () => {
    expect(
      tailMatchesDirection(
        [
          [5, 6],
          [6, 6],
          [7, 6],
        ],
        4,
      ),
    ).toBe(true);
  });
});
