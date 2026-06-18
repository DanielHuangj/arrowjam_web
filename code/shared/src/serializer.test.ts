import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseLevelData } from "./parser.ts";
import { serializeLevelDataObject } from "./serializer.ts";
import type { EditorDocument, LevelData } from "./types.ts";

const levelsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../client/public/levels",
);

function loadLevel(id: number): LevelData {
  const raw = readFileSync(join(levelsDir, `level-${id}.json`), "utf-8");
  return JSON.parse(raw) as LevelData;
}

function docFromLevel(data: LevelData): Pick<EditorDocument, "meta" | "itemModels"> {
  return {
    meta: {
      width: data.width,
      height: data.height,
      name: data.name,
      durationInSec: data.durationInSec,
      difficulty: data.difficulty,
      levelKind: data.levelKind,
    },
    itemModels: data.itemModels.map((item) => structuredClone(item)),
  };
}

function roundTrip(id: number) {
  const original = loadLevel(id);
  const doc = docFromLevel(original);
  const serialized = serializeLevelDataObject(doc);
  const reparsed = parseLevelData(id, serialized);
  return { original, serialized, reparsed };
}

describe("serializeLevelData round-trip", () => {
  for (const id of [9001, 9002, 9003, 9004, 9005]) {
    it(`preserves mechanics fields for level ${id}`, () => {
      const { original, serialized, reparsed } = roundTrip(id);

      expect(serialized.itemModels.length).toBe(original.itemModels.length);

      const origFlip = original.itemModels.filter((i) => i.kind === 2);
      const rtFlip = reparsed.arrows.filter((a) => a.kind === 2);
      expect(rtFlip.length).toBe(origFlip.length);
      for (const o of origFlip) {
        const r = rtFlip.find((a) => a.instanceId === o.instanceId);
        expect(r?.direction1).toBe(o.direction1);
        expect(r?.direction2).toBe(o.direction2);
      }

      expect(reparsed.bombs.length).toBe(
        original.itemModels.filter((i) => i.kind === 5).length,
      );
      for (const b of reparsed.bombs) {
        const o = original.itemModels.find((i) => i.instanceId === b.instanceId);
        expect(b.time).toBe(o?.time);
      }

      expect(reparsed.movingWalls.length).toBe(
        original.itemModels.filter((i) => i.kind === 7).length,
      );
      for (const w of reparsed.movingWalls) {
        const o = original.itemModels.find((i) => i.instanceId === w.instanceId);
        expect(w.movingDistance).toBe(o?.movingDistance);
        expect(w.movingType).toBe(o?.movingType);
        expect(w.movingPath).toEqual(o?.movingPath);
      }

      expect(reparsed.frozenOverlays.length).toBe(
        original.itemModels.filter((i) => i.kind === 13).length,
      );
      for (const f of reparsed.frozenOverlays) {
        const o = original.itemModels.find((i) => i.instanceId === f.instanceId);
        expect(f.health).toBe(o?.health);
      }
    });
  }
});
