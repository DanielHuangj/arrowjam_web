import { describe, expect, it } from "vitest";
import {
  applyInvalidCellColor,
  buildInvalidCellColorMap,
  INVALID_CELL_COLOR_BLACK,
  INVALID_CELL_COLOR_WHITE,
  pruneInvalidCellColors,
  serializeInvalidCellColors,
} from "./invalid-cell-colors.ts";

describe("invalid cell colors", () => {
  it("round-trips colored mask entries", () => {
    const entries = [
      { color: 3 as const, rows: [[0, 1, 2] as [number, number, number]] },
      { color: INVALID_CELL_COLOR_BLACK, rows: [[1, 0, 0] as [number, number, number]] },
    ];
    const map = buildInvalidCellColorMap({
      width: 5,
      height: 5,
      invalidCellColors: entries,
    });
    expect(map.get("1,0")).toBe(3);
    expect(map.get("0,1")).toBe(INVALID_CELL_COLOR_BLACK);
    const out = serializeInvalidCellColors(map, 5, 5);
    expect(out).toHaveLength(2);
  });

  it("apply white removes color", () => {
    const draft = new Map([["1,0", 3 as const]]);
    const next = applyInvalidCellColor(draft, ["1,0"], INVALID_CELL_COLOR_WHITE);
    expect(next.has("1,0")).toBe(false);
  });

  it("accepts light gray color id", () => {
    const draft = applyInvalidCellColor(new Map(), ["2,2"], 10);
    expect(draft.get("2,2")).toBe(10);
    const out = serializeInvalidCellColors(draft, 5, 5);
    expect(out?.[0]?.color).toBe(10);
  });

  it("prune keeps only invalid keys", () => {
    const draft = new Map([
      ["1,0", 3 as const],
      ["2,0", 7 as const],
    ]);
    const pruned = pruneInvalidCellColors(draft, new Set(["1,0"]));
    expect(pruned.get("1,0")).toBe(3);
    expect(pruned.has("2,0")).toBe(false);
  });
});
