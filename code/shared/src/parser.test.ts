import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLevelData } from "./parser.ts";
import { validateLevelData, hasBlockingErrors } from "./validator.ts";
import { serializeLevelData } from "./serializer.ts";
import { createDocumentFromJson } from "./editor-document.ts";
import type { LevelData } from "./types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const levelsDir = join(__dirname, "../../client/public/levels");

function loadJsonLevel(id: number): LevelData {
  const raw = readFileSync(join(levelsDir, `level-${id}.json`), "utf-8");
  return JSON.parse(raw) as LevelData;
}

describe("shared parser", () => {
  it("parses level 30 with zones and bundles", () => {
    const level = parseLevelData(30, loadJsonLevel(30));
    expect(level.zones.length).toBeGreaterThan(0);
    expect(level.bundles.length).toBeGreaterThan(0);
  });

  it("rejects moving wall without path in strict mode", () => {
    const data: LevelData = {
      width: 10,
      height: 10,
      name: "t",
      durationInSec: 60,
      difficulty: 1,
      itemModels: [
        {
          kind: 7,
          instanceId: 8,
          layer: 2,
          occupiedPositions: [[3, 1]],
          movingPath: [[3, 1]],
          movingDistance: 1,
          movingType: 1,
        },
      ],
    };
    expect(() => parseLevelData(1, data)).toThrow(/missing movingPath/);
  });

  it("allows incomplete moving wall path in editor mode", () => {
    const data: LevelData = {
      width: 10,
      height: 10,
      name: "t",
      durationInSec: 60,
      difficulty: 1,
      itemModels: [
        {
          kind: 7,
          instanceId: 8,
          layer: 2,
          occupiedPositions: [[3, 1]],
          movingPath: [[3, 1]],
          movingDistance: 1,
          movingType: 1,
        },
      ],
    };
    const level = parseLevelData(1, data, { allowIncompleteMovingWalls: true });
    expect(level.movingWalls).toHaveLength(1);
    expect(level.movingWalls[0]!.movingPath).toEqual([[3, 1]]);
  });
});

describe("shared validator", () => {
  it("level 30 has no blocking errors", () => {
    const issues = validateLevelData(loadJsonLevel(30));
    expect(hasBlockingErrors(issues)).toBe(false);
  });
});

describe("shared serializer roundtrip", () => {
  it("level 25 roundtrips", () => {
    const data = loadJsonLevel(25);
    const { doc } = createDocumentFromJson("level-25.json", data);
    const json = serializeLevelData(doc);
    const reparsed = parseLevelData(25, JSON.parse(json));
    expect(reparsed.arrows.length).toBe(parseLevelData(25, data).arrows.length);
    expect(reparsed.corners.length).toBe(parseLevelData(25, data).corners.length);
  });
});
