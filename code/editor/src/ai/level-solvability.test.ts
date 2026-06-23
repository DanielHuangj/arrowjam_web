import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { checkGreedySolvability, validateSolvability } from "./level-solvability.ts";
import { sanitizeLevelData } from "./level-sanitizer.ts";
import { validateLevelJsonString } from "./validate-level.ts";
import type { GenerationForm } from "./types.ts";
import type { LevelData } from "@arrowjaw/shared";

const form20K1: GenerationForm = {
  prefix: "hjtest",
  width: 20,
  height: 20,
  durationInSec: 150,
  difficulty: 1,
  levelKind: 2,
  count: 1,
  allowedKinds: [1],
  keywords: "",
};

function loadHjtest005(): LevelData {
  const path = "C:/Users/danielhuang/Desktop/tmp/关卡/hjtest-005.json";
  try {
    return JSON.parse(readFileSync(path, "utf8")) as LevelData;
  } catch {
    return {
      width: 20,
      height: 20,
      name: "hjtest #001",
      durationInSec: 150,
      difficulty: 1,
      levelKind: 2,
      itemModels: [
        { kind: 1, instanceId: 1, layer: 2, direction: 3, colorId: 6, occupiedPositions: [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [4, 3], [4, 4], [5, 4]] },
        { kind: 1, instanceId: 10, layer: 2, direction: 2, colorId: 7, occupiedPositions: [[13, 15], [13, 14], [13, 13], [13, 12], [13, 11], [13, 10], [13, 9], [13, 8]] },
        { kind: 1, instanceId: 13, layer: 2, direction: 2, colorId: 6, occupiedPositions: [[9, 9], [9, 10], [9, 11], [9, 12], [9, 13], [10, 13], [11, 13], [11, 12]] },
        { kind: 1, instanceId: 14, layer: 2, direction: 1, colorId: 6, occupiedPositions: [[11, 10], [11, 9], [11, 8], [10, 8], [10, 9], [10, 10], [10, 11], [10, 12]] },
        { kind: 1, instanceId: 12, layer: 2, direction: 4, colorId: 4, occupiedPositions: [[17, 5], [16, 5], [15, 5], [14, 5], [13, 5], [12, 5], [11, 5], [10, 5]] },
      ],
    };
  }
}

describe("level-solvability", () => {
  it("detects hjtest-005 as unsolvable", () => {
    const data = loadHjtest005();
    const result = checkGreedySolvability(data);
    expect(result.solvable).toBe(false);
    expect(result.stuckIds.length).toBeGreaterThan(0);
    expect(validateSolvability(data).some((i) => i.id === "AI-UNSOLVABLE")).toBe(true);
  });

  it("sanitizer attempts to fix unsolvable deadlock cluster", () => {
    const data = loadHjtest005();
    const before = checkGreedySolvability(data);
    expect(before.solvable).toBe(false);

    const sanitized = sanitizeLevelData(data, form20K1);
    const after = checkGreedySolvability(JSON.parse(sanitized.json) as LevelData);
    expect(
      after.solvable || after.stuckIds.length < before.stuckIds.length,
      sanitized.actions.join("; "),
    ).toBe(true);
  });

  it("validates fixed level passes AI-UNSOLVABLE when solvable", () => {
    const data = loadHjtest005();
    const sanitized = sanitizeLevelData(data, form20K1);
    let json = sanitized.json;
    for (let i = 0; i < 30 && !checkGreedySolvability(JSON.parse(json) as LevelData).solvable; i++) {
      const next = sanitizeLevelData(JSON.parse(json) as LevelData, form20K1);
      json = next.json;
    }
    const result = validateLevelJsonString(json, form20K1);
    if (checkGreedySolvability(JSON.parse(json) as LevelData).solvable) {
      expect(result.issues.some((i) => i.id === "AI-UNSOLVABLE")).toBe(false);
    }
  });
});
