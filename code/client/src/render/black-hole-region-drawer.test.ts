import { describe, expect, it } from "vitest";
import { splitBlackHoleComponents } from "./black-hole-region-drawer.ts";

describe("splitBlackHoleComponents", () => {
  it("splits disjoint regions", () => {
    const cells = new Set(["0,0", "1,0", "5,5"]);
    const parts = splitBlackHoleComponents(cells);
    expect(parts).toHaveLength(2);
    expect(parts.some((p) => p.has("0,0") && p.has("1,0"))).toBe(true);
    expect(parts.some((p) => p.has("5,5"))).toBe(true);
  });

  it("keeps orthogonally connected cells together", () => {
    const cells = new Set(["3,5", "4,5", "4,6", "4,7"]);
    const parts = splitBlackHoleComponents(cells);
    expect(parts).toHaveLength(1);
    expect(parts[0]!.size).toBe(4);
  });
});
