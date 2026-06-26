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

describe("shared parser zone mechanics", () => {
  it("binds zone bomb to zone arrow when top-level arrow shares the cell", () => {
    const data: LevelData = {
      width: 12,
      height: 12,
      name: "zone bomb overlap",
      durationInSec: 60,
      difficulty: 1,
      itemModels: [
        {
          kind: 1,
          instanceId: 1,
          layer: 2,
          direction: 3,
          colorId: 1,
          occupiedPositions: [
            [2, 2],
            [3, 2],
          ],
        },
        {
          kind: 12,
          instanceId: 10,
          layer: 1,
          occupiedPositions: [
            [2, 2],
            [3, 2],
          ],
          items: [
            {
              kind: 1,
              instanceId: 2,
              layer: 2,
              direction: 3,
              colorId: 2,
              occupiedPositions: [
                [2, 2],
                [3, 2],
              ],
            },
            {
              kind: 5,
              instanceId: 3,
              layer: 3,
              time: 10,
              occupiedPositions: [[3, 2]],
            },
          ],
        },
      ],
    };
    const level = parseLevelData(1, data);
    const bomb = level.bombs.find((b) => b.instanceId === 3)!;
    expect(bomb.zoneId).toBe(10);
    expect(bomb.hostArrowId).toBe(2);
  });

  it("binds top-level bomb to overlay arrow when zone arrow shares the cell", () => {
    const data: LevelData = {
      width: 12,
      height: 12,
      name: "top bomb overlap",
      durationInSec: 60,
      difficulty: 1,
      itemModels: [
        {
          kind: 12,
          instanceId: 10,
          layer: 1,
          occupiedPositions: [
            [2, 2],
            [3, 2],
          ],
          items: [
            {
              kind: 1,
              instanceId: 2,
              layer: 2,
              direction: 3,
              colorId: 2,
              occupiedPositions: [
                [2, 2],
                [3, 2],
              ],
            },
          ],
        },
        {
          kind: 1,
          instanceId: 1,
          layer: 2,
          direction: 3,
          colorId: 1,
          occupiedPositions: [
            [2, 2],
            [3, 2],
          ],
        },
        {
          kind: 5,
          instanceId: 3,
          layer: 3,
          time: 10,
          occupiedPositions: [[3, 2]],
        },
      ],
    };
    const level = parseLevelData(1, data);
    const bomb = level.bombs.find((b) => b.instanceId === 3)!;
    expect(bomb.zoneId).toBeNull();
    expect(bomb.hostArrowId).toBe(1);
  });
});

describe("shared validator", () => {
  it("allows bombs on same cell in top level and zone scope", () => {
    const data: LevelData = {
      width: 12,
      height: 12,
      name: "scoped bombs",
      durationInSec: 60,
      difficulty: 1,
      itemModels: [
        {
          kind: 12,
          instanceId: 10,
          layer: 1,
          occupiedPositions: [
            [2, 2],
            [3, 2],
          ],
          items: [
            {
              kind: 1,
              instanceId: 2,
              layer: 2,
              direction: 3,
              colorId: 2,
              occupiedPositions: [
                [2, 2],
                [3, 2],
              ],
            },
            {
              kind: 5,
              instanceId: 3,
              layer: 3,
              time: 10,
              occupiedPositions: [[3, 2]],
            },
          ],
        },
        {
          kind: 1,
          instanceId: 1,
          layer: 2,
          direction: 3,
          colorId: 1,
          occupiedPositions: [
            [2, 2],
            [3, 2],
          ],
        },
        {
          kind: 5,
          instanceId: 4,
          layer: 3,
          time: 10,
          occupiedPositions: [[3, 2]],
        },
      ],
    };
    const issues = validateLevelData(data);
    expect(issues.filter((i) => i.id === "V-EDIT-01")).toEqual([]);
    expect(hasBlockingErrors(issues)).toBe(false);
  });

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
