import { describe, expect, it } from "vitest";
import { extendPolylineToCell } from "./draw-state.ts";

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
});
