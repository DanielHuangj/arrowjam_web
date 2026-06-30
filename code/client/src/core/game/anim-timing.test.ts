import { describe, expect, it } from "vitest";
import { parseLevelData } from "../level/parser.ts";
import {
  ANIM_BASE_INTERVAL_MS,
  ANIM_MAX_SPEED_MULTIPLIER,
  getAnimStepIntervalMs,
  tickGameAnimation,
} from "./anim-timing.ts";
import { GameState } from "./game-state.ts";

describe("getAnimStepIntervalMs", () => {
  it("uses base interval at flight start", () => {
    expect(getAnimStepIntervalMs(0, "exit", false)).toBe(ANIM_BASE_INTERVAL_MS);
  });

  it("accelerates linearly and caps at max speed", () => {
    const mid = getAnimStepIntervalMs(6, "exit", false);
    const max = getAnimStepIntervalMs(12, "exit", false);
    const over = getAnimStepIntervalMs(99, "exit", false);

    expect(mid).toBeLessThan(ANIM_BASE_INTERVAL_MS);
    expect(max).toBe(ANIM_BASE_INTERVAL_MS / ANIM_MAX_SPEED_MULTIPLIER);
    expect(over).toBe(max);
  });

  it("keeps vanish and bump-reverse at base speed", () => {
    expect(getAnimStepIntervalMs(20, "vanish", false)).toBe(
      ANIM_BASE_INTERVAL_MS,
    );
    expect(getAnimStepIntervalMs(20, "bump", true)).toBe(ANIM_BASE_INTERVAL_MS);
  });

  it("accelerates bump forward flight", () => {
    expect(getAnimStepIntervalMs(8, "bump", false)).toBeLessThan(
      ANIM_BASE_INTERVAL_MS,
    );
  });
});

describe("tickGameAnimation", () => {
  it("advances concurrent launches at independent rates", () => {
    const level = parseLevelData(1, {
      width: 8,
      height: 8,
      name: "dual speed",
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
    const gs = new GameState(level);
    gs.tryLaunch(1, 0);
    gs.animations[0]!.flightStepCount = 12;
    gs.animations[0]!.stepAccumMs = 0;
    gs.tryLaunch(2, 200);

    const fastBefore = gs.animations[0]!.flightStepCount;
    tickGameAnimation(gs, ANIM_BASE_INTERVAL_MS);
    expect(gs.animations[0]!.flightStepCount).toBeGreaterThan(fastBefore);
    expect(gs.animations[1]!.flightStepCount).toBeLessThan(
      gs.animations[0]!.flightStepCount - fastBefore + 1,
    );
  });
});
