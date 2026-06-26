import { describe, expect, it } from "vitest";
import {
  ANIM_BASE_INTERVAL_MS,
  ANIM_MAX_SPEED_MULTIPLIER,
  getAnimStepIntervalMs,
} from "./anim-timing.ts";

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
