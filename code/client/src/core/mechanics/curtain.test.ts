import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLevelData } from "../level/parser.ts";
import { GameState } from "../game/game-state.ts";
import { CurtainManager } from "./curtain.ts";
import type { ArrowItem, CurtainItem, LevelData } from "../types.ts";
import { simulateCanExit } from "../board/path-check.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const levelsDir = join(__dirname, "../../../public/levels");

function loadLevel(id: number) {
  const raw = readFileSync(join(levelsDir, `level-${id}.json`), "utf-8");
  return parseLevelData(id, JSON.parse(raw) as LevelData);
}

const curtainA: CurtainItem = {
  kind: 6,
  instanceId: 1,
  layer: 8,
  health: 2,
  order: 1,
  occupiedPositions: [
    [2, 2],
    [3, 2],
    [2, 3],
    [3, 3],
  ],
};

const curtainB: CurtainItem = {
  kind: 6,
  instanceId: 2,
  layer: 8,
  health: 3,
  order: 0,
  occupiedPositions: [
    [5, 5],
    [6, 5],
  ],
};

describe("CurtainManager", () => {
  it("applies keys to lowest order curtain first", () => {
    const mgr = new CurtainManager([curtainA, curtainB]);
    expect(mgr.getTargetCurtain()?.instanceId).toBe(2);
    mgr.applyKey();
    expect(mgr.getTargetCurtain()?.instanceId).toBe(2);
    expect(mgr.getTargetCurtain()?.health).toBe(2);
    mgr.applyKey(2);
    expect(mgr.getActiveCurtains().find((c) => c.instanceId === 2)).toBeUndefined();
    expect(mgr.getTargetCurtain()?.instanceId).toBe(1);
    mgr.applyKey();
    expect(mgr.getTargetCurtain()?.health).toBe(1);
  });

  it("hides arrows under active curtain cells", () => {
    const mgr = new CurtainManager([curtainA]);
    const hidden: ArrowItem = {
      kind: 1,
      instanceId: 10,
      layer: 2,
      zoneId: null,
      occupiedPositions: [
        [2, 2],
        [2, 1],
      ],
      direction: 1,
      colorId: 3,
    };
    const visible: ArrowItem = {
      ...hidden,
      instanceId: 11,
      occupiedPositions: [
        [0, 0],
        [1, 0],
      ],
    };
    expect(mgr.isArrowHidden(hidden)).toBe(true);
    expect(mgr.isArrowHidden(visible)).toBe(false);
  });

  it("blocks path through curtain cells", () => {
    const mgr = new CurtainManager([curtainA]);
    const arrow: ArrowItem = {
      kind: 1,
      instanceId: 1,
      layer: 2,
      zoneId: null,
      occupiedPositions: [
        [1, 2],
        [0, 2],
      ],
      direction: 3,
      colorId: 3,
    };
    expect(
      simulateCanExit(
        arrow,
        [arrow],
        [],
        { width: 6, height: 6 },
        [],
        mgr.getActiveCellKeys(),
      ),
    ).toBe(false);
  });
});

describe("curtain gameplay", () => {
  it("parses curtains and keys on L61", () => {
    const level = loadLevel(61);
    expect(level.curtains.length).toBe(1);
    expect(level.keys.length).toBe(5);
    expect(level.curtains[0]!.health).toBe(5);
  });

  it("reveals hidden arrows when keys unlock curtain", () => {
    const level = loadLevel(61);
    const gs = new GameState(level);
    const hiddenBefore = gs
      .getActiveArrows()
      .some((a) => a.instanceId === 29);
    expect(hiddenBefore).toBe(false);
    expect(gs.getActiveCurtainsForRender().length).toBe(1);

    gs.curtainManager.applyKey(5);
    expect(gs.getActiveCurtainsForRender().length).toBe(0);
    expect(gs.getActiveArrows().some((a) => a.instanceId === 29)).toBe(true);
  });

  it("counts keys when key arrow exits board", () => {
    const arrow: ArrowItem = {
      kind: 1,
      instanceId: 1,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[0, 4]],
      direction: 2,
      colorId: 6,
    };
    const gs = new GameState({
      id: 0,
      width: 5,
      height: 5,
      name: "key-test",
      durationInSec: 60,
      difficulty: 1,
      arrows: [arrow],
      corners: [],
      zones: [],
      bundles: [],
      pipes: [],
      curtains: [
        {
          kind: 6,
          instanceId: 44,
          layer: 8,
          health: 2,
          order: 0,
          occupiedPositions: [
            [2, 2],
            [3, 2],
          ],
        },
      ],
      keys: [
        {
          kind: 11,
          instanceId: 61,
          layer: 3,
          occupiedPositions: [[0, 4]],
        },
      ],
    });
    expect(gs.tryLaunch(1)).toBe(true);
    expect(gs.animation?.mode).toBe("exit");
    while (gs.phase === "animating") gs.advanceAnimation();
    expect(gs.getActiveCurtainsForRender()[0]?.health).toBe(1);
  });
});
