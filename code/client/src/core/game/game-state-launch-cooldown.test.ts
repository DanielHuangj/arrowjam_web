import { describe, expect, it } from "vitest";
import { parseLevelData } from "../level/parser.ts";
import { GameState, LAUNCH_CLICK_COOLDOWN_MS } from "./game-state.ts";

function simpleLevel() {
  return parseLevelData(1, {
    width: 8,
    height: 8,
    name: "launch cooldown",
    durationInSec: 120,
    difficulty: 1,
    itemModels: [
      {
        kind: 1,
        instanceId: 1,
        layer: 2,
        direction: 3,
        colorId: 1,
        occupiedPositions: [
          [0, 3],
          [1, 3],
        ],
      },
      {
        kind: 1,
        instanceId: 2,
        layer: 2,
        direction: 4,
        colorId: 2,
        occupiedPositions: [
          [6, 3],
          [7, 3],
        ],
      },
    ],
  });
}

describe("GameState launch click cooldown", () => {
  it("blocks second launch within cooldown while first is still animating", () => {
    const gs = new GameState(simpleLevel());
    expect(gs.tryLaunch(1, 1000)).toBe(true);
    expect(gs.phase).toBe("animating");
    expect(gs.tryLaunch(2, 1100)).toBe(false);
    expect(gs.tryLaunch(2, 1000 + LAUNCH_CLICK_COOLDOWN_MS)).toBe(true);
    expect(gs.animations.length).toBe(2);
  });

  it("second arrow on same path exits while first is still flying", () => {
    const level = parseLevelData(1, {
      width: 8,
      height: 8,
      name: "same path",
      durationInSec: 120,
      difficulty: 1,
      itemModels: [
        {
          kind: 1,
          instanceId: 1,
          layer: 2,
          direction: 3,
          colorId: 1,
          occupiedPositions: [
            [0, 3],
            [1, 3],
          ],
        },
        {
          kind: 1,
          instanceId: 2,
          layer: 2,
          direction: 3,
          colorId: 2,
          occupiedPositions: [
            [2, 3],
            [3, 3],
          ],
        },
      ],
    });
    const gs = new GameState(level);
    expect(gs.tryLaunch(2, 0)).toBe(true);
    expect(gs.tryLaunch(1, LAUNCH_CLICK_COOLDOWN_MS)).toBe(true);
    expect(gs.animations[0]!.mode).toBe("exit");
    expect(gs.animations[1]!.mode).toBe("exit");
    for (let i = 0; i < 10; i++) {
      gs.advanceAnimation();
    }
    expect(gs.animations.every((a) => a.mode === "exit")).toBe(true);
  });

  it("allows second launch immediately after first animation completes", () => {
    const gs = new GameState(simpleLevel());
    expect(gs.tryLaunch(1, 0)).toBe(true);
    while (gs.phase === "animating" && gs.animations.length > 0) {
      gs.advanceAnimation();
    }
    expect(gs.tryLaunch(2, 1)).toBe(true);
  });
});
