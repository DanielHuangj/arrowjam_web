import { describe, expect, it } from "vitest";
import { sanitizeLevelJson, sanitizeLevelData } from "./level-sanitizer.ts";
import { validateLevelJsonString } from "./validate-level.ts";
import type { GenerationForm } from "./types.ts";
import type { LevelData } from "@arrowjaw/shared";

const form20K1: GenerationForm = {
  prefix: "hjtest",
  width: 20,
  height: 20,
  durationInSec: 120,
  difficulty: 1,
  levelKind: 2,
  count: 1,
  allowedKinds: [1],
  keywords: "",
};

/** 模拟 hjtest log：77 格、2 处 overlap（(10,8) #2/#3、(15,5) #8/#9） */
function buildLogFailureFixture(): LevelData {
  return {
    width: 20,
    height: 20,
    name: "hjtest #004",
    durationInSec: 120,
    difficulty: 1,
    itemModels: [
      { kind: 1, instanceId: 1, layer: 2, direction: 3, colorId: 6, occupiedPositions: [[0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5], [11, 5], [12, 5], [13, 5]] },
      { kind: 1, instanceId: 2, layer: 2, direction: 1, colorId: 6, occupiedPositions: [[10, 6], [10, 7], [10, 8]] },
      { kind: 1, instanceId: 3, layer: 2, direction: 3, colorId: 7, occupiedPositions: [[10, 8], [11, 8], [12, 8], [13, 8], [14, 8]] },
      { kind: 1, instanceId: 4, layer: 2, direction: 1, colorId: 7, occupiedPositions: [[5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [6, 4], [7, 4]] },
      { kind: 1, instanceId: 5, layer: 2, direction: 3, colorId: 3, occupiedPositions: [[0, 10], [1, 10], [2, 10], [3, 10], [4, 10], [5, 10], [6, 10], [7, 10]] },
      { kind: 1, instanceId: 6, layer: 2, direction: 2, colorId: 3, occupiedPositions: [[18, 10], [18, 9], [18, 8], [18, 7], [18, 6], [18, 5]] },
      { kind: 1, instanceId: 7, layer: 2, direction: 4, colorId: 6, occupiedPositions: [[15, 0], [14, 0], [13, 0], [12, 0], [11, 0], [10, 0], [9, 0]] },
      { kind: 1, instanceId: 8, layer: 2, direction: 3, colorId: 7, occupiedPositions: [[15, 3], [15, 4], [15, 5]] },
      { kind: 1, instanceId: 9, layer: 2, direction: 1, colorId: 6, occupiedPositions: [[15, 5], [15, 6], [15, 7], [15, 8], [15, 9], [15, 10]] },
      { kind: 1, instanceId: 10, layer: 2, direction: 2, colorId: 3, occupiedPositions: [[8, 15], [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9]] },
      { kind: 1, instanceId: 11, layer: 2, direction: 3, colorId: 6, occupiedPositions: [[12, 12], [13, 12], [14, 12], [15, 12], [16, 12], [17, 12], [18, 12]] },
      { kind: 1, instanceId: 12, layer: 2, direction: 1, colorId: 7, occupiedPositions: [[19, 0], [19, 1], [19, 2], [19, 3], [19, 4], [19, 5]] },
    ],
  };
}

function countBodyCells(data: LevelData): number {
  const cells = new Set<string>();
  for (const item of data.itemModels) {
    if (item.kind === 1 || item.kind === 2) {
      for (const p of item.occupiedPositions) {
        cells.add(`${p[0]},${p[1]}`);
      }
    }
  }
  return cells.size;
}

describe("level-sanitizer", () => {
  it("fixture matches log failure pattern before sanitize", () => {
    const data = buildLogFailureFixture();
    expect(countBodyCells(data)).toBe(77);
    const before = validateLevelJsonString(JSON.stringify(data), form20K1);
    expect(before.ok).toBe(false);
    expect(before.issues.some((i) => i.id === "AI-DENSITY")).toBe(true);
    expect(before.issues.filter((i) => i.id === "AI-OVERLAP").length).toBeGreaterThanOrEqual(2);
  });

  it("fixes overlap, density, and V11 for log-like fixture", () => {
    const data = buildLogFailureFixture();
    data.itemModels[0]!.direction = 1;

    const result = sanitizeLevelData(data, form20K1);
    expect(result.changed).toBe(true);
    expect(result.actions.some((a) => a.includes("AI-OVERLAP"))).toBe(true);
    expect(result.actions.some((a) => a.includes("AI-DENSITY"))).toBe(true);
    expect(result.actions.some((a) => a.includes("V11"))).toBe(true);

    const validated = validateLevelJsonString(result.json, form20K1);
    expect(validated.ok, JSON.stringify(validated.issues)).toBe(true);
  });

  it("sanitizeLevelJson removes disallowed kind", () => {
    const json = JSON.stringify({
      width: 12,
      height: 12,
      name: "t",
      durationInSec: 120,
      difficulty: 1,
      itemModels: [
        { kind: 2, instanceId: 1, layer: 2, direction1: 3, direction2: 4, colorId: 1, occupiedPositions: [[0, 0], [1, 0]] },
        { kind: 1, instanceId: 2, layer: 2, direction: 3, colorId: 6, occupiedPositions: [[0, 5], [1, 5], [2, 5]] },
      ],
    });
    const form: GenerationForm = { ...form20K1, width: 12, height: 12 };
    const result = sanitizeLevelJson(json, form);
    expect(result.actions.some((a) => a.includes("AI-KIND"))).toBe(true);
    const parsed = JSON.parse(result.json);
    expect(parsed.itemModels.every((i: { kind: number }) => i.kind === 1)).toBe(true);
  });

  it("20x20 K1 smoke: sanitizer rescues sparse overlapping levels repeatedly", () => {
    let passCount = 0;
    for (let n = 0; n < 10; n++) {
      const data = buildLogFailureFixture();
      data.itemModels.forEach((item, idx) => {
        if (idx % 3 === 0) item.direction = 1;
      });
      const result = sanitizeLevelData(data, form20K1);
      if (validateLevelJsonString(result.json, form20K1).ok) passCount++;
    }
    expect(passCount).toBeGreaterThanOrEqual(6);
  });
});
