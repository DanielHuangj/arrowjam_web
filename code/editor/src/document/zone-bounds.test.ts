import { describe, expect, it } from "vitest";
import type { EditorDocument } from "@arrowjaw/shared";
import { canPlaceInEditContext, positionsWithinZone } from "./zone-bounds.ts";

const zone = {
  kind: 12 as const,
  instanceId: 100,
  layer: 1,
  occupiedPositions: [
    [2, 2],
    [3, 2],
    [2, 3],
    [3, 3],
  ] as [number, number][],
  items: [],
};

const docInZone: EditorDocument = {
  meta: { width: 10, height: 10, name: "t", durationInSec: 60, difficulty: 1 },
  itemModels: [zone],
  selectedInstanceIds: [],
  editContext: { zoneInstanceId: 100 },
  source: { name: "level-1.json", handle: null },
  dirty: false,
};

describe("zone-bounds", () => {
  it("allows any position at top level", () => {
    const doc = { ...docInZone, editContext: { zoneInstanceId: null } };
    expect(canPlaceInEditContext(doc, [[9, 9]])).toBe(true);
  });

  it("rejects cells outside zone", () => {
    expect(positionsWithinZone(zone, [[2, 2]])).toBe(true);
    expect(positionsWithinZone(zone, [[4, 2]])).toBe(false);
    expect(canPlaceInEditContext(docInZone, [[2, 2], [4, 2]])).toBe(false);
  });
});
