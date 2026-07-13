import { describe, expect, it } from "vitest";
import {
  buildBoardMaskFromLevel,
  buildFullBoardPlayable,
  compressCellsToRows,
  expandMaskRows,
  isOrthogonallyConnected,
  maskRowsFromSet,
} from "./board-mask.ts";
import { parseLevelData } from "./parser.ts";
import { serializeLevelData } from "./serializer.ts";
import { createEmptyDocument } from "./editor-document.ts";
import { validateLevelData } from "./validator.ts";

describe("board-mask", () => {
  it("expand and compress round-trip", () => {
    const cells = new Set(["2,5", "3,5", "4,5", "6,6", "7,6"]);
    const rows = compressCellsToRows(cells, 10, 10);
    expect(rows).toEqual([
      [5, 2, 4],
      [6, 6, 7],
    ]);
    const back = expandMaskRows(10, 10, rows);
    expect(back).toEqual(cells);
  });

  it("full board when shape omitted", () => {
    const mask = buildBoardMaskFromLevel({ width: 3, height: 2 });
    expect(mask.boardShape).toBe("full");
    expect(mask.playableCells.size).toBe(6);
    expect(mask.blackHoleCells.size).toBe(0);
  });

  it("custom playable and black holes", () => {
    const mask = buildBoardMaskFromLevel({
      width: 10,
      height: 10,
      boardShape: "custom",
      playableMask: { rows: [[5, 2, 4], [6, 2, 4]] },
      blackHoleRegions: [{ rows: [[5, 3, 3]] }],
    });
    expect(mask.playableCells.has("3,5")).toBe(true);
    expect(mask.playableCells.has("0,0")).toBe(false);
    expect(mask.blackHoleCells.has("3,5")).toBe(true);
  });

  it("detects disconnected cells", () => {
    expect(isOrthogonallyConnected(new Set(["0,0", "1,0"]))).toBe(true);
    expect(isOrthogonallyConnected(new Set(["0,0", "2,0"]))).toBe(false);
  });

  it("maskRowsFromSet compresses", () => {
    const playable = buildFullBoardPlayable(4, 2);
    const rows = maskRowsFromSet(playable, 4, 2);
    expect(rows.rows).toEqual([
      [0, 0, 3],
      [1, 0, 3],
    ]);
  });
});

describe("board mask level round-trip", () => {
  it("serializes custom board fields", () => {
    const doc = createEmptyDocument({ width: 8, height: 8, name: "t" });
    doc.meta.boardShape = "custom";
    doc.meta.playableMask = {
      rows: [
        [3, 2, 5],
        [4, 2, 5],
        [5, 2, 5],
      ],
    };
    doc.meta.blackHoleRegions = [{ rows: [[4, 4, 4]] }];
    const json = serializeLevelData(doc);
    expect(json).toContain('"boardShape": "custom"');
    expect(json).toContain('"blackHoleRegions"');

    const level = parseLevelData(1, JSON.parse(json));
    expect(level.boardShape).toBe("custom");
    expect(level.playableCells.has("4,4")).toBe(true);
    expect(level.blackHoleCells.has("4,4")).toBe(true);
  });

  it("validator rejects item outside playable", () => {
    const issues = validateLevelData({
      width: 6,
      height: 6,
      name: "t",
      durationInSec: 60,
      difficulty: 1,
      boardShape: "custom",
      playableMask: { rows: [[3, 2, 4]] },
      itemModels: [
        {
          kind: 1,
          instanceId: 1,
          layer: 2,
          direction: 3,
          colorId: 6,
          occupiedPositions: [[0, 0], [1, 0]],
        },
      ],
    });
    expect(issues.some((i) => i.id === "V-BOARD-02")).toBe(true);
  });
});
