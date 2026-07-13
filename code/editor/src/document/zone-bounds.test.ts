import { describe, expect, it } from "vitest";
import type { EditorDocument } from "@arrowjaw/shared";
import {
  canPlaceArrowInEditContext,
  canPlaceInEditContext,
  getArrowPlacementBlockReason,
  positionsWithinZone,
} from "./zone-bounds.ts";

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
  editContext: { zoneInstanceId: 100, regionEditMode: null },
  source: { name: "level-1.json", handle: null },
  dirty: false,
};

const arrow1 = {
  kind: 1 as const,
  instanceId: 1,
  layer: 1,
  occupiedPositions: [
    [0, 0],
    [1, 0],
  ] as [number, number][],
  direction: 2,
  colorId: 1,
};

describe("zone-bounds", () => {
  it("allows any position at top level", () => {
    const doc = { ...docInZone, editContext: { zoneInstanceId: null, regionEditMode: null } };
    expect(canPlaceInEditContext(doc, [[9, 9]])).toBe(true);
  });

  it("rejects cells outside zone", () => {
    expect(positionsWithinZone(zone, [[2, 2]])).toBe(true);
    expect(positionsWithinZone(zone, [[4, 2]])).toBe(false);
    expect(canPlaceInEditContext(docInZone, [[2, 2], [4, 2]])).toBe(false);
  });

  it("rejects arrow path overlapping existing arrow", () => {
    const doc: EditorDocument = {
      ...docInZone,
      editContext: { zoneInstanceId: null, regionEditMode: null },
      itemModels: [arrow1],
    };
    expect(canPlaceArrowInEditContext(doc, [[1, 0], [2, 0]])).toBe(false);
    expect(getArrowPlacementBlockReason(doc, [[1, 0], [2, 0]])).toBe("overlap");
    expect(canPlaceArrowInEditContext(doc, [[2, 0], [3, 0]])).toBe(true);
  });

  it("allows dragging arrow when excluding its own instance", () => {
    const doc: EditorDocument = {
      ...docInZone,
      editContext: { zoneInstanceId: null, regionEditMode: null },
      itemModels: [arrow1],
    };
    expect(
      canPlaceArrowInEditContext(
        doc,
        [
          [1, 0],
          [2, 0],
        ],
        1,
      ),
    ).toBe(true);
  });

  it("rejects self-intersecting arrow path", () => {
    const doc: EditorDocument = {
      ...docInZone,
      editContext: { zoneInstanceId: null, regionEditMode: null },
      itemModels: [],
    };
    expect(
      getArrowPlacementBlockReason(doc, [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ]),
    ).toBe("self");
  });

  it("allows zone-inner arrow to share coords with top-level arrow", () => {
    const innerZone = {
      ...zone,
      occupiedPositions: [
        [0, 0],
        [1, 0],
      ] as [number, number][],
      items: [
        {
          kind: 1 as const,
          instanceId: 2,
          layer: 2,
          occupiedPositions: [[1, 0]] as [number, number][],
          direction: 2,
          colorId: 1,
        },
      ],
    };
    const doc: EditorDocument = {
      ...docInZone,
      editContext: { zoneInstanceId: null, regionEditMode: null },
      itemModels: [arrow1, innerZone],
    };
    expect(canPlaceArrowInEditContext(doc, [[1, 0], [2, 0]])).toBe(false);
    const zoneDoc: EditorDocument = {
      ...doc,
      editContext: { zoneInstanceId: 100, regionEditMode: null },
    };
    expect(canPlaceArrowInEditContext(zoneDoc, [[0, 0], [1, 0]], 2)).toBe(true);
  });
});
