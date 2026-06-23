import { describe, expect, it } from "vitest";
import {
  buildBaseLevelContext,
  extractNewItemsFromGenerated,
  mergeBaseWithGeneratedLevel,
  mergeFillResponse,
  parseFillNewItems,
  countNewItemsMerged,
  validateBaseLevelForForm,
} from "./level-base-edit.ts";
import { assertLoadableLevelData } from "@arrowjaw/shared";
import type { GenerationForm } from "./types.ts";

const form20: GenerationForm = {
  prefix: "fill",
  width: 20,
  height: 20,
  durationInSec: 150,
  difficulty: 1,
  levelKind: 2,
  count: 1,
  allowedKinds: [1],
  keywords: "",
};

const baseJson = JSON.stringify({
  width: 20,
  height: 20,
  name: "base",
  durationInSec: 150,
  difficulty: 1,
  itemModels: [
    { kind: 1, instanceId: 1, layer: 2, direction: 3, colorId: 6, occupiedPositions: [[0, 0], [1, 0], [2, 0]] },
    { kind: 1, instanceId: 2, layer: 2, direction: 1, colorId: 7, occupiedPositions: [[0, 2], [0, 3], [0, 4]] },
  ],
});

describe("level-base-edit", () => {
  it("builds frozen cells from base arrows", () => {
    const base = buildBaseLevelContext(baseJson);
    expect(base.frozenArrowIds.size).toBe(2);
    expect(base.frozenArrowCells.size).toBe(6);
    expect(base.emptyCells).toBe(400 - 6);
  });

  it("merges generated level preserving base items", () => {
    const base = buildBaseLevelContext(baseJson);
    const generated = assertLoadableLevelData({
      width: 20,
      height: 20,
      name: "out",
      durationInSec: 150,
      difficulty: 1,
      itemModels: [
        ...JSON.parse(baseJson).itemModels,
        { kind: 1, instanceId: 99, layer: 2, direction: 3, colorId: 3, occupiedPositions: [[5, 5], [6, 5], [7, 5]] },
      ],
    });
    const merged = mergeBaseWithGeneratedLevel(base, generated, form20);
    expect(merged.itemModels.length).toBe(3);
    expect(merged.itemModels[0]!.instanceId).toBe(1);
    expect(merged.itemModels.find((i) => i.occupiedPositions.some(([x]) => x === 5))).toBeTruthy();
  });

  it("skips new arrows overlapping base cells", () => {
    const base = buildBaseLevelContext(baseJson);
    const generated = assertLoadableLevelData({
      width: 20,
      height: 20,
      name: "bad",
      durationInSec: 150,
      difficulty: 1,
      itemModels: [
        { kind: 1, instanceId: 99, layer: 2, direction: 3, colorId: 3, occupiedPositions: [[1, 0], [2, 0], [3, 0]] },
      ],
    });
    const newItems = extractNewItemsFromGenerated(base, generated);
    expect(newItems).toHaveLength(0);
  });

  it("validates board size match", () => {
    const base = buildBaseLevelContext(baseJson);
    const err = validateBaseLevelForForm(base, { ...form20, width: 12, height: 12 });
    expect(err).toContain("不一致");
  });

  it("stabilizeFillLevel recovers new arrows after fix reverted to base only", () => {
    const base = buildBaseLevelContext(baseJson);
    const withNew = {
      new_itemModels: [
        { kind: 1, instanceId: 99, layer: 2, direction: 3, colorId: 3, occupiedPositions: [[5, 5], [6, 5], [7, 5]] },
      ],
    };
    const stabilized = mergeFillResponse(base, withNew, form20);
    expect(countNewItemsMerged(base, stabilized)).toBe(1);
    const reverted = mergeFillResponse(base, { new_itemModels: [] }, form20);
    expect(countNewItemsMerged(base, reverted)).toBe(0);
  });

  it("parseFillNewItems accepts delta and full level", () => {
    const base = buildBaseLevelContext(baseJson);
    const delta = parseFillNewItems({ new_itemModels: [{ kind: 1, instanceId: 3, layer: 2, direction: 3, colorId: 1, occupiedPositions: [[5, 5]] }] });
    expect(delta).toHaveLength(1);
    const full = parseFillNewItems(JSON.parse(baseJson), base);
    expect(full).toHaveLength(0);
  });
});
