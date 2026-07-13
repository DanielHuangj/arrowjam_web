import { describe, expect, it } from "vitest";
import {
  configFromSpeeds,
  initialSpeedCellsPerSec,
  maxSpeedCellsPerSec,
} from "./anim-timing-config.ts";

describe("configFromSpeeds", () => {
  it("maps display speeds to internal config", () => {
    const config = configFromSpeeds(25, 100, 12);
    expect(config.baseIntervalMs).toBe(40);
    expect(config.maxSpeedMultiplier).toBe(4);
    expect(config.accelSteps).toBe(12);
    expect(initialSpeedCellsPerSec(config)).toBe(25);
    expect(maxSpeedCellsPerSec(config)).toBe(100);
  });

  it("clamps max speed to not fall below initial speed", () => {
    const config = configFromSpeeds(30, 10, 8);
    expect(maxSpeedCellsPerSec(config)).toBeGreaterThanOrEqual(30);
  });
});
