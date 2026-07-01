import { describe, expect, it } from "vitest";
import { parseLevelData } from "./parser.ts";
import { CellMap, snakeStepArrow } from "../board/cell-map.ts";
import { simulateCanExit } from "../board/path-check.ts";
import { GameState } from "../game/game-state.ts";
import type { ArrowItem, LevelData } from "../types.ts";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ZoneManager, buildZoneItem } from "../mechanics/zone.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const levelsDir = join(__dirname, "../../../public/levels");
const fixtureLevelsDir = join(__dirname, "../../../test-fixtures/levels");

function loadJsonLevel(id: number): LevelData {
  const dir = id >= 9024 && id <= 9026 ? fixtureLevelsDir : levelsDir;
  const raw = readFileSync(join(dir, `level-${id}.json`), "utf-8");
  return JSON.parse(raw) as LevelData;
}

function emptyLevel(arrows: ArrowItem[]) {
  return {
    id: 0,
    width: 5,
    height: 5,
    name: "test",
    durationInSec: 60,
    difficulty: 1,
    arrows,
    corners: [],
    zones: [],
    bundles: [],
    pipes: [],
    curtains: [],
    keys: [],
    bombs: [],
    movingWalls: [],
    frozenOverlays: [],
    shrinkPipes: [],
    toggles: [],
    controllers: [],
  };
}

describe("parseLevelData", () => {
  it("parses level 29 with 120 arrows", () => {
    const level = parseLevelData(29, loadJsonLevel(29));
    expect(level.width).toBe(27);
    expect(level.height).toBe(36);
    expect(level.arrows.length).toBe(120);
    expect(level.corners).toEqual([]);
  });

  it("parses level 25 with corners", () => {
    const level = parseLevelData(25, loadJsonLevel(25));
    expect(level.corners.length).toBe(6);
    expect(level.zones).toEqual([]);
  });

  it("parses level 26 with kind12 zone", () => {
    const level = parseLevelData(26, loadJsonLevel(26));
    expect(level.zones.length).toBe(1);
    expect(level.arrows.some((a) => a.zoneId === 1)).toBe(true);
    expect(level.arrows.some((a) => a.zoneId === null)).toBe(true);
  });

  it("parses level 64", () => {
    const level = parseLevelData(64, loadJsonLevel(64));
    expect(level.arrows.length).toBe(87);
  });

  it("parses level 33 with kind8 bundles", () => {
    const level = parseLevelData(33, loadJsonLevel(33));
    expect(level.bundles.length).toBe(2);
  });

  it("parses level 36 with six kind8 strips", () => {
    const level = parseLevelData(36, loadJsonLevel(36));
    expect(level.bundles.length).toBe(6);
  });

  it("parses level 41 with kind3 pipes", () => {
    const level = parseLevelData(41, loadJsonLevel(41));
    expect(level.pipes.length).toBe(3);
    expect(level.pipes[0]!.passes.length).toBe(2);
  });

  it("parses P5 mechanic kinds", () => {
    const level = parseLevelData(9001, {
      width: 12,
      height: 12,
      name: "t",
      durationInSec: 60,
      difficulty: 1,
      itemModels: [
        {
          kind: 1,
          instanceId: 1,
          layer: 2,
          direction: 3,
          colorId: 6,
          occupiedPositions: [[0, 0], [1, 0]],
        },
        {
          kind: 2,
          instanceId: 2,
          layer: 2,
          direction1: 3,
          direction2: 4,
          colorId: 7,
          occupiedPositions: [[3, 0], [4, 0]],
        },
        {
          kind: 7,
          instanceId: 7,
          layer: 2,
          occupiedPositions: [[6, 0]],
          movingPath: [[6, 0], [6, 1], [6, 2]],
          movingDistance: 1,
          movingType: 1,
        },
        {
          kind: 1,
          instanceId: 10,
          layer: 2,
          direction: 1,
          colorId: 3,
          occupiedPositions: [[8, 0], [8, 1]],
        },
        {
          kind: 5,
          instanceId: 5,
          layer: 3,
          time: 10,
          occupiedPositions: [[8, 1]],
        },
        {
          kind: 13,
          instanceId: 13,
          layer: 8,
          health: 2,
          occupiedPositions: [[8, 0], [8, 1]],
        },
      ],
    });
    expect(level.arrows.some((a) => a.kind === 2)).toBe(true);
    expect(level.movingWalls.length).toBe(1);
    expect(level.bombs[0]!.hostArrowId).toBe(10);
    expect(level.frozenOverlays[0]!.hostArrowId).toBe(10);
  });
});

