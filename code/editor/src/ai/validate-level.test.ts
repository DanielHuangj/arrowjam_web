import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateLevelJsonString } from "./validate-level.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const level9001Path = path.resolve(
  __dirname,
  "../../../client/public/levels/level-9001.json",
);

describe("validateLevelJsonString", () => {
  it("passes level-9001 fixture", () => {
    const json = readFileSync(level9001Path, "utf-8");
    const result = validateLevelJsonString(json);
    expect(result.ok).toBe(true);
    expect(result.blocking).toBe(false);
    expect(result.data?.width).toBe(12);
  });

  it("fails when width is missing", () => {
    const bad = JSON.stringify({
      height: 12,
      itemModels: [],
    });
    const result = validateLevelJsonString(bad);
    expect(result.ok).toBe(false);
    expect(result.blocking).toBe(true);
  });

  it("fails on invalid json", () => {
    const result = validateLevelJsonString("{not json");
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.id).toBe("JSON");
  });

  it("passes dense kind1 fixture with generation constraints", () => {
    const json = JSON.stringify({
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
    });
    const form = {
      prefix: "t",
      width: 12,
      height: 12,
      durationInSec: 120,
      difficulty: 1 as const,
      levelKind: 2,
      count: 1,
      allowedKinds: [1],
      keywords: "",
    };
    const result = validateLevelJsonString(json, form);
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });
});
