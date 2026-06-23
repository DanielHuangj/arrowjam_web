import { describe, expect, it } from "vitest";
import { countArrowsTraversingPipe, validatePipeUtility } from "./level-pipe-utility.ts";
import { parseLevelData } from "@arrowjaw/shared";

const usefulPipeLevel = {
  width: 12,
  height: 12,
  itemModels: [
    {
      kind: 3,
      instanceId: 1,
      layer: 2,
      health: 2,
      healthViewPathIndex: 2,
      occupiedPositions: [[5, 6], [6, 6], [7, 6], [7, 7], [7, 8]],
      passes: [
        { position: [5, 6], directions: [[-1, 0], [1, 0]] },
        { position: [7, 8], directions: [[0, 1], [0, -1]] },
      ],
    },
    {
      kind: 1,
      instanceId: 2,
      layer: 2,
      direction: 3,
      colorId: 6,
      occupiedPositions: [[3, 6], [4, 6]],
    },
    {
      kind: 1,
      instanceId: 3,
      layer: 2,
      direction: 2,
      colorId: 7,
      occupiedPositions: [[7, 9], [7, 10]],
    },
    {
      kind: 1,
      instanceId: 4,
      layer: 2,
      direction: 3,
      colorId: 6,
      occupiedPositions: [[0, 5], [1, 5], [2, 5]],
    },
    {
      kind: 1,
      instanceId: 5,
      layer: 2,
      direction: 3,
      colorId: 6,
      occupiedPositions: [[0, 7], [1, 7], [2, 7]],
    },
    {
      kind: 1,
      instanceId: 6,
      layer: 2,
      direction: 1,
      colorId: 7,
      occupiedPositions: [[9, 0], [9, 1], [9, 2]],
    },
  ],
};

describe("level-pipe-utility", () => {
  it("counts arrows that traverse through L-shaped pipe", () => {
    const level = parseLevelData(0, usefulPipeLevel);
    expect(countArrowsTraversingPipe(level, 1)).toBe(2);
  });

  it("passes when traversable arrows >= pipe health", () => {
    const issues = validatePipeUtility(usefulPipeLevel);
    expect(issues.some((i) => i.id === "AI-PIPE-USELESS")).toBe(false);
  });

  it("fails when pipe health exceeds traversable arrow count", () => {
    const issues = validatePipeUtility({
      ...usefulPipeLevel,
      itemModels: usefulPipeLevel.itemModels.map((item) =>
        item.kind === 3 ? { ...item, health: 5 } : item,
      ),
    });
    expect(issues.some((i) => i.id === "AI-PIPE-USELESS" && i.instanceId === 1)).toBe(
      true,
    );
  });

  it("does not count arrows that only pass beside pipe", () => {
    const level = parseLevelData(0, {
      width: 25,
      height: 25,
      itemModels: [
        {
          kind: 3,
          instanceId: 1,
          layer: 2,
          health: 1,
          healthViewPathIndex: 1,
          occupiedPositions: [[12, 8], [13, 8], [14, 8], [15, 8], [16, 8], [17, 8], [18, 8], [19, 8]],
          passes: [
            { position: [12, 8], directions: [[-1, 0], [1, 0]] },
            { position: [19, 8], directions: [[-1, 0], [1, 0]] },
          ],
        },
        {
          kind: 1,
          instanceId: 2,
          layer: 2,
          direction: 3,
          colorId: 6,
          occupiedPositions: [[10, 7], [11, 7]],
        },
      ],
    });
    expect(countArrowsTraversingPipe(level, 1)).toBe(0);
  });
});