describe("snakeStepArrow", () => {
  it("moves straight arrow like a snake", () => {
    const arrow: ArrowItem = {
      kind: 1,
      instanceId: 1,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[3, 0], [3, 1], [3, 2]],
      direction: 1,
      colorId: 3,
    };
    const stepped = snakeStepArrow(arrow);
    expect(stepped.occupiedPositions).toEqual([[3, 1], [3, 2], [3, 3]]);
  });
});

describe("simulateCanExit", () => {
  it("allows arrow facing empty path to edge", () => {
    const arrow: ArrowItem = {
      kind: 1,
      instanceId: 1,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[2, 2], [2, 1]],
      direction: 2,
      colorId: 3,
    };
    expect(simulateCanExit(arrow, [arrow], [], { width: 5, height: 5 })).toBe(
      true,
    );
  });

  it("blocks when another arrow is ahead", () => {
    const a: ArrowItem = {
      kind: 1,
      instanceId: 1,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[2, 3], [2, 2]],
      direction: 2,
      colorId: 3,
    };
    const b: ArrowItem = {
      kind: 1,
      instanceId: 2,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[2, 1], [2, 0]],
      direction: 1,
      colorId: 6,
    };
    expect(simulateCanExit(a, [a, b], [], { width: 5, height: 5 })).toBe(false);
  });
});

