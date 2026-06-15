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
});
