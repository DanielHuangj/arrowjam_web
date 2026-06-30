import { describe, expect, it } from "vitest";
import { parseLevelData } from "../level/parser.ts";
import { GameState } from "../game/game-state.ts";
import {
  BundleManager,
  advanceBundleStep,
  buildBundleGroups,
  hasConsistentDirections,
  simulateCanExitBundle,
} from "./bundle.ts";
import type { ArrowItem, BundleItem } from "../types.ts";
import { snakeStepArrow } from "../board/cell-map.ts";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const levelsDir = join(__dirname, "../../../public/levels");

function loadLevel(id: number) {
  const raw = readFileSync(join(levelsDir, `level-${id}.json`), "utf-8");
  return parseLevelData(id, JSON.parse(raw));
}

describe("buildBundleGroups", () => {
  it("binds four parallel arrows on L33 strip #85", () => {
    const level = loadLevel(33);
    const strip = level.bundles.find((b) => b.instanceId === 85)!;
    const groups = buildBundleGroups([strip], level.arrows);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.arrowIds.sort()).toEqual([77, 78, 79, 80]);
  });

  it("builds six groups on L36", () => {
    const level = loadLevel(36);
    const groups = buildBundleGroups(level.bundles, level.arrows);
    expect(groups.length).toBe(6);
    for (const group of groups) {
      expect(group.arrowIds.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("requires consistent directions to launch", () => {
    const arrows: ArrowItem[] = [
      {
        kind: 1,
        instanceId: 1,
        layer: 2,
        zoneId: null,
        occupiedPositions: [[0, 0], [0, 1]],
        direction: 1,
        colorId: 3,
      },
      {
        kind: 1,
        instanceId: 2,
        layer: 2,
        zoneId: null,
        occupiedPositions: [[1, 0], [1, 1]],
        direction: 2,
        colorId: 3,
      },
    ];
    const strip: BundleItem = {
      kind: 8,
      instanceId: 10,
      layer: 3,
      zoneId: null,
      occupiedPositions: [[0, 0], [1, 0]],
    };
    const groups = buildBundleGroups([strip], arrows);
    expect(groups[0]!.arrowIds).toEqual([1, 2]);
    expect(hasConsistentDirections([arrows[0]!, arrows[1]!])).toBe(false);

    const mgr = new BundleManager([strip], arrows);
    expect(
      mgr.canLaunchGroup(groups[0]!, arrows, [], { width: 5, height: 5 }),
    ).toBe(false);
  });

  it("does not merge zone bundle with overlapping top-level arrows on L30", () => {
    const level = loadLevel(30);
    const strip = level.bundles.find((b) => b.instanceId === 135)!;
    expect(strip.zoneId).toBe(117);
    const mgr = new BundleManager(level.bundles, level.arrows);
    expect(mgr.getGroupForArrow(21)).toBeNull();
    expect(mgr.getGroupForArrow(63)).toBeNull();
    const group = mgr.getGroupForArrow(124);
    expect(group).not.toBeNull();
    expect(group!.arrowIds.sort()).toEqual([124, 125, 126, 127]);
  });

  it("moves strip anchors with arrow snake step", () => {
    const arrows: ArrowItem[] = [
      {
        kind: 1,
        instanceId: 1,
        layer: 2,
        zoneId: null,
        occupiedPositions: [[2, 0], [2, 1], [2, 2]],
        direction: 1,
        colorId: 3,
      },
      {
        kind: 1,
        instanceId: 2,
        layer: 2,
        zoneId: null,
        occupiedPositions: [[3, 0], [3, 1], [3, 2]],
        direction: 1,
        colorId: 3,
      },
    ];
    const strip: BundleItem = {
      kind: 8,
      instanceId: 10,
      layer: 3,
      zoneId: null,
      occupiedPositions: [
        [2, 1],
        [3, 1],
      ],
    };
    const mgr = new BundleManager([strip], arrows);
    const stepped = arrows.map((a) => snakeStepArrow(a));
    mgr.syncGroupStrips([10], [strip], stepped, true);
    expect(strip.occupiedPositions).toEqual([
      [2, 2],
      [3, 2],
    ]);
  });

  it("getStripIdsForArrowIds finds strips by anchor without bundle group", () => {
    const arrows: ArrowItem[] = [
      {
        kind: 1,
        instanceId: 1,
        layer: 2,
        zoneId: null,
        occupiedPositions: [[0, 1], [1, 1], [2, 1]],
        direction: 3,
        colorId: 3,
      },
    ];
    const strip: BundleItem = {
      kind: 8,
      instanceId: 10,
      layer: 3,
      zoneId: null,
      occupiedPositions: [[1, 1]],
    };
    const mgr = new BundleManager([strip], arrows);
    expect(mgr.getStripIdsForArrowIds([1], [strip])).toEqual([10]);
    expect(mgr.getStripIdsForArrowIds([99], [strip])).toEqual([]);
  });
});

describe("GameState bundle exit", () => {
  it("keeps strip anchored while a single bundled arrow moves", () => {
    const arrows: ArrowItem[] = [
      {
        kind: 1,
        instanceId: 1,
        layer: 2,
        zoneId: null,
        occupiedPositions: [[0, 1], [1, 1], [2, 1]],
        direction: 3,
        colorId: 3,
      },
    ];
    const strip: BundleItem = {
      kind: 8,
      instanceId: 10,
      layer: 3,
      zoneId: null,
      occupiedPositions: [[1, 1]],
    };
    const gs = new GameState({
      id: 0,
      width: 6,
      height: 3,
      name: "t",
      durationInSec: 60,
      difficulty: 1,
      arrows,
      corners: [],
      zones: [],
      bundles: [strip],
      pipes: [],
      curtains: [],
      keys: [],
    });
    gs.tryLaunch(1);
    expect(gs.animation?.stripIds).toEqual([10]);
    gs.advanceAnimation();
    const arrow = gs.arrows.find((a) => a.instanceId === 1)!;
    const stripCells = new Set(gs.bundles[0]!.occupiedPositions.map((p) => `${p[0]},${p[1]}`));
    expect(arrow.occupiedPositions.some((p) => stripCells.has(`${p[0]},${p[1]}`))).toBe(true);
    expect(gs.bundles[0]!.occupiedPositions).toEqual([[2, 1]]);
  });

  it("moves multi-arrow strip during exit animation", () => {
    const arrows: ArrowItem[] = [
      {
        kind: 1,
        instanceId: 1,
        layer: 2,
        zoneId: null,
        occupiedPositions: [[2, 0], [2, 1], [2, 2]],
        direction: 1,
        colorId: 3,
      },
      {
        kind: 1,
        instanceId: 2,
        layer: 2,
        zoneId: null,
        occupiedPositions: [[3, 0], [3, 1], [3, 2]],
        direction: 1,
        colorId: 3,
      },
    ];
    const strip: BundleItem = {
      kind: 8,
      instanceId: 10,
      layer: 3,
      zoneId: null,
      occupiedPositions: [
        [2, 1],
        [3, 1],
      ],
    };
    const gs = new GameState({
      id: 0,
      width: 6,
      height: 6,
      name: "t",
      durationInSec: 60,
      difficulty: 1,
      arrows,
      corners: [],
      zones: [],
      bundles: [strip],
      pipes: [],
      curtains: [],
      keys: [],
    });
    gs.tryLaunch(1);
    gs.advanceAnimation();
    expect(gs.bundles[0]!.occupiedPositions).toEqual([
      [2, 2],
      [3, 2],
    ]);
  });

  it("completes exit when bundled arrows leave the board", () => {
    const arrows: ArrowItem[] = [
      {
        kind: 1,
        instanceId: 1,
        layer: 2,
        zoneId: null,
        occupiedPositions: [[2, 0], [2, 1]],
        direction: 2,
        colorId: 3,
      },
      {
        kind: 1,
        instanceId: 2,
        layer: 2,
        zoneId: null,
        occupiedPositions: [[3, 0], [3, 1]],
        direction: 2,
        colorId: 3,
      },
    ];
    const strip: BundleItem = {
      kind: 8,
      instanceId: 10,
      layer: 3,
      zoneId: null,
      occupiedPositions: [[2, 0], [3, 0]],
    };
    const gs = new GameState({
      id: 0,
      width: 5,
      height: 3,
      name: "t",
      durationInSec: 60,
      difficulty: 1,
      arrows,
      corners: [],
      zones: [],
      bundles: [strip],
      pipes: [],
      curtains: [],
      keys: [],
    });
    gs.tryLaunch(1);
    expect(gs.animation?.mode).toBe("exit");
    while (gs.phase === "animating") gs.advanceAnimation();
    expect(gs.phase).toBe("won");
    expect(gs.arrows.length).toBe(0);
  });

  it("does not exit when only one bundled arrow can traverse a pipe", () => {
    const arrows: ArrowItem[] = [
      {
        kind: 1,
        instanceId: 1,
        layer: 2,
        zoneId: null,
        occupiedPositions: [[0, 1], [1, 1], [2, 1]],
        direction: 3,
        colorId: 3,
      },
      {
        kind: 1,
        instanceId: 2,
        layer: 2,
        zoneId: null,
        occupiedPositions: [[0, 3], [1, 3], [2, 3]],
        direction: 3,
        colorId: 3,
      },
    ];
    const strip: BundleItem = {
      kind: 8,
      instanceId: 10,
      layer: 3,
      zoneId: null,
      occupiedPositions: [[1, 1], [1, 3]],
    };
    const pipe = {
      kind: 3 as const,
      instanceId: 20,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[3, 1], [4, 1], [5, 1]] as [number, number][],
      health: 2,
      passes: [
        { position: [3, 1] as [number, number], directions: [[-1, 0], [1, 0]] as [number, number][] },
        { position: [5, 1] as [number, number], directions: [[-1, 0], [1, 0]] as [number, number][] },
      ],
      healthViewPathIndex: 1,
    };
    const board = { width: 8, height: 5 };
    expect(
      simulateCanExitBundle([1, 2], arrows, [], board, [pipe], new Set(), new Set()),
    ).toBe(false);

    const gs = new GameState({
      id: 0,
      width: board.width,
      height: board.height,
      name: "t",
      durationInSec: 60,
      difficulty: 1,
      arrows,
      corners: [],
      zones: [],
      bundles: [strip],
      pipes: [pipe],
      curtains: [],
      keys: [],
    });
    gs.tryLaunch(1);
    expect(gs.animation?.mode).toBe("bump");
    while (gs.phase === "animating") gs.advanceAnimation();
    expect(gs.phase).toBe("playing");
    expect(gs.arrows).toHaveLength(2);
  });

  it("recovers when animating with missing members", () => {
    const level = loadLevel(36);
    const gs = new GameState(level);
    const bundled = gs.arrows.find((a) => gs.bundleManager.getGroupForArrow(a.instanceId))!;
    gs.tryLaunch(bundled.instanceId);
    gs.arrows = gs.arrows.filter((a) => !gs.animation!.memberIds.includes(a.instanceId));
    gs.recoverAnimationState();
    expect(gs.phase).toBe("playing");
    expect(gs.animation).toBeNull();
    const other = gs.arrows[0];
    expect(other).toBeDefined();
    expect(gs.tryLaunch(other!.instanceId)).toBe(true);
  });
});