describe("ZoneManager", () => {
  const zone = buildZoneItem({
    instanceId: 1,
    occupiedPositions: [
      [2, 2],
      [3, 2],
    ],
    items: [{ kind: 1, instanceId: 2 }],
  });

  it("hides zone content while overlay occupies zone cells", () => {
    const zm = new ZoneManager([zone]);
    const inner: ArrowItem = {
      kind: 1,
      instanceId: 2,
      layer: 2,
      zoneId: 1,
      occupiedPositions: [[2, 2]],
      direction: 2,
      colorId: 6,
    };
    const onZone: ArrowItem = {
      kind: 1,
      instanceId: 1,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[2, 2], [1, 2]],
      direction: 3,
      colorId: 3,
    };
    const offZone: ArrowItem = {
      kind: 1,
      instanceId: 3,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[0, 0]],
      direction: 3,
      colorId: 3,
    };

    expect(zm.isArrowActive(onZone, [inner, onZone, offZone], [])).toBe(true);
    expect(zm.isArrowActive(inner, [inner, onZone, offZone], [])).toBe(false);
    expect(zm.isZoneContentRevealed(1, [inner, onZone, offZone], [])).toBe(
      false,
    );
    expect(zm.isZoneContentRevealed(1, [inner, offZone], [])).toBe(true);
    expect(zm.isArrowActive(inner, [inner, offZone], [])).toBe(true);
  });

  it("waits until overlay arrow is removed before revealing zone", () => {
    const zm = new ZoneManager([zone]);
    const inner: ArrowItem = {
      kind: 1,
      instanceId: 2,
      layer: 2,
      zoneId: 1,
      occupiedPositions: [[2, 2]],
      direction: 2,
      colorId: 6,
    };
    const onZone: ArrowItem = {
      kind: 1,
      instanceId: 1,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[2, 2], [1, 2]],
      direction: 3,
      colorId: 3,
    };

    expect(zm.isZoneContentRevealed(1, [inner, onZone], [])).toBe(false);
    expect(zm.isZoneContentRevealed(1, [inner], [])).toBe(true);
  });

  it("keeps zone hidden while overlay arrow animates away from original cells", () => {
    const zm = new ZoneManager([zone]);
    const inner: ArrowItem = {
      kind: 1,
      instanceId: 2,
      layer: 2,
      zoneId: 1,
      occupiedPositions: [[2, 2]],
      direction: 2,
      colorId: 6,
    };
    const movedOff: ArrowItem = {
      kind: 1,
      instanceId: 1,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[1, 2], [0, 2]],
      direction: 3,
      colorId: 3,
    };
    const overlayOriginals = new Map<number, Vec2[]>([
      [1, [
        [2, 2],
        [1, 2],
      ]],
    ]);

    expect(
      zm.isZoneContentRevealed(1, [inner, movedOff], [], new Map(), overlayOriginals),
    ).toBe(false);
  });

  it("does not recurse infinitely when multiple zones cross-check reveal", () => {
    const zone1 = buildZoneItem({
      instanceId: 1,
      occupiedPositions: [[2, 2]],
      items: [{ kind: 1, instanceId: 10 }],
    });
    const zone2 = buildZoneItem({
      instanceId: 2,
      occupiedPositions: [[4, 4]],
      items: [{ kind: 1, instanceId: 20 }],
    });
    const zm = new ZoneManager([zone1, zone2]);
    const inner1: ArrowItem = {
      kind: 1,
      instanceId: 10,
      layer: 2,
      zoneId: 1,
      occupiedPositions: [[2, 2]],
      direction: 2,
      colorId: 6,
    };
    const inner2: ArrowItem = {
      kind: 1,
      instanceId: 20,
      layer: 2,
      zoneId: 2,
      occupiedPositions: [[4, 4]],
      direction: 2,
      colorId: 6,
    };
    expect(() =>
      zm.isZoneContentRevealed(1, [inner1, inner2], []),
    ).not.toThrow();
    expect(zm.isZoneContentRevealed(1, [inner1, inner2], [])).toBe(true);
    expect(zm.isZoneContentRevealed(2, [inner1, inner2], [])).toBe(true);
  });

  it("stays revealed when animating arrow passes through zone cells", () => {
    const zm = new ZoneManager([zone]);
    const inner: ArrowItem = {
      kind: 1,
      instanceId: 2,
      layer: 2,
      zoneId: 1,
      occupiedPositions: [[2, 2]],
      direction: 2,
      colorId: 6,
    };
    const passing: ArrowItem = {
      kind: 1,
      instanceId: 9,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[2, 2], [2, 1]],
      direction: 1,
      colorId: 3,
    };

    expect(zm.isZoneContentRevealed(1, [inner], [])).toBe(true);
    expect(zm.isZoneContentRevealed(1, [inner, passing], [])).toBe(true);
    expect(zm.isArrowActive(inner, [inner, passing], [])).toBe(true);
  });
});

