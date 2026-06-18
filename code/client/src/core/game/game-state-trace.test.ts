import { describe, expect, it } from "vitest";
import { GameState } from "./game-state.ts";
import type { GameLevel } from "../types.ts";

function minimalLevel(arrows: GameLevel["arrows"]): GameLevel {
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
});
