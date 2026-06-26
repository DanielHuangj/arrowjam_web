import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { denseKind1LevelJson } from "./fixtures/dense-kind1-12x12.ts";
import { validateLevelJsonString } from "./validate-level.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const level9001Path = path.resolve(
  __dirname,
  "../../../client/test-fixtures/levels/level-9001.json",
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
    const result = validateLevelJsonString(denseKind1LevelJson, form);
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  });

  it("reports V07 instead of LOAD for malformed pipe passes", () => {
    const json = JSON.stringify({
      width: 12,
      height: 12,
      itemModels: [
        {
          kind: 3,
          instanceId: 1,
          layer: 2,
          health: 2,
          healthViewPathIndex: 0,
          occupiedPositions: [[5, 5], [6, 5]],
          passes: [[5, 5], [6, 5]],
        },
      ],
    });
    const result = validateLevelJsonString(json);
    expect(result.issues.some((i) => i.id === "LOAD")).toBe(false);
    expect(result.issues.some((i) => i.id === "V07" || i.id === "V08")).toBe(true);
  });
});
