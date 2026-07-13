import { describe, expect, it } from "vitest";
import type { EditorDocument, GameLevel } from "@arrowjaw/shared";
import { collectMechanicsDrawOptions } from "./editor-board.ts";

const baseDoc: EditorDocument = {
  meta: { width: 10, height: 10, name: "t", durationInSec: 120, difficulty: 1 },
  itemModels: [],
  editContext: { zoneInstanceId: null, regionEditMode: null },
  source: { name: "level-1.json", handle: null },
};

const levelWithZoneBomb: GameLevel = {
  id: 1,
  width: 10,
  height: 10,
  name: "t",
  durationInSec: 120,
  difficulty: 1,
  arrows: [
    {
      kind: 1,
      instanceId: 2,
      layer: 2,
      zoneId: 100,
      direction: 3,
      colorId: 1,
      occupiedPositions: [[2, 2], [3, 2], [4, 2]],
    },
    {
      kind: 1,
      instanceId: 3,
      layer: 2,
      zoneId: null,
      direction: 3,
      colorId: 1,
      occupiedPositions: [[0, 0]],
    },
  ],
  corners: [],
  bundles: [],
  pipes: [],
  zones: [],
  keys: [],
  curtains: [],
  movingWalls: [],
  bombs: [
    {
      kind: 5,
      instanceId: 5,
      layer: 3,
      time: 10,
      zoneId: 100,
      hostArrowId: 2,
      occupiedPositions: [[3, 2]],
    },
    {
      kind: 5,
      instanceId: 6,
      layer: 3,
      time: 10,
      zoneId: null,
      hostArrowId: 3,
      occupiedPositions: [[0, 0]],
    },
  ],
  frozenOverlays: [],
};

describe("collectMechanicsDrawOptions", () => {
  it("shows top-level bombs only at root edit", () => {
    const opts = collectMechanicsDrawOptions(baseDoc, levelWithZoneBomb);
    expect(opts.bombStates.map((b) => b.bomb.instanceId)).toEqual([6]);
  });

  it("shows zone bombs while editing that zone", () => {
    const doc = { ...baseDoc, editContext: { zoneInstanceId: 100, regionEditMode: null } };
    const opts = collectMechanicsDrawOptions(doc, levelWithZoneBomb);
    expect(opts.bombStates.map((b) => b.bomb.instanceId)).toEqual([5]);
  });
});
