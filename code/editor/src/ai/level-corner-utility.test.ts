import { describe, expect, it } from "vitest";
import { parseLevelData } from "@arrowjaw/shared";
import { getArrowCornerCrossings } from "@arrowjaw/client/core/mechanics/pipe.ts";
import {
  countArrowsReflectingAtCorner,
  suggestCornerPlacementOnArrowPath,
  tryFixOneUselessCorner,
  validateCornerUtility,
} from "./level-corner-utility.ts";
import { sanitizeLevelData } from "./level-sanitizer.ts";
import type { GenerationForm } from "./types.ts";

const usefulCornerLevel = {
  width: 12,
  height: 12,
  itemModels: [
    {
      kind: 4,
      instanceId: 1,
      layer: 2,
      direction1: [1, 0],
      direction2: [0, -1],
      occupiedPositions: [[5, 6]],
    },
    {
      kind: 1,
      instanceId: 2,
      layer: 2,
      direction: 1,
      colorId: 6,
      occupiedPositions: [[5, 4], [5, 5]],
    },
    {
      kind: 1,
      instanceId: 3,
      layer: 2,
      direction: 3,
      colorId: 7,
      occupiedPositions: [[0, 5], [1, 5], [2, 5]],
    },
    {
      kind: 1,
      instanceId: 4,
      layer: 2,
      direction: 3,
      colorId: 6,
      occupiedPositions: [[0, 7], [1, 7], [2, 7]],
    },
    {
      kind: 1,
      instanceId: 5,
      layer: 2,
      direction: 1,
      colorId: 7,
      occupiedPositions: [[9, 0], [9, 1], [9, 2]],
    },
  ],
};

describe("level-corner-utility", () => {
  it("counts arrow reflecting at corner on flight path", () => {
    const level = parseLevelData(0, usefulCornerLevel);
    expect(countArrowsReflectingAtCorner(level, 1)).toBe(1);
    const arrow = level.arrows.find((a) => a.instanceId === 2)!;
    expect(
      getArrowCornerCrossings(
        arrow,
        level.arrows,
        level.corners,
        { width: level.width, height: level.height },
        level.pipes,
      ),
    ).toContain(1);
  });

  it("passes when corner has reflecting arrow", () => {
    expect(validateCornerUtility(usefulCornerLevel).some((i) => i.id === "AI-CORNER-USELESS")).toBe(
      false,
    );
  });

  it("fails when corner is not on any arrow path", () => {
    const issues = validateCornerUtility({
      ...usefulCornerLevel,
      itemModels: usefulCornerLevel.itemModels.map((item) =>
        item.kind === 4 ? { ...item, occupiedPositions: [[10, 10]] } : item,
      ),
    });
    expect(issues.some((i) => i.id === "AI-CORNER-USELESS" && i.instanceId === 1)).toBe(true);
  });

  it("suggests placement on arrow flight path", () => {
    const level = parseLevelData(0, {
      ...usefulCornerLevel,
      itemModels: usefulCornerLevel.itemModels.map((item) =>
        item.kind === 4 ? { ...item, occupiedPositions: [[10, 10]] } : item,
      ),
    });
    const suggestion = suggestCornerPlacementOnArrowPath(level, 1);
    expect(suggestion).not.toBeNull();
    expect(suggestion!.cell).toEqual([5, 6]);
  });

  it("sanitizer places useless corner onto arrow path", () => {
    const data = {
      width: 12,
      height: 12,
      itemModels: usefulCornerLevel.itemModels.map((item) =>
        item.kind === 4 ? { ...item, occupiedPositions: [[10, 10]] } : item,
      ),
    };
    const form: GenerationForm = {
      prefix: "t",
      width: 12,
      height: 12,
      durationInSec: 120,
      difficulty: 1,
      levelKind: 2,
      count: 1,
      allowedKinds: [1, 4],
      keywords: "",
    };
    const result = sanitizeLevelData(data, form);
    const parsed = JSON.parse(result.json);
    const corner = parsed.itemModels.find((i: { kind: number }) => i.kind === 4);
    const level = parseLevelData(0, parsed);
    expect(countArrowsReflectingAtCorner(level, corner.instanceId)).toBeGreaterThanOrEqual(1);
    expect(result.actions.some((a) => a.includes("AI-CORNER-USELESS"))).toBe(true);
  });

  it("tryFixOneUselessCorner moves corner onto path", () => {
    const data = {
      width: 12,
      height: 12,
      itemModels: usefulCornerLevel.itemModels.map((item) =>
        item.kind === 4 ? { ...item, occupiedPositions: [[10, 10]] } : item,
      ),
    };
    const actions: string[] = [];
    expect(tryFixOneUselessCorner(data, actions)).toBe(true);
    const level = parseLevelData(0, data);
    expect(countArrowsReflectingAtCorner(level, 1)).toBe(1);
  });
});