describe("GameState", () => {
  it("bump animation returns blocked arrow to origin", () => {
    const blocked: ArrowItem = {
      kind: 1,
      instanceId: 1,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[2, 3], [2, 2]],
      direction: 2,
      colorId: 3,
    };
    const blocker: ArrowItem = {
      kind: 1,
      instanceId: 2,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[2, 1], [2, 0]],
      direction: 1,
      colorId: 6,
    };
    const gs = new GameState(emptyLevel([blocked, blocker]));
    const origin = blocked.occupiedPositions.map((p) => [...p]);

    expect(gs.tryLaunch(1)).toBe(true);
    expect(gs.animation?.mode).toBe("bump");
    while (gs.phase === "animating") gs.advanceAnimation();

    expect(gs.phase).toBe("playing");
    expect(gs.arrows.find((a) => a.instanceId === 1)?.occupiedPositions).toEqual(
      origin,
    );
    expect(gs.mistakeCount).toBe(1);
  });

  it("reveals zone arrows when overlay on zone cells is cleared", () => {
    const zone = buildZoneItem({
      instanceId: 1,
      occupiedPositions: [[2, 2]],
      items: [{ kind: 1, instanceId: 2 }],
    });
    const inner: ArrowItem = {
      kind: 1,
      instanceId: 2,
      layer: 2,
      zoneId: 1,
      occupiedPositions: [[2, 2], [2, 1]],
      direction: 2,
      colorId: 6,
    };
    const onZone: ArrowItem = {
      kind: 1,
      instanceId: 1,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[2, 2], [1, 2]],
      direction: 3,
      colorId: 3,
    };
    const offZone: ArrowItem = {
      kind: 1,
      instanceId: 3,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[0, 0], [1, 0]],
      direction: 3,
      colorId: 3,
    };
    const gs = new GameState({
      ...emptyLevel([inner, onZone, offZone]),
      zones: [zone],
    });

    expect(gs.getActiveArrows().map((a) => a.instanceId).sort()).toEqual([
      1, 3,
    ]);
    expect(gs.getRevealedZoneArrows()).toEqual([]);

    gs.arrows = gs.arrows.filter((a) => a.instanceId !== 1);
    gs.rebuildCellMap();
    expect(gs.getActiveArrows().map((a) => a.instanceId).sort()).toEqual([
      2, 3,
    ]);
    expect(gs.getRevealedZoneArrows().map((a) => a.instanceId)).toEqual([2]);
  });

  it("does not reveal zone when overlay arrow bumps and returns", () => {
    const zone = buildZoneItem({
      instanceId: 1,
      occupiedPositions: [
        [2, 2],
        [3, 2],
      ],
      items: [{ kind: 1, instanceId: 2 }],
    });
    const inner: ArrowItem = {
      kind: 1,
      instanceId: 2,
      layer: 2,
      zoneId: 1,
      occupiedPositions: [[2, 2], [2, 1]],
      direction: 2,
      colorId: 6,
    };
    const onZone: ArrowItem = {
      kind: 1,
      instanceId: 1,
      layer: 2,
      zoneId: null,
      occupiedPositions: [
        [2, 2],
        [3, 2],
      ],
      direction: 3,
      colorId: 3,
    };
    const blocker: ArrowItem = {
      kind: 1,
      instanceId: 3,
      layer: 2,
      zoneId: null,
      occupiedPositions: [
        [4, 2],
        [5, 2],
      ],
      direction: 4,
      colorId: 3,
    };
    const gs = new GameState({
      ...emptyLevel([inner, onZone, blocker]),
      zones: [zone],
    });

    expect(gs.getRevealedZoneArrows()).toEqual([]);
    expect(gs.tryLaunch(1)).toBe(true);
    expect(gs.animation?.mode).toBe("bump");
    while (gs.phase === "animating") {
      gs.advanceAnimation();
    }
    expect(gs.getRevealedZoneArrows()).toEqual([]);
    expect(gs.arrows.some((a) => a.instanceId === 1)).toBe(true);
  });

  it("launches a single launchable arrow", () => {
    const arrow: ArrowItem = {
      kind: 1,
      instanceId: 1,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[2, 2], [2, 1]],
      direction: 2,
      colorId: 3,
    };
    const gs = new GameState(emptyLevel([arrow]));
    expect(gs.tryLaunch(1)).toBe(true);
    while (gs.phase === "animating") gs.advanceAnimation();
    expect(gs.phase).toBe("won");
    expect(gs.arrows.length).toBe(0);
  });

  it("parses kind 14/15/16 from level 9024-9026", () => {
    const l24 = parseLevelData(9024, loadJsonLevel(9024));
    expect(l24.shrinkPipes).toHaveLength(1);
    expect(l24.shrinkPipes[0]!.bindPipeId).toBe(100);

    const l25 = parseLevelData(9025, loadJsonLevel(9025));
    expect(l25.toggles).toHaveLength(1);
    expect(l25.controllers).toHaveLength(1);

    const l26 = parseLevelData(9026, loadJsonLevel(9026));
    expect(l26.toggles[0]!.groupID).toBe(2);
    expect(new GameState(l26).arrows.find((a) => a.kind === 2)).toBeTruthy();
  });
});
