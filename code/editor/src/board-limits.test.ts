import { describe, expect, it } from "vitest";
import { BOARD_MIN_SIZE, BOARD_MAX_SIZE, boardSizeRangeLabel, isBoardSizeValid } from "./board-limits.ts";

describe("board-limits", () => {
  it("allows small boards below 20", () => {
    expect(isBoardSizeValid(12, 12)).toBe(true);
    expect(isBoardSizeValid(8, 8)).toBe(true);
    expect(isBoardSizeValid(BOARD_MIN_SIZE, BOARD_MIN_SIZE)).toBe(true);
  });

  it("rejects out of range", () => {
    expect(isBoardSizeValid(3, 12)).toBe(false);
    expect(isBoardSizeValid(256, 20)).toBe(false);
  });

  it("formats range label", () => {
    expect(boardSizeRangeLabel()).toBe(`${BOARD_MIN_SIZE}–${BOARD_MAX_SIZE}`);
  });
});
