import { describe, expect, it } from "vitest";
import { validateGenerationConstraints } from "./generation-constraints.ts";
import { buildBaseLevelContext } from "./level-base-edit.ts";
import {
  getForbiddenKinds,
} from "./prompts/playability-rules.ts";
import type { GenerationForm } from "./types.ts";

const fillBaseJson = JSON.stringify({
  width: 20,
  height: 20,
  name: "base",
  durationInSec: 150,
  difficulty: 1,
  itemModels: [
    { kind: 1, instanceId: 1, layer: 2, direction: 3, colorId: 6, occupiedPositions: [[0, 0], [1, 0], [2, 0]] },
  ],
});

const formK1Only: GenerationForm = {
  prefix: "t",
  width: 32,
  height: 32,
  durationInSec: 200,
  difficulty: 1,
  levelKind: 2,
  count: 1,
  allowedKinds: [1],
  keywords: "",
};

describe("generation-constraints", () => {
  it("lists forbidden kinds when only K1 selected", () => {
    expect(getForbiddenKinds([1])).toContain(2);
    expect(getForbiddenKinds([1, 2])).not.toContain(2);
  });

  it("rejects kind2 when not allowed", () => {
    const data = {
      width: 12,
      height: 12,
      itemModels: [
        {
          kind: 2,
          instanceId: 1,
          layer: 2,
          direction1: 3,
          direction2: 4,
          colorId: 1,
          occupiedPositions: [
            [0, 0],
            [1, 0],
          ],
        },
      ],
    };
    const issues = validateGenerationConstraints(data, formK1Only);
    expect(issues.some((i) => i.id === "AI-KIND")).toBe(true);
  });

  it("rejects overlapping kind1 arrows", () => {
    const data = {
      width: 12,
      height: 12,
      itemModels: [
        {
          kind: 1,
          instanceId: 1,
          layer: 2,
          direction: 3,
          colorId: 1,
          occupiedPositions: [
            [0, 0],
            [1, 0],
          ],
        },
        {
          kind: 1,
          instanceId: 2,
          layer: 2,
          direction: 3,
          colorId: 2,
          occupiedPositions: [
            [1, 0],
            [2, 0],
          ],
        },
      ],
    };
    const issues = validateGenerationConstraints(data, {
      ...formK1Only,
      width: 12,
      height: 12,
      allowedKinds: [1],
    });
    expect(issues.some((i) => i.id === "AI-OVERLAP")).toBe(true);
  });

  it("accepts dense kind1 fixture for 12x12", () => {
    const data = {
      width: 12,
      height: 12,
      itemModels: [
        { kind: 1, instanceId: 1, layer: 2, direction: 3, colorId: 6, occupiedPositions: [[0, 5], [1, 5], [2, 5]] },
        { kind: 1, instanceId: 2, layer: 2, direction: 3, colorId: 6, occupiedPositions: [[0, 7], [1, 7], [2, 7]] },
        { kind: 1, instanceId: 3, layer: 2, direction: 1, colorId: 7, occupiedPositions: [[5, 0], [5, 1], [5, 2]] },
        { kind: 1, instanceId: 4, layer: 2, direction: 1, colorId: 7, occupiedPositions: [[9, 5], [9, 6], [9, 7]] },
        { kind: 1, instanceId: 5, layer: 2, direction: 3, colorId: 3, occupiedPositions: [[3, 9], [4, 9], [5, 9]] },
        { kind: 1, instanceId: 6, layer: 2, direction: 3, colorId: 3, occupiedPositions: [[7, 3], [8, 3], [9, 3], [10, 3]] },
        { kind: 1, instanceId: 7, layer: 2, direction: 1, colorId: 6, occupiedPositions: [[2, 10], [2, 11]] },
        { kind: 1, instanceId: 8, layer: 2, direction: 1, colorId: 7, occupiedPositions: [[10, 8], [11, 8], [11, 9]] },
      ],
    };
    const form: GenerationForm = {
      prefix: "t",
      width: 12,
      height: 12,
      durationInSec: 120,
      difficulty: 1,
      levelKind: 2,
      count: 1,
      allowedKinds: [1],
      keywords: "",
    };
    const issues = validateGenerationConstraints(data, form);
    expect(issues).toEqual([]);
  });

  it("rejects fill with no progress vs base", () => {
    const base = buildBaseLevelContext(fillBaseJson);
    const issues = validateGenerationConstraints(JSON.parse(fillBaseJson), {
      ...formK1Only,
      width: 20,
      height: 20,
      fillBaseOccupiedCells: base.occupiedArrowCells,
      fillMinAddedCells: 8,
    });
    expect(issues.some((i) => i.id === "AI-FILL-PROGRESS")).toBe(true);
  });

  it("rejects too few arrows on large board", () => {
    const data = {
      width: 32,
      height: 32,
      itemModels: [
        {
          kind: 1,
          instanceId: 1,
          layer: 2,
          direction: 3,
          colorId: 1,
          occupiedPositions: [[0, 0], [1, 0], [2, 0]],
        },
      ],
    };
    const issues = validateGenerationConstraints(data, formK1Only);
    expect(issues.some((i) => i.id === "AI-COUNT")).toBe(true);
    expect(issues.some((i) => i.id === "AI-DENSITY")).toBe(true);
  });
});
