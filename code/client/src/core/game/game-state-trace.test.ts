import { describe, expect, it, vi } from "vitest";
import { GameState } from "./game-state.ts";
import type { GameLevel } from "../types.ts";
import { AREA_BOMB_EFFECT_DURATION, BLACK_HOLE_LIFETIME_SEC, BLACK_HOLE_VANISH_DURATION, CHAIN_TRIGGER_DELAY_SEC } from "../mechanics/buff-effects.ts";
import {
  CROSS_WAVE_RING_INTERVAL,
  CROSS_WAVE_START_DELAY,
  FIRE_CELL_BURN_DURATION,
  FIRE_IGNITE_BASE,
} from "../mechanics/buff-effects.ts";

function minimalLevel(
  arrows: GameLevel["arrows"],
  extras: Partial<GameLevel> = {},
): GameLevel {
  return {
    id: 1,
    width: 10,
    height: 10,
    name: "t",
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
    buffs: [],
    ...extras,
  };
}

describe("GameState cleared traces", () => {
  it("records cells when arrow exits board", () => {
    const gs = new GameState(
      minimalLevel([
        {
          kind: 1,
          instanceId: 1,
          layer: 2,
          direction: 3,
          colorId: 6,
          zoneId: null,
          occupiedPositions: [
            [0, 5],
            [1, 5],
            [2, 5],
          ],
        },
      ]),
    );

    gs.tryLaunch(1);
    for (let i = 0; i < 200; i++) {
      gs.advanceAnimation();
      if (gs.phase !== "animating") break;
    }

    const traces = gs.getClearedTraceCells();
    expect(traces).toContainEqual([0, 5]);
    expect(traces).toContainEqual([1, 5]);
    expect(traces).toContainEqual([2, 5]);
    expect(gs.arrows.length).toBe(0);
  });

  it("tryAutoLaunch picks a launchable arrow", () => {
    const gs = new GameState(
      minimalLevel([
        {
          kind: 1,
          instanceId: 1,
          layer: 2,
          direction: 3,
          colorId: 6,
          zoneId: null,
          occupiedPositions: [
            [0, 5],
            [1, 5],
            [2, 5],
          ],
        },
      ]),
    );

    expect(gs.tryAutoLaunch()).toBe(true);
    expect(gs.phase).toBe("animating");
  });

  it("tryRandomVanish removes up to 3 visible arrows", () => {
    const arrows: GameLevel["arrows"] = [];
    for (let i = 1; i <= 5; i++) {
      arrows.push({
        kind: 1,
        instanceId: i,
        layer: 2,
        direction: 3,
        colorId: 6,
        zoneId: null,
        occupiedPositions: [
          [i, 0],
          [i, 1],
        ],
      });
    }
    const gs = new GameState(minimalLevel(arrows));
    expect(gs.tryRandomVanish()).toBe(true);
    while (gs.phase === "animating") {
      gs.advanceAnimation();
    }
    expect(gs.arrows.length).toBe(2);
    expect(gs.animation?.mode).toBeUndefined();
  });

  it("tryTargetVanishAtCell removes one eligible arrow", () => {
    const gs = new GameState(
      minimalLevel([
        {
          kind: 1,
          instanceId: 1,
          layer: 2,
          direction: 3,
          colorId: 6,
          zoneId: null,
          occupiedPositions: [
            [2, 2],
            [3, 2],
          ],
        },
        {
          kind: 1,
          instanceId: 2,
          layer: 2,
          direction: 1,
          colorId: 7,
          zoneId: null,
          occupiedPositions: [
            [5, 5],
            [5, 6],
          ],
        },
      ]),
    );
    expect(gs.tryTargetVanishAtCell([2, 2])).toBe(true);
    while (gs.phase === "animating") {
      gs.advanceAnimation();
    }
    expect(gs.arrows.length).toBe(1);
    expect(gs.arrows[0]!.instanceId).toBe(2);
  });

  it("flip arrow toggles direction after another arrow eliminated", () => {
    const gs = new GameState(
      minimalLevel([
        {
          kind: 1,
          instanceId: 1,
          layer: 2,
          direction: 3,
          colorId: 6,
          zoneId: null,
          occupiedPositions: [
            [0, 6],
            [1, 6],
            [2, 6],
          ],
        },
        {
          kind: 2,
          instanceId: 2,
          layer: 2,
          direction: 3,
          direction1: 3,
          direction2: 4,
          colorId: 7,
          zoneId: null,
          occupiedPositions: [
            [5, 6],
            [6, 6],
            [7, 6],
          ],
        },
      ]),
    );
    expect(gs.tryTargetVanishAtCell([2, 6])).toBe(true);
    while (gs.phase === "animating") {
      gs.advanceAnimation();
    }
    const flip = gs.arrows.find((a) => a.instanceId === 2)!;
    expect(flip.direction).toBe(4);
    expect(flip.occupiedPositions[0]).toEqual([7, 6]);
  });

  it("records cleared traces when buff destroys arrow cells", () => {
    const gs = new GameState(
      minimalLevel(
        [
          {
            kind: 1,
            instanceId: 1,
            layer: 2,
            direction: 3,
            colorId: 6,
            zoneId: null,
            occupiedPositions: [
              [4, 5],
              [5, 5],
            ],
          },
        ],
        {
          buffs: [
            {
              kind: 17,
              instanceId: 100,
              layer: 2,
              zoneId: null,
              occupiedPositions: [[5, 5]],
              bombRadius: 1,
            },
          ],
        },
      ),
    );

    expect(gs.triggerBuff(100)).toBe(true);
    while (gs.getAreaBombEffectsForRender().length > 0) {
      gs.tick(AREA_BOMB_EFFECT_DURATION);
    }
    const traces = gs.getClearedTraceCells();
    expect(traces).toContainEqual([4, 5]);
    expect(traces).toContainEqual([5, 5]);
  });

  it("records cleared traces progressively for cross bomb", () => {
    const gs = new GameState(
      minimalLevel(
        [
          {
            kind: 1,
            instanceId: 1,
            layer: 2,
            direction: 3,
            colorId: 6,
            zoneId: null,
            occupiedPositions: [
              [5, 4],
              [6, 5],
            ],
          },
        ],
        {
          buffs: [
            {
              kind: 18,
              instanceId: 101,
              layer: 2,
              zoneId: null,
              occupiedPositions: [[5, 5]],
              crossArm: 2,
            },
          ],
        },
      ),
    );

    expect(gs.triggerBuff(101)).toBe(true);
    expect(gs.getClearedTraceCells()).toContainEqual([5, 5]);

    gs.tick(CROSS_WAVE_START_DELAY + 0.01);
    expect(gs.getClearedTraceCells()).toContainEqual([5, 4]);

    while (gs.getCrossBombEffectsForRender().length > 0) {
      gs.tick(CROSS_WAVE_RING_INTERVAL);
    }
    expect(gs.getClearedTraceCells()).toContainEqual([6, 5]);
  });

  it("burns and removes arrows after fire bomb effect", () => {
    const gs = new GameState(
      minimalLevel(
        [
          {
            kind: 1,
            instanceId: 1,
            layer: 2,
            direction: 3,
            colorId: 6,
            zoneId: null,
            occupiedPositions: [
              [4, 5],
              [5, 5],
              [6, 5],
            ],
          },
        ],
        {
          buffs: [
            {
              kind: 19,
              instanceId: 102,
              layer: 2,
              zoneId: null,
              occupiedPositions: [[5, 5]],
            },
          ],
        },
      ),
    );

    expect(gs.triggerBuff(102)).toBe(true);
    expect(gs.arrows.length).toBe(1);
    while (gs.getFireBombEffectsForRender().length > 0) {
      gs.tick(FIRE_CELL_BURN_DURATION);
    }
    expect(gs.arrows.length).toBe(0);
    expect(gs.getClearedTraceCells()).toContainEqual([5, 5]);
  });

  it("ignites each arrow at most once across overlapping fire bombs", () => {
    const gs = new GameState(
      minimalLevel(
        [
          {
            kind: 1,
            instanceId: 1,
            layer: 2,
            direction: 3,
            colorId: 6,
            zoneId: null,
            occupiedPositions: [
              [4, 5],
              [5, 5],
              [6, 5],
            ],
          },
        ],
        {
          buffs: [
            {
              kind: 19,
              instanceId: 101,
              layer: 2,
              zoneId: null,
              occupiedPositions: [[5, 5]],
            },
            {
              kind: 19,
              instanceId: 102,
              layer: 2,
              zoneId: null,
              occupiedPositions: [[5, 5]],
            },
          ],
        },
      ),
    );

    expect(gs.triggerBuff(101)).toBe(true);
    expect(gs.getFireBombEffectsForRender().length).toBe(1);
    gs.tick(CHAIN_TRIGGER_DELAY_SEC);
    expect(gs.getFireBombEffectsForRender().length).toBe(2);

    gs.tick(FIRE_IGNITE_BASE + 0.01);
    const burningKeys = new Set<string>();
    for (const effect of gs.getFireBombEffectsForRender()) {
      for (const cell of effect.burningCells) {
        const key = `${cell.cell[0]},${cell.cell[1]}`;
        expect(burningKeys.has(key)).toBe(false);
        burningKeys.add(key);
      }
    }
    expect(burningKeys.has("5,5")).toBe(true);
  });

  it("balloon effect removes same-color arrows after pop", () => {
    const gs = new GameState(
      minimalLevel(
        [
          {
            kind: 1,
            instanceId: 1,
            layer: 2,
            direction: 3,
            colorId: 6,
            zoneId: null,
            occupiedPositions: [
              [4, 5],
              [5, 5],
              [6, 5],
            ],
          },
        ],
        {
          buffs: [
            {
              kind: 20,
              instanceId: 102,
              layer: 2,
              zoneId: null,
              occupiedPositions: [[7, 5]],
            },
          ],
        },
      ),
    );

    expect(gs.tryLaunch(1)).toBe(true);
    while (gs.phase === "animating") {
      gs.advanceAnimation();
    }
    while (gs.getBalloonEffectForRender()) {
      gs.tick(0.05);
    }
    expect(gs.arrows.length).toBe(0);
    expect(gs.getClearedTraceCells()).toContainEqual([5, 5]);
  });

  it("triggers balloon with dominant color when area bomb region covers it", () => {
    const gs = new GameState(
      minimalLevel(
        [
          {
            kind: 1,
            instanceId: 1,
            layer: 2,
            direction: 3,
            colorId: 6,
            zoneId: null,
            occupiedPositions: [
              [0, 5],
              [1, 5],
            ],
          },
          {
            kind: 1,
            instanceId: 2,
            layer: 2,
            direction: 4,
            colorId: 6,
            zoneId: null,
            occupiedPositions: [
              [8, 5],
              [9, 5],
            ],
          },
          {
            kind: 1,
            instanceId: 3,
            layer: 2,
            direction: 3,
            colorId: 3,
            zoneId: null,
            occupiedPositions: [
              [0, 6],
              [1, 6],
            ],
          },
        ],
        {
          buffs: [
            {
              kind: 17,
              instanceId: 100,
              layer: 2,
              zoneId: null,
              occupiedPositions: [[5, 5]],
              bombRadius: 1,
            },
            {
              kind: 20,
              instanceId: 101,
              layer: 2,
              zoneId: null,
              occupiedPositions: [[6, 5]],
            },
          ],
        },
      ),
    );

    expect(gs.triggerBuff(100)).toBe(true);
    while (gs.getBalloonEffectForRender()) {
      gs.tick(0.05);
    }
    expect(gs.buffs.some((b) => b.instanceId === 101)).toBe(false);
    expect(gs.arrows.some((a) => a.colorId === 6)).toBe(false);
    expect(gs.arrows.some((a) => a.colorId === 3)).toBe(true);
  });

  it("triggers candy machine when area bomb region covers it", () => {
    const gs = new GameState(
      minimalLevel(
        [
          {
            kind: 1,
            instanceId: 1,
            layer: 2,
            direction: 3,
            colorId: 6,
            zoneId: null,
            occupiedPositions: [
              [0, 5],
              [1, 5],
            ],
          },
          {
            kind: 1,
            instanceId: 2,
            layer: 2,
            direction: 3,
            colorId: 7,
            zoneId: null,
            occupiedPositions: [
              [0, 6],
              [1, 6],
            ],
          },
        ],
        {
          buffs: [
            {
              kind: 17,
              instanceId: 100,
              layer: 2,
              zoneId: null,
              occupiedPositions: [[5, 5]],
              bombRadius: 1,
            },
            {
              kind: 23,
              instanceId: 103,
              layer: 2,
              zoneId: null,
              occupiedPositions: [[6, 5]],
            },
          ],
        },
      ),
    );

    expect(gs.triggerBuff(100)).toBe(true);
    expect(gs.buffs.some((b) => b.instanceId === 103)).toBe(false);
    expect(gs.getCandyMachineEffectsForRender().length).toBe(1);

    while (gs.getCandyMachineEffectsForRender().length > 0) {
      gs.tick(0.05);
    }
    expect(gs.arrows.length).toBe(0);
  });

  it("swallows arrow entering black hole with exit elimination credit", () => {
    const gs = new GameState(
      minimalLevel(
        [
          {
            kind: 1,
            instanceId: 1,
            layer: 2,
            direction: 3,
            colorId: 6,
            zoneId: null,
            occupiedPositions: [
              [3, 5],
              [4, 5],
              [5, 5],
            ],
          },
        ],
        {
          buffs: [
            {
              kind: 21,
              instanceId: 201,
              layer: 2,
              zoneId: null,
              occupiedPositions: [[6, 5]],
            },
          ],
        },
      ),
    );

    expect(gs.tryLaunch(1)).toBe(true);
    for (let i = 0; i < 80 && gs.arrows.length > 0; i++) {
      gs.advanceAnimation();
    }
    expect(gs.arrows.length).toBe(0);
    expect(gs.buffs.length).toBe(1);
    expect(gs.buffs[0]?.kind).toBe(21);
    expect(gs.getClearedTraceCells()).toContainEqual([5, 5]);
    expect(gs.getBlackHoleFxForRender().size).toBeGreaterThan(0);
  });

  it("black hole expires after 10 seconds with inward vanish", () => {
    const gs = new GameState(
      minimalLevel([], {
        buffs: [
          {
            kind: 21,
            instanceId: 202,
            layer: 2,
            zoneId: null,
            occupiedPositions: [[5, 5]],
          },
        ],
      }),
    );

    expect(gs.buffs.length).toBe(1);
    gs.tick(BLACK_HOLE_LIFETIME_SEC);
    expect(gs.buffs.length).toBe(1);
    gs.tick(0.02);
    const fxMid = gs.getBlackHoleFxForRender().get(202);
    expect(fxMid?.vanishProgress ?? 0).toBeGreaterThan(0);

    gs.tick(BLACK_HOLE_VANISH_DURATION);
    expect(gs.buffs.length).toBe(0);
    expect(gs.getBlackHoleFxForRender().size).toBe(0);
  });

  it("expiring black hole no longer swallows arrows", () => {
    const gs = new GameState(
      minimalLevel(
        [
          {
            kind: 1,
            instanceId: 1,
            layer: 2,
            direction: 3,
            colorId: 6,
            zoneId: null,
            occupiedPositions: [
              [3, 5],
              [4, 5],
              [5, 5],
            ],
          },
        ],
        {
          buffs: [
            {
              kind: 21,
              instanceId: 203,
              layer: 2,
              zoneId: null,
              occupiedPositions: [[6, 5]],
            },
          ],
        },
      ),
    );

    gs.tick(BLACK_HOLE_LIFETIME_SEC + 0.01);
    expect(gs.tryLaunch(1)).toBe(true);
    for (let i = 0; i < 80 && gs.phase === "animating"; i++) {
      gs.advanceAnimation();
    }
    expect(gs.arrows.length).toBe(0);
  });

  it("triggers area bomb when arrow crosses its cell during launch", () => {
    const gs = new GameState(
      minimalLevel(
        [
          {
            kind: 1,
            instanceId: 1,
            layer: 2,
            direction: 3,
            colorId: 6,
            zoneId: null,
            occupiedPositions: [
              [4, 5],
              [5, 5],
              [6, 5],
            ],
          },
        ],
        {
          buffs: [
            {
              kind: 17,
              instanceId: 100,
              layer: 2,
              zoneId: null,
              occupiedPositions: [[7, 5]],
              bombRadius: 1,
            },
          ],
        },
      ),
    );

    expect(gs.tryLaunch(1)).toBe(true);
    for (let i = 0; i < 20 && gs.getAreaBombEffectsForRender().length === 0; i++) {
      gs.advanceAnimation();
    }
    expect(gs.getAreaBombEffectsForRender().length).toBeGreaterThan(0);
    expect(gs.buffs.some((b) => b.instanceId === 100)).toBe(false);
  });

  it("triggers fire bomb when arrow crosses its cell during launch", () => {
    const gs = new GameState(
      minimalLevel(
        [
          {
            kind: 1,
            instanceId: 1,
            layer: 2,
            direction: 3,
            colorId: 6,
            zoneId: null,
            occupiedPositions: [
              [4, 5],
              [5, 5],
              [6, 5],
            ],
          },
        ],
        {
          buffs: [
            {
              kind: 19,
              instanceId: 101,
              layer: 2,
              zoneId: null,
              occupiedPositions: [[7, 5]],
            },
          ],
        },
      ),
    );

    expect(gs.tryLaunch(1)).toBe(true);
    for (let i = 0; i < 20 && gs.getFireBombEffectsForRender().length === 0; i++) {
      gs.advanceAnimation();
    }
    expect(gs.getFireBombEffectsForRender().length).toBeGreaterThan(0);
  });

  it("triggers cross bomb when arrow crosses its cell during launch", () => {
    const gs = new GameState(
      minimalLevel(
        [
          {
            kind: 1,
            instanceId: 1,
            layer: 2,
            direction: 3,
            colorId: 6,
            zoneId: null,
            occupiedPositions: [
              [4, 5],
              [5, 5],
              [6, 5],
            ],
          },
        ],
        {
          buffs: [
            {
              kind: 18,
              instanceId: 102,
              layer: 2,
              zoneId: null,
              occupiedPositions: [[7, 5]],
              crossArm: 2,
            },
          ],
        },
      ),
    );

    expect(gs.tryLaunch(1)).toBe(true);
    for (let i = 0; i < 20 && gs.getCrossBombEffectsForRender().length === 0; i++) {
      gs.advanceAnimation();
    }
    expect(gs.getCrossBombEffectsForRender().length).toBeGreaterThan(0);
  });

  it("triggers all explosive buffs when arrow crosses multiple bombs", () => {
    const gs = new GameState(
      minimalLevel(
        [
          {
            kind: 1,
            instanceId: 1,
            layer: 2,
            direction: 3,
            colorId: 6,
            zoneId: null,
            occupiedPositions: [
              [3, 5],
              [4, 5],
              [5, 5],
            ],
          },
        ],
        {
          buffs: [
            {
              kind: 17,
              instanceId: 100,
              layer: 2,
              zoneId: null,
              occupiedPositions: [[6, 5]],
              bombRadius: 1,
            },
            {
              kind: 17,
              instanceId: 101,
              layer: 2,
              zoneId: null,
              occupiedPositions: [[7, 5]],
              bombRadius: 1,
            },
            {
              kind: 17,
              instanceId: 102,
              layer: 2,
              zoneId: null,
              occupiedPositions: [[8, 5]],
              bombRadius: 1,
            },
          ],
        },
      ),
    );

    expect(gs.tryLaunch(1)).toBe(true);
    let maxConcurrent = 0;
    for (let i = 0; i < 500; i++) {
      gs.advanceAnimation();
      gs.tick(0.016);
      maxConcurrent = Math.max(
        maxConcurrent,
        gs.getAreaBombEffectsForRender().length,
      );
      if (
        gs.buffs.length === 0 &&
        gs.getAreaBombEffectsForRender().length === 0
      ) {
        break;
      }
    }
    expect(maxConcurrent).toBeGreaterThanOrEqual(2);
    expect(gs.buffs.some((b) => b.instanceId === 100)).toBe(false);
    expect(gs.buffs.some((b) => b.instanceId === 101)).toBe(false);
    expect(gs.buffs.some((b) => b.instanceId === 102)).toBe(false);
  });

  it("chains explosive buffs in effect region after 0.5s delay", () => {
    const gs = new GameState(
      minimalLevel([], {
        buffs: [
          {
            kind: 17,
            instanceId: 100,
            layer: 2,
            zoneId: null,
            occupiedPositions: [[5, 5]],
            bombRadius: 1,
          },
          {
            kind: 17,
            instanceId: 101,
            layer: 2,
            zoneId: null,
            occupiedPositions: [[6, 5]],
            bombRadius: 1,
          },
        ],
      }),
    );

    expect(gs.triggerBuff(100)).toBe(true);
    expect(gs.getAreaBombEffectsForRender().length).toBe(1);
    expect(gs.buffs.some((b) => b.instanceId === 101)).toBe(true);

    gs.tick(CHAIN_TRIGGER_DELAY_SEC - 0.01);
    expect(gs.buffs.some((b) => b.instanceId === 101)).toBe(true);

    gs.tick(0.02);
    expect(gs.buffs.some((b) => b.instanceId === 101)).toBe(false);
    expect(gs.getAreaBombEffectsForRender().length).toBe(2);
  });

  it("chains explosive buffs recursively across multiple hops", () => {
    const gs = new GameState(
      minimalLevel([], {
        buffs: [
          {
            kind: 17,
            instanceId: 100,
            layer: 2,
            zoneId: null,
            occupiedPositions: [[5, 5]],
            bombRadius: 1,
          },
          {
            kind: 17,
            instanceId: 101,
            layer: 2,
            zoneId: null,
            occupiedPositions: [[6, 5]],
            bombRadius: 1,
          },
          {
            kind: 19,
            instanceId: 102,
            layer: 2,
            zoneId: null,
            occupiedPositions: [[7, 5]],
          },
        ],
      }),
    );

    expect(gs.triggerBuff(100)).toBe(true);
    gs.tick(CHAIN_TRIGGER_DELAY_SEC);
    expect(gs.buffs.some((b) => b.instanceId === 101)).toBe(false);
    expect(gs.buffs.some((b) => b.instanceId === 102)).toBe(true);
    expect(gs.getAreaBombEffectsForRender().length).toBe(2);

    gs.tick(CHAIN_TRIGGER_DELAY_SEC);
    expect(gs.buffs.some((b) => b.instanceId === 102)).toBe(false);
    expect(gs.getFireBombEffectsForRender().length).toBe(1);
  });

  it("flip button click flips half of board arrows and removes buff", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const gs = new GameState(
      minimalLevel(
        [
          {
            kind: 2,
            instanceId: 1,
            layer: 2,
            direction: 3,
            direction1: 3,
            direction2: 4,
            colorId: 7,
            zoneId: null,
            occupiedPositions: [
              [3, 5],
              [4, 5],
              [5, 5],
            ],
          },
          {
            kind: 1,
            instanceId: 2,
            layer: 2,
            direction: 1,
            colorId: 6,
            zoneId: null,
            occupiedPositions: [
              [7, 5],
              [7, 6],
            ],
          },
        ],
        {
          buffs: [
            {
              kind: 22,
              instanceId: 102,
              layer: 2,
              zoneId: null,
              occupiedPositions: [[5, 7]],
            },
          ],
        },
      ),
    );

    expect(gs.triggerBuff(102)).toBe(true);
    expect(gs.buffs.length).toBe(0);
    expect(gs.arrows[0]!.direction).toBe(3);
    expect(gs.arrows[0]!.occupiedPositions[0]).toEqual([3, 5]);
    expect(gs.arrows[1]!.direction).toBe(2);
    expect(gs.arrows[1]!.occupiedPositions[0]).toEqual([7, 6]);
    randomSpy.mockRestore();
  });

  it("flip button triggers when arrow crosses its cell", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const gs = new GameState(
      minimalLevel(
        [
          {
            kind: 1,
            instanceId: 1,
            layer: 2,
            direction: 3,
            colorId: 6,
            zoneId: null,
            occupiedPositions: [
              [4, 5],
              [5, 5],
              [6, 5],
            ],
          },
          {
            kind: 2,
            instanceId: 2,
            layer: 2,
            direction: 3,
            direction1: 3,
            direction2: 4,
            colorId: 7,
            zoneId: null,
            occupiedPositions: [
              [1, 1],
              [2, 1],
              [3, 1],
            ],
          },
        ],
        {
          buffs: [
            {
              kind: 22,
              instanceId: 102,
              layer: 2,
              zoneId: null,
              occupiedPositions: [[7, 5]],
            },
          ],
        },
      ),
    );

    expect(gs.tryLaunch(1)).toBe(true);
    for (let i = 0; i < 20 && gs.buffs.some((b) => b.instanceId === 102); i++) {
      gs.advanceAnimation();
    }

    expect(gs.buffs.length).toBe(0);
    const flipped = gs.arrows.find((a) => a.instanceId === 2);
    expect(flipped?.direction).toBe(4);
    expect(flipped?.occupiedPositions[0]).toEqual([3, 1]);
    randomSpy.mockRestore();
  });

  it("flip button defers flip until arrow finishes moving after crossing", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const gs = new GameState(
      minimalLevel(
        [
          {
            kind: 1,
            instanceId: 1,
            layer: 2,
            direction: 3,
            colorId: 6,
            zoneId: null,
            occupiedPositions: [
              [4, 5],
              [5, 5],
              [6, 5],
            ],
          },
          {
            kind: 2,
            instanceId: 2,
            layer: 2,
            direction: 3,
            direction1: 3,
            direction2: 4,
            colorId: 7,
            zoneId: null,
            occupiedPositions: [
              [1, 1],
              [2, 1],
              [3, 1],
            ],
          },
        ],
        {
          buffs: [
            {
              kind: 22,
              instanceId: 102,
              layer: 2,
              zoneId: null,
              occupiedPositions: [[7, 5]],
            },
          ],
        },
      ),
    );

    expect(gs.tryLaunch(1)).toBe(true);
    for (let i = 0; i < 3 && gs.phase === "animating"; i++) {
      gs.advanceAnimation();
    }

    expect(gs.buffs.some((b) => b.instanceId === 102)).toBe(true);
    expect(gs.arrows.find((a) => a.instanceId === 2)?.direction).toBe(3);

    while (gs.phase === "animating") {
      gs.advanceAnimation();
    }

    expect(gs.buffs.length).toBe(0);
    expect(gs.arrows.find((a) => a.instanceId === 2)?.direction).toBe(4);
    randomSpy.mockRestore();
  });

  it("candy machine click removes up to eight targeted arrows", () => {
    const arrows = Array.from({ length: 10 }, (_, i) => ({
      kind: 1 as const,
      instanceId: i + 1,
      layer: 2,
      direction: 3 as const,
      colorId: 6,
      zoneId: null,
      occupiedPositions: [
        [2, i],
        [2, i + 1],
      ] as [number, number][],
    }));
    const gs = new GameState(
      minimalLevel(arrows, {
        buffs: [
          {
            kind: 23,
            instanceId: 103,
            layer: 2,
            zoneId: null,
            occupiedPositions: [[5, 7]],
          },
        ],
      }),
    );

    expect(gs.triggerBuff(103)).toBe(true);
    expect(gs.buffs.length).toBe(0);
    expect(gs.getCandyMachineEffectsForRender().length).toBe(1);

    let steps = 0;
    while (gs.getCandyMachineEffectsForRender().length > 0 && steps < 600) {
      gs.tick(0.05);
      steps++;
    }

    expect(gs.getCandyMachineEffectsForRender().length).toBe(0);
    expect(gs.arrows.length).toBe(2);
  });

  it("flip button triggers after bump return when arrow crosses its cell", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const gs = new GameState(
      minimalLevel(
        [
          {
            kind: 1,
            instanceId: 1,
            layer: 2,
            direction: 3,
            colorId: 6,
            zoneId: null,
            occupiedPositions: [
              [1, 4],
              [2, 4],
            ],
          },
          {
            kind: 1,
            instanceId: 3,
            layer: 2,
            direction: 3,
            colorId: 3,
            zoneId: null,
            occupiedPositions: [
              [5, 4],
              [6, 4],
            ],
          },
          {
            kind: 2,
            instanceId: 2,
            layer: 2,
            direction: 3,
            direction1: 3,
            direction2: 4,
            colorId: 7,
            zoneId: null,
            occupiedPositions: [
              [1, 1],
              [2, 1],
              [3, 1],
            ],
          },
        ],
        {
          buffs: [
            {
              kind: 22,
              instanceId: 102,
              layer: 2,
              zoneId: null,
              occupiedPositions: [[4, 4]],
            },
          ],
        },
      ),
    );

    expect(gs.tryLaunch(1)).toBe(true);
    for (let i = 0; i < 4 && gs.phase === "animating"; i++) {
      gs.advanceAnimation();
    }

    expect(gs.buffs.some((b) => b.instanceId === 102)).toBe(true);
    expect(gs.arrows.find((a) => a.instanceId === 2)?.direction).toBe(3);

    while (gs.phase === "animating") {
      gs.advanceAnimation();
    }

    expect(gs.buffs.length).toBe(0);
    expect(gs.arrows.find((a) => a.instanceId === 2)?.direction).toBe(4);
    const launcher = gs.arrows.find((a) => a.instanceId === 1);
    expect(launcher?.direction).toBe(3);
    expect(launcher?.occupiedPositions).toEqual([
      [1, 4],
      [2, 4],
    ]);
    expect(gs.arrows.some((a) => a.instanceId === 1)).toBe(true);
    randomSpy.mockRestore();
  });

  it("auto-refreshes by flipping half the arrows when board is stalemate in rush mode", () => {
    const gs = new GameState(
      minimalLevel(
        [
          {
            kind: 2,
            instanceId: 1,
            layer: 2,
            direction: 3,
            direction1: 3,
            direction2: 4,
            colorId: 7,
            zoneId: null,
            occupiedPositions: [
              [3, 5],
              [4, 5],
              [5, 5],
            ],
          },
          {
            kind: 2,
            instanceId: 2,
            layer: 2,
            direction: 4,
            direction1: 3,
            direction2: 4,
            colorId: 6,
            zoneId: null,
            occupiedPositions: [
              [6, 5],
              [7, 5],
              [8, 5],
            ],
          },
        ],
        { gameMode: "rush" },
      ),
    );

    expect(gs.getLaunchableIds().size).toBe(0);
    const before = gs.arrows.map((a) => ({
      id: a.instanceId,
      dir: a.direction,
      head: a.occupiedPositions.at(-1),
    }));
    expect(gs.checkAndAutoRefreshBoard()).toBe(true);
    expect(gs.getAutoRefreshEffectForRender()).not.toBeNull();
    expect(before).toEqual(
      gs.arrows.map((a) => ({
        id: a.instanceId,
        dir: a.direction,
        head: a.occupiedPositions.at(-1),
      })),
    );
    gs.tick(2);
    const after = gs.arrows.map((a) => ({
      id: a.instanceId,
      dir: a.direction,
      head: a.occupiedPositions.at(-1),
    }));
    const changed = before.filter((b, i) => {
      const a = after[i]!;
      return b.dir !== a.dir || b.head?.[0] !== a.head?.[0] || b.head?.[1] !== a.head?.[1];
    });
    expect(changed.length).toBe(1);
  });

  it("does not auto-refresh stalemate board in classic mode", () => {
    const gs = new GameState(
      minimalLevel(
        [
          {
            kind: 2,
            instanceId: 1,
            layer: 2,
            direction: 3,
            direction1: 3,
            direction2: 4,
            colorId: 7,
            zoneId: null,
            occupiedPositions: [
              [3, 5],
              [4, 5],
              [5, 5],
            ],
          },
          {
            kind: 2,
            instanceId: 2,
            layer: 2,
            direction: 4,
            direction1: 3,
            direction2: 4,
            colorId: 6,
            zoneId: null,
            occupiedPositions: [
              [6, 5],
              [7, 5],
              [8, 5],
            ],
          },
        ],
      ),
    );

    expect(gs.getLaunchableIds().size).toBe(0);
    expect(gs.checkAndAutoRefreshBoard()).toBe(false);
    expect(gs.getAutoRefreshEffectForRender()).toBeNull();
  });

  it("damages launching arrow at original cells when blast overlaps origin", () => {
    const gs = new GameState(
      minimalLevel(
        [
          {
            kind: 1,
            instanceId: 1,
            layer: 2,
            direction: 3,
            colorId: 6,
            zoneId: null,
            occupiedPositions: [
              [3, 5],
              [4, 5],
              [5, 5],
            ],
          },
          {
            kind: 1,
            instanceId: 2,
            layer: 2,
            direction: 3,
            colorId: 3,
            zoneId: null,
            occupiedPositions: [
              [7, 5],
              [8, 5],
            ],
          },
        ],
        {
          buffs: [
            {
              kind: 17,
              instanceId: 100,
              layer: 2,
              zoneId: null,
              occupiedPositions: [[6, 5]],
              bombRadius: 1,
            },
          ],
        },
      ),
    );

    expect(gs.tryLaunch(1)).toBe(true);
    for (let i = 0; i < 30 && gs.getAreaBombEffectsForRender().length === 0; i++) {
      gs.advanceAnimation();
    }
    expect(gs.getAreaBombEffectsForRender().length).toBeGreaterThan(0);
    gs.tick(AREA_BOMB_EFFECT_DURATION + 0.05);

    while (gs.phase === "animating") {
      gs.advanceAnimation();
    }

    const survivor = gs.arrows.find(
      (a) =>
        a.occupiedPositions.length === 2 &&
        a.occupiedPositions[0]?.[0] === 3 &&
        a.occupiedPositions[1]?.[0] === 4,
    );
    expect(survivor?.occupiedPositions).toEqual([
      [3, 5],
      [4, 5],
    ]);
  });

  it("triggers multiple balloons in region sequentially by distance with ranked colors", () => {
    const gs = new GameState(
      minimalLevel(
        [
          {
            kind: 1,
            instanceId: 1,
            layer: 2,
            direction: 3,
            colorId: 6,
            zoneId: null,
            occupiedPositions: [[0, 5], [1, 5]],
          },
          {
            kind: 1,
            instanceId: 2,
            layer: 2,
            direction: 4,
            colorId: 6,
            zoneId: null,
            occupiedPositions: [[9, 5], [8, 5]],
          },
          {
            kind: 1,
            instanceId: 3,
            layer: 2,
            direction: 3,
            colorId: 3,
            zoneId: null,
            occupiedPositions: [[0, 6], [1, 6]],
          },
        ],
        {
          buffs: [
            {
              kind: 17,
              instanceId: 100,
              layer: 2,
              zoneId: null,
              occupiedPositions: [[5, 5]],
              bombRadius: 2,
            },
            {
              kind: 20,
              instanceId: 101,
              layer: 2,
              zoneId: null,
              occupiedPositions: [[6, 5]],
            },
            {
              kind: 20,
              instanceId: 102,
              layer: 2,
              zoneId: null,
              occupiedPositions: [[5, 7]],
            },
          ],
        },
      ),
    );

    expect(gs.triggerBuff(100)).toBe(true);
    expect(gs.buffs.some((b) => b.instanceId === 101)).toBe(false);
    expect(gs.buffs.some((b) => b.instanceId === 102)).toBe(true);
    expect(gs.getWaitingBalloonsForRender()).toHaveLength(1);
    expect(gs.getWaitingBalloonsForRender()[0]?.cell).toEqual([5, 7]);

    while (gs.getBalloonEffectsForRender().length > 0) {
      gs.tick(0.05);
    }
    expect(gs.arrows.some((a) => a.colorId === 6)).toBe(false);

    gs.tick(CHAIN_TRIGGER_DELAY_SEC);
    while (gs.getBalloonEffectsForRender().length > 0) {
      gs.tick(0.05);
    }

    expect(gs.buffs.some((b) => b.instanceId === 102)).toBe(false);
    expect(gs.arrows.some((a) => a.colorId === 3)).toBe(false);
  });

  it("fires all queued balloons during continuous frame ticks without extra manual delay", () => {
    const gs = new GameState(
      minimalLevel(
        [
          {
            kind: 1,
            instanceId: 1,
            layer: 2,
            direction: 3,
            colorId: 6,
            zoneId: null,
            occupiedPositions: [[0, 5], [1, 5]],
          },
          {
            kind: 1,
            instanceId: 2,
            layer: 2,
            direction: 4,
            colorId: 3,
            zoneId: null,
            occupiedPositions: [[9, 5], [8, 5]],
          },
          {
            kind: 1,
            instanceId: 3,
            layer: 2,
            direction: 3,
            colorId: 7,
            zoneId: null,
            occupiedPositions: [[0, 6], [1, 6]],
          },
        ],
        {
          buffs: [
            {
              kind: 17,
              instanceId: 100,
              layer: 2,
              zoneId: null,
              occupiedPositions: [[5, 5]],
              bombRadius: 2,
            },
            {
              kind: 20,
              instanceId: 101,
              layer: 2,
              zoneId: null,
              occupiedPositions: [[6, 5]],
            },
            {
              kind: 20,
              instanceId: 102,
              layer: 2,
              zoneId: null,
              occupiedPositions: [[5, 7]],
            },
            {
              kind: 20,
              instanceId: 103,
              layer: 2,
              zoneId: null,
              occupiedPositions: [[5, 6]],
            },
          ],
        },
      ),
    );

    expect(gs.triggerBuff(100)).toBe(true);
    expect(gs.getWaitingBalloonsForRender()).toHaveLength(2);

    for (let t = 0; t < 3.5; t += 1 / 60) {
      gs.tick(1 / 60);
    }

    expect(gs.buffs.some((b) => b.instanceId === 101)).toBe(false);
    expect(gs.buffs.some((b) => b.instanceId === 102)).toBe(false);
    expect(gs.buffs.some((b) => b.instanceId === 103)).toBe(false);
    expect(gs.getWaitingBalloonsForRender()).toHaveLength(0);
    expect(gs.arrows.length).toBe(0);
  });
});
