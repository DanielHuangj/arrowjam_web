import { describe, expect, it } from "vitest";
import {
  arrowHasCellInBlackHole,
  trimArrowSuffixInBlackHole,
} from "./black-hole-region.ts";

describe("trimArrowSuffixInBlackHole", () => {
  const hole = new Set(["2,0", "3,0", "4,0"]);

  it("leaves arrow unchanged when no cells in hole", () => {
    const pos = [
      [0, 0],
      [1, 0],
    ] as const;
    const { remaining, consumed } = trimArrowSuffixInBlackHole(pos, hole);
    expect(remaining).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(consumed).toEqual([]);
  });

  it("consumes suffix from head when head enters hole", () => {
    const pos = [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ] as const;
    const { remaining, consumed } = trimArrowSuffixInBlackHole(pos, hole);
    expect(remaining).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(consumed).toEqual([
      [2, 0],
      [3, 0],
    ]);
  });

  it("consumes all cells when fully inside hole", () => {
    const pos = [
      [2, 0],
      [3, 0],
      [4, 0],
    ] as const;
    const { remaining, consumed } = trimArrowSuffixInBlackHole(pos, hole);
    expect(remaining).toEqual([]);
    expect(consumed).toEqual([
      [2, 0],
      [3, 0],
      [4, 0],
    ]);
  });
});

describe("arrowHasCellInBlackHole", () => {
  it("detects overlap", () => {
    expect(
      arrowHasCellInBlackHole(
        [
          [0, 0],
          [2, 0],
        ],
        new Set(["2,0"]),
      ),
    ).toBe(true);
    expect(arrowHasCellInBlackHole([[0, 0]], new Set(["2,0"]))).toBe(false);
  });
});
