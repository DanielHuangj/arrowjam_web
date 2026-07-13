import { describe, expect, it } from "vitest";
import { parseLevelData } from "../level/parser.ts";
import { GameState } from "./game-state.ts";
import { AREA_BOMB_EFFECT_DURATION } from "../mechanics/buff-effects.ts";

function rushLevelWithOneArrow() {
  return parseLevelData(9030, {
    width: 12,
    height: 14,
    name: "rush spawn empty",
    durationInSec: 90,
    difficulty: 1,
    gameMode: "rush",
    spawnIntervalSec: 20,
    spawnPool: [{ kind: 1, weight: 1000, colorId: 7 }],
    itemModels: [
      {
        kind: 1,
        instanceId: 1,
        layer: 2,
        direction: 1,
        colorId: 7,
        occupiedPositions: [
          [5, 3],
          [5, 4],
        ],
      },
    ],
  });
}

describe("GameState rush spawn on empty board", () => {
  it("spawns immediately and resets countdown when all arrows are cleared", () => {
    const gs = new GameState(rushLevelWithOneArrow());
    expect(gs.getSpawnCountdownSec()).toBe(20);

    gs.spawnManager.spawnCountdownSec = 15;
    gs.arrows = [];
    gs.rebuildCellMap();

    gs.tick(0.016);

    expect(gs.getSpawnCountdownSec()).toBe(20);
    expect(gs.arrows.length).toBeGreaterThan(0);
    expect(gs.isSpawnPhase()).toBe(true);
  });

  it("does not immediate-spawn while exit animation is still blocking", () => {
    const gs = new GameState(rushLevelWithOneArrow());
    gs.spawnManager.spawnCountdownSec = 15;
    gs.animations.push({
      instanceId: 1,
      memberIds: [1],
      stripIds: [],
      mode: "exit",
      originalPositionsById: { 1: [[5, 3], [5, 4]] },
      originalDirectionById: { 1: 1 },
      originalStripPositionsById: {},
      bumpHistoryById: { 1: [] },
      stripBumpHistoryById: {},
      reversing: false,
      currentDirectionById: { 1: 1 },
      stepCount: 0,
      flightStepCount: 0,
      stepAccumMs: 0,
      pipeTransitById: { 1: null },
      pipesCrossedById: { 1: [] },
      togglesCrossedIds: [],
      flipButtonsCrossedIds: [],
    });

    gs.tick(0.016);

    expect(gs.getSpawnCountdownSec()).toBe(15);
    expect(gs.arrows.length).toBe(1);
  });

  it("delays spawn refresh until prop effect completes when countdown is due", () => {
    const gs = new GameState(
      parseLevelData(9031, {
        width: 12,
        height: 14,
        name: "rush spawn prop delay",
        durationInSec: 90,
        difficulty: 1,
        gameMode: "rush",
        spawnIntervalSec: 20,
        levelGoals: [{ type: "clearArrowCount", count: 100 }],
        spawnPool: [{ kind: 1, weight: 1000, colorId: 7 }],
        itemModels: [
          {
            kind: 1,
            instanceId: 1,
            layer: 2,
            direction: 1,
            colorId: 7,
            occupiedPositions: [
              [5, 3],
              [5, 4],
            ],
          },
          {
            kind: 17,
            instanceId: 100,
            layer: 2,
            zoneId: null,
            occupiedPositions: [[8, 8]],
            bombRadius: 1,
          },
        ],
      }),
    );
    expect(gs.isRushLevel()).toBe(true);
    const before = gs.arrows.length;
    gs.spawnManager.spawnCountdownSec = 0;
    expect(gs.triggerBuff(100)).toBe(true);
    expect(gs.getAreaBombEffectsForRender().length).toBeGreaterThan(0);

    gs.tick(0.016);

    expect(gs.spawnManager.spawnDuePending).toBe(true);
    expect(gs.getSpawnCountdownSec()).toBeLessThanOrEqual(0);
    expect(gs.arrows.length).toBe(before);

    while (gs.getAreaBombEffectsForRender().length > 0) {
      gs.tick(AREA_BOMB_EFFECT_DURATION / 8);
    }
    gs.tick(0.016);

    expect(gs.phase).toBe("playing");
    expect(gs.getSpawnCountdownSec()).toBe(20);
    expect(gs.spawnManager.spawnDuePending).toBe(false);
    expect(gs.arrows.length).toBeGreaterThan(before);
  });

  it("keeps spawn countdown ticking during prop effect but defers spawn at zero", () => {
    const gs = new GameState(
      parseLevelData(9032, {
        width: 12,
        height: 14,
        name: "rush spawn prop tick",
        durationInSec: 90,
        difficulty: 1,
        gameMode: "rush",
        spawnIntervalSec: 20,
        levelGoals: [{ type: "clearArrowCount", count: 100 }],
        spawnPool: [{ kind: 1, weight: 1000, colorId: 7 }],
        itemModels: [
          {
            kind: 1,
            instanceId: 1,
            layer: 2,
            direction: 1,
            colorId: 7,
            occupiedPositions: [
              [5, 3],
              [5, 4],
            ],
          },
          {
            kind: 17,
            instanceId: 100,
            layer: 2,
            zoneId: null,
            occupiedPositions: [[8, 8]],
            bombRadius: 1,
          },
        ],
      }),
    );
    gs.spawnManager.spawnCountdownSec = 0.6;
    expect(gs.triggerBuff(100)).toBe(true);

    gs.tick(0.1);

    expect(gs.getAreaBombEffectsForRender().length).toBeGreaterThan(0);
    expect(gs.getSpawnCountdownSec()).toBeCloseTo(0.5, 5);
    expect(gs.arrows.length).toBe(1);
  });
});
