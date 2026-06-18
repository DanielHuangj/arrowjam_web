import { describe, expect, it } from "vitest";
import { appendWallPathPoint, extendWallPathToCell } from "./wall-path-preview.ts";

describe("extendWallPathToCell", () => {
  it("extends horizontally on drag", () => {
    const result = extendWallPathToCell([[2, 2]], [5, 2]);
    expect(result).toEqual([
      [2, 2],
      [3, 2],
      [4, 2],
      [5, 2],
    ]);
  });

  it("extends with L-turn", () => {
    const result = extendWallPathToCell([[1, 1]], [3, 3]);
    expect(result).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
      [3, 2],
      [3, 3],
    ]);
  });

  it("appendWallPathPoint rejects non-adjacent jump", () => {
    expect(appendWallPathPoint([[0, 0]], [2, 0])).toEqual([[0, 0]]);
  });
});
