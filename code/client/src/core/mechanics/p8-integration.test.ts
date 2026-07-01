import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLevelData } from "../level/parser.ts";
import { GameState, LAUNCH_CLICK_COOLDOWN_MS } from "../game/game-state.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureLevelsDir = join(__dirname, "../../../test-fixtures/levels");

function load(id: number) {
  const raw = readFileSync(join(fixtureLevelsDir, `level-${id}.json`), "utf-8");
  return parseLevelData(id, JSON.parse(raw));
}

describe("P8 integration", () => {
  it("9024 shrinks strip after pipe traverse", () => {
    const level = load(9024);
    const gs = new GameState(level);
    const before = gs.shrinkPipes[0]!.occupiedPositions.length;
    gs.tryLaunch(1);
    while (gs.phase === "animating") gs.advanceAnimation();
    const after = gs.shrinkPipes[0]?.occupiedPositions.length ?? 0;
    expect(after).toBeLessThan(before);
  });

  it("9024 shrinks on each pipe traverse until one cell then removes strip when pipe dies", () => {
    const level = load(9024);
    level.shrinkPipes[0]!.occupiedPositions = [
      [4, 6],
      [4, 7],
      [4, 8],
      [4, 9],
    ];
    level.shrinkPipes[0]!.shorten = 1;
    level.pipes[0]!.health = 4;
    const gs = new GameState(level);
    let t = 0;

    expect(gs.tryLaunch(1, t)).toBe(true);
    while (gs.phase === "animating") gs.advanceAnimation();
    expect(gs.shrinkPipes[0]!.occupiedPositions).toHaveLength(3);

    const arrow2 = {
      kind: 1 as const,
      instanceId: 2,
      layer: 2,
      zoneId: null,
      direction: 3 as const,
      colorId: 3,
      occupiedPositions: [
        [1, 5],
        [2, 5],
      ] as [number, number][],
    };
    gs.arrows.push(arrow2);
    gs.rebuildCellMap();
    gs.phase = "playing";
    t += LAUNCH_CLICK_COOLDOWN_MS;
    expect(gs.tryLaunch(2, t)).toBe(true);
    while (gs.phase === "animating") gs.advanceAnimation();
    expect(gs.shrinkPipes[0]!.occupiedPositions).toHaveLength(2);

    gs.arrows.push({ ...arrow2, instanceId: 3 });
    gs.rebuildCellMap();
    gs.phase = "playing";
    t += LAUNCH_CLICK_COOLDOWN_MS;
    expect(gs.tryLaunch(3, t)).toBe(true);
    while (gs.phase === "animating") gs.advanceAnimation();
    expect(gs.shrinkPipes[0]!.occupiedPositions).toHaveLength(1);

    gs.arrows.push({ ...arrow2, instanceId: 4 });
    gs.rebuildCellMap();
    gs.phase = "playing";
    t += LAUNCH_CLICK_COOLDOWN_MS;
    expect(gs.tryLaunch(4, t)).toBe(true);
    while (gs.phase === "animating") gs.advanceAnimation();
    expect(gs.pipes).toHaveLength(0);
    expect(gs.shrinkPipes).toHaveLength(0);
  });

  it("9025 moves wall when arrow crosses toggle and exits", () => {
    const level = parseLevelData(90252, {
      width: 12,
      height: 12,
      name: "[测] 穿出拨杆移墙",
      durationInSec: 120,
      difficulty: 1,
      itemModels: [
        {
          kind: 7,
          instanceId: 70,
          layer: 2,
          occupiedPositions: [[10, 6], [10, 7]],
          movingPath: [[10, 6], [10, 7], [10, 8]],
          movingDistance: 1,
          movingType: 1,
        },
        {
          kind: 15,
          instanceId: 150,
          layer: 3,
          groupID: 1,
          direction: 1,
          occupiedPositions: [[2, 5]],
        },
        {
          kind: 16,
          instanceId: 160,
          layer: 3,
          groupID: 1,
          bindInstanceId: 70,
          occupiedPositions: [[10, 6]],
        },
        {
          kind: 1,
          instanceId: 1,
          layer: 2,
          direction: 3,
          colorId: 6,
          occupiedPositions: [[0, 5], [1, 5]],
        },
      ],
    });
    const gs = new GameState(level);
    const before = gs.getMovingWalls()[0]!.occupiedPositions.map((p) => `${p[0]},${p[1]}`).join("|");
    expect(gs.tryLaunch(1)).toBe(true);
    while (gs.phase === "animating") gs.advanceAnimation();
    expect(gs.toggles[0]!.direction).toBe(2);
    const after = gs.getMovingWalls()[0]!.occupiedPositions.map((p) => `${p[0]},${p[1]}`).join("|");
    expect(after).not.toBe(before);
    expect(gs.arrows.some((a) => a.instanceId === 1)).toBe(false);
  });

  it("9026 flips kind2 when arrow crosses toggle and exits", () => {
    const level = parseLevelData(90263, {
      width: 12,
      height: 8,
      name: "[测] 穿出拨杆",
      durationInSec: 120,
      difficulty: 1,
      itemModels: [
        {
          kind: 2,
          instanceId: 20,
          layer: 2,
          direction1: 3,
          direction2: 4,
          direction: 3,
          colorId: 7,
          occupiedPositions: [
            [6, 6],
            [7, 6],
          ],
        },
        {
          kind: 15,
          instanceId: 151,
          layer: 3,
          groupID: 2,
          direction: 1,
          occupiedPositions: [[4, 4]],
        },
        {
          kind: 16,
          instanceId: 161,
          layer: 3,
          groupID: 2,
          bindInstanceId: 20,
          occupiedPositions: [[6, 6]],
        },
        {
          kind: 1,
          instanceId: 1,
          layer: 2,
          direction: 3,
          colorId: 3,
          occupiedPositions: [
            [1, 4],
            [2, 4],
          ],
        },
      ],
    });
    const gs = new GameState(level);
    const flip = gs.arrows.find((a) => a.instanceId === 20)!;
    const dirBefore = flip.direction;
    const toggleBefore = gs.toggles[0]!.direction;

    gs.tryLaunch(1);
    while (gs.phase === "animating") gs.advanceAnimation();

    expect(gs.toggles[0]!.direction).not.toBe(toggleBefore);
    expect(gs.arrows.find((a) => a.instanceId === 20)!.direction).not.toBe(dirBefore);
    expect(gs.arrows.some((a) => a.instanceId === 1)).toBe(false);
  });

  it("controlled kind2 ignores elimination flip; uncontrolled still flips", () => {
    const level = parseLevelData(90260, {
      width: 12,
      height: 12,
      name: "[测] 消除翻转",
      durationInSec: 120,
      difficulty: 1,
      itemModels: [
        {
          kind: 2,
          instanceId: 20,
          layer: 2,
          direction1: 3,
          direction2: 1,
          direction: 3,
          colorId: 6,
          occupiedPositions: [
            [8, 8],
            [9, 8],
          ],
        },
        {
          kind: 16,
          instanceId: 160,
          layer: 3,
          groupID: 1,
          bindInstanceId: 20,
          occupiedPositions: [[8, 8]],
        },
        {
          kind: 2,
          instanceId: 30,
          layer: 2,
          direction1: 3,
          direction2: 1,
          direction: 3,
          colorId: 7,
          occupiedPositions: [
            [8, 10],
            [9, 10],
          ],
        },
        {
          kind: 1,
          instanceId: 1,
          layer: 2,
          direction: 3,
          colorId: 3,
          occupiedPositions: [
            [0, 5],
            [1, 5],
          ],
        },
      ],
    });
    const gs = new GameState(level);
    const controlledDirBefore = gs.arrows.find((a) => a.instanceId === 20)!.direction;
    const freeDirBefore = gs.arrows.find((a) => a.instanceId === 30)!.direction;

    gs.tryLaunch(1);
    while (gs.phase === "animating") gs.advanceAnimation();

    expect(gs.arrows.find((a) => a.instanceId === 20)!.direction).toBe(controlledDirBefore);
    expect(gs.arrows.find((a) => a.instanceId === 30)!.direction).not.toBe(freeDirBefore);
  });

  it("controlled wall ignores elimination move; toggle still moves it", () => {
    const level = load(9025);
    const gs = new GameState(level);
    const wallBefore = gs.getMovingWalls()[0]!.occupiedPositions.map((p) => p.join(","));

    gs.arrows.push({
      kind: 1,
      instanceId: 99,
      layer: 2,
      zoneId: null,
      direction: 3,
      colorId: 6,
      occupiedPositions: [
        [0, 7],
        [1, 7],
      ],
    });
    gs.rebuildCellMap();
    gs.phase = "playing";
    expect(gs.tryLaunch(99, LAUNCH_CLICK_COOLDOWN_MS)).toBe(true);
    while (gs.phase === "animating") gs.advanceAnimation();

    const afterElim = gs.getMovingWalls()[0]!.occupiedPositions.map((p) => p.join(","));
    expect(afterElim).toEqual(wallBefore);
  });

  it("removes controller when bound flip arrow is launched off board", () => {
    const level = parseLevelData(90261, {
      width: 12,
      height: 12,
      name: "[测] 翻转箭消除控制器",
      durationInSec: 120,
      difficulty: 1,
      itemModels: [
        {
          kind: 2,
          instanceId: 20,
          layer: 2,
          direction1: 3,
          direction2: 1,
          direction: 3,
          colorId: 6,
          occupiedPositions: [
            [5, 5],
            [6, 5],
          ],
        },
        {
          kind: 16,
          instanceId: 160,
          layer: 3,
          groupID: 1,
          bindInstanceId: 20,
          occupiedPositions: [[5, 5]],
        },
        {
          kind: 15,
          instanceId: 150,
          layer: 3,
          groupID: 1,
          direction: 1,
          occupiedPositions: [[0, 0]],
        },
      ],
    });
    const gs = new GameState(level);
    expect(gs.getDrawableControllers()).toHaveLength(1);

    gs.tryLaunch(20);
    while (gs.phase === "animating") gs.advanceAnimation();

    expect(gs.getDrawableControllers()).toHaveLength(0);
    expect(gs.arrows.some((a) => a.instanceId === 20)).toBe(false);
  });

  it("does not flip toggle when arrow crosses then bounces back", () => {
    const level = parseLevelData(90262, {
      width: 8,
      height: 8,
      name: "[测] 反弹不拨杆",
      durationInSec: 120,
      difficulty: 1,
      itemModels: [
        {
          kind: 1,
          instanceId: 1,
          layer: 2,
          direction: 3,
          colorId: 3,
          occupiedPositions: [
            [1, 4],
            [2, 4],
          ],
        },
        {
          kind: 1,
          instanceId: 2,
          layer: 2,
          direction: 3,
          colorId: 6,
          occupiedPositions: [
            [5, 4],
            [6, 4],
          ],
        },
        {
          kind: 15,
          instanceId: 150,
          layer: 3,
          groupID: 1,
          direction: 1,
          occupiedPositions: [[4, 4]],
        },
      ],
    });
    const gs = new GameState(level);
    const toggle = gs.getDrawableToggles()[0]!;

    gs.tryLaunch(1);
    while (gs.phase === "animating") gs.advanceAnimation();

    expect(toggle.direction).toBe(1);
    expect(gs.arrows.some((a) => a.instanceId === 1)).toBe(true);
  });
});
