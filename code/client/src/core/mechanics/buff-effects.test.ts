import { describe, expect, it } from "vitest";
import {
  buildFireSpreadSchedule,
  computeBalloonEffectTiming,
  computeCandyShotArrowTiming,
  candyShotFlightProgress,
  assignCandyShotLaunchDelays,
  crossBombEffectTotalDuration,
  crossBombWaveStartTime,
  crossCellsByRing,
  CROSS_BOMB_PRIMED_DURATION,
  CROSS_CELL_BLAST_DURATION,
  CROSS_WAVE_RING_INTERVAL,
  CROSS_WAVE_START_DELAY,
  FIRE_BURST_DURATION,
  FIRE_CELL_BURN_DURATION,
  FIRE_IGNITE_BASE,
  FIRE_SPREAD_INTERVAL,
  maskArrowsForDestroyedCells,
  type BalloonEffectState,
} from "./buff-effects.ts";
import type { ArrowItem } from "../types.ts";

describe("crossCellsByRing", () => {
  it("orders rings from center outward", () => {
    const rings = crossCellsByRing([5, 5], 2, 10, 10);
    expect(rings[0]).toEqual([[5, 5]]);
    expect(rings[1]).toEqual([
      [5, 4],
      [6, 5],
      [5, 6],
      [4, 5],
    ]);
    expect(rings[2]).toEqual([
      [5, 3],
      [7, 5],
      [5, 7],
      [3, 5],
    ]);
  });
});

describe("buildFireSpreadSchedule", () => {
  const arrow: ArrowItem = {
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
      [7, 5],
    ],
  };

  it("spreads along arrow from region hit outward", () => {
    const region = [
      [4, 4],
      [5, 4],
      [6, 4],
      [4, 5],
      [5, 5],
      [6, 5],
      [4, 6],
      [5, 6],
      [6, 6],
    ] as [number, number][];
    const { schedules, affectedArrowIds } = buildFireSpreadSchedule(
      [arrow],
      region,
      [5, 5],
    );
    expect(affectedArrowIds.has(1)).toBe(true);
    const byKey = new Map(
      schedules.map((s) => [`${s.cell[0]},${s.cell[1]}`, s.igniteAt]),
    );
    expect(byKey.get("5,5")).toBe(FIRE_IGNITE_BASE);
    expect(byKey.get("4,5")).toBe(FIRE_IGNITE_BASE + FIRE_SPREAD_INTERVAL);
    expect(byKey.get("7,5")).toBe(FIRE_IGNITE_BASE + 2 * FIRE_SPREAD_INTERVAL);
  });

  it("skips arrows already ignited by another fire bomb", () => {
    const region = [
      [4, 4],
      [5, 4],
      [6, 4],
      [4, 5],
      [5, 5],
      [6, 5],
      [4, 6],
      [5, 6],
      [6, 6],
    ] as [number, number][];
    const first = buildFireSpreadSchedule([arrow], region, [5, 5]);
    const second = buildFireSpreadSchedule(
      [arrow],
      region,
      [5, 5],
      first.affectedArrowIds,
    );
    expect(first.schedules.some((s) => s.arrowId === 1)).toBe(true);
    expect(second.schedules.some((s) => s.arrowId === 1)).toBe(false);
    expect(second.affectedArrowIds.has(1)).toBe(false);
  });
});

describe("crossBombWaveStartTime", () => {
  it("starts first wave ring shortly after bomb detonation", () => {
    expect(crossBombWaveStartTime(0)).toBe(0);
    expect(crossBombWaveStartTime(1)).toBe(CROSS_WAVE_START_DELAY);
    expect(crossBombWaveStartTime(2)).toBe(
      CROSS_WAVE_START_DELAY + CROSS_WAVE_RING_INTERVAL,
    );
  });
});

describe("crossBombEffectTotalDuration", () => {
  it("covers primed, wave rings, and cell blast tail", () => {
    expect(crossBombEffectTotalDuration(3)).toBe(
      Math.max(CROSS_BOMB_PRIMED_DURATION, crossBombWaveStartTime(2)) +
        CROSS_CELL_BLAST_DURATION,
    );
  });
});

describe("maskArrowsForDestroyedCells", () => {
  it("keeps disconnected segments separate instead of reconnecting", () => {
    const arrow: ArrowItem = {
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
        [6, 5],
        [7, 5],
      ],
    };
    const hidden = new Set(["5,5"]);
    const masked = maskArrowsForDestroyedCells([arrow], hidden);
    expect(masked).toHaveLength(2);
    expect(masked[0]!.occupiedPositions).toEqual([
      [3, 5],
      [4, 5],
    ]);
    expect(masked[1]!.occupiedPositions).toEqual([
      [6, 5],
      [7, 5],
    ]);
  });
});

describe("computeBalloonEffectTiming", () => {
  it("waits for color and arrow return before inflate", () => {
    const base: BalloonEffectState = {
      cell: [5, 5],
      colorId: 3,
      elapsed: 0.6,
      affectedArrowIds: new Set([1]),
      requireArrowReturn: true,
      arrowReturnElapsed: null,
      hitArrowInstanceId: 1,
    };
    expect(computeBalloonEffectTiming(base).inflateProgress).toBe(0);

    const ready = { ...base, arrowReturnElapsed: 0.58 };
    expect(computeBalloonEffectTiming(ready).inflateProgress).toBeGreaterThan(0);
  });
});

describe("candyShotFlightProgress", () => {
  it("respects launch delay before flying", () => {
    const shot = {
      targetCell: [5, 5] as [number, number],
      targetArrowId: 1,
      colorId: 3,
      flightDuration: 0.5,
      launchAt: 0.2,
      arrivedAt: null,
    };
    expect(candyShotFlightProgress(shot, 0.1)).toBe(0);
    expect(candyShotFlightProgress(shot, 0.45)).toBeCloseTo(0.5, 5);
  });

  it("assigns increasing launch delays", () => {
    const shots = [
      {
        targetCell: [1, 1] as [number, number],
        targetArrowId: 1,
        colorId: 1,
        flightDuration: 0.3,
        launchAt: 0,
        arrivedAt: null,
      },
      {
        targetCell: [2, 2] as [number, number],
        targetArrowId: 2,
        colorId: 2,
        flightDuration: 0.3,
        launchAt: 0,
        arrivedAt: null,
      },
    ];
    assignCandyShotLaunchDelays(shots);
    expect(shots[0]!.launchAt).toBe(0);
    expect(shots[1]!.launchAt).toBeGreaterThan(0);
  });
});

describe("computeCandyShotArrowTiming", () => {
  it("starts inflate after candy arrives", () => {
    const shot = {
      targetCell: [5, 5] as [number, number],
      targetArrowId: 1,
      colorId: 3,
      flightDuration: 0.4,
      launchAt: 0,
      arrivedAt: 0.4,
    };
    expect(computeCandyShotArrowTiming(shot, 0.5)?.inflate).toBeGreaterThan(0);
    expect(computeCandyShotArrowTiming(shot, 0.35)).toBeNull();
  });
});
