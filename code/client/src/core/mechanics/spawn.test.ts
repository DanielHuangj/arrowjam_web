import { describe, expect, it } from "vitest";
import { SPAWN_WEIGHT_TOTAL } from "@arrowjaw/shared";
import {
  adjustSpawnWeights,
  areArrowsFacingOpposite,
  computeSpawnEmergence,
  flipArrowDirection2,
  pickRandomPolyline,
  runSpawnWave,
  spawnPoolForPick,
  resolveSpawnColorId,
  SPAWN_ARROW_COLOR_IDS,
  SpawnManager,
} from "./spawn.ts";
import type { ArrowItem, GameLevel, SpawnPoolEntry } from "../types.ts";
import type { SpawnBlockContext } from "./spawn.ts";
import { vecKey } from "../types.ts";

const basePool: SpawnPoolEntry[] = [
  { kind: 1, weight: 500, colorId: 7 },
  { kind: 1, weight: 300, colorId: 3 },
  { kind: 4, weight: 200 },
];

function emptyCtx(width: number, height: number): SpawnBlockContext {
  return {
    width,
    height,
    occupied: new Set(),
    curtainCells: new Set(),
    spawnableZoneCells: null,
  };
}

function rushLevel(spawnPool: SpawnPoolEntry[], width = 10, height = 10): GameLevel {
  return {
    id: 9030,
    width,
    height,
    name: "t",
    durationInSec: 60,
    difficulty: 1,
    gameMode: "rush",
    spawnPool,
    arrows: [],
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
  };
}

describe("adjustSpawnWeights", () => {
  const pool: SpawnPoolEntry[] = [
    { kind: 1, weight: 400, colorId: 7 },
    { kind: 4, weight: 400 },
    { kind: 17, weight: 100, bombRadius: 1 },
    { kind: 20, weight: 100 },
  ];

  it("keeps original weights for 0-30 eliminated cells", () => {
    const adjusted = adjustSpawnWeights(pool, 30);
    expect(adjusted).toEqual(pool);
  });

  it("splits buff delta evenly before normalization", () => {
    const pool: SpawnPoolEntry[] = [
      { kind: 1, weight: 920, colorId: 7 },
      { kind: 17, weight: 10, bombRadius: 1 },
      { kind: 20, weight: 10 },
      { kind: 20, weight: 10 },
      { kind: 20, weight: 10 },
      { kind: 20, weight: 10 },
    ];
    const custom = [
      { minElimCells: 0, buffDelta: 0, arrowDelta: 0, mechDelta: 0 },
      { minElimCells: 1, buffDelta: 100, arrowDelta: 0, mechDelta: 0 },
    ];
    const adjusted = adjustSpawnWeights(pool, 10, custom);
    const buffs = adjusted.filter((e) => e.kind >= 17);
    expect(buffs).toHaveLength(5);
    for (const b of buffs) {
      expect(b.weight).toBeGreaterThan(10);
    }
  });

  it("increases buff weight at mid tier for 31-60 cells", () => {
    const adjusted = adjustSpawnWeights(pool, 45);
    const buffSum = adjusted
      .filter((e) => e.kind >= 17)
      .reduce((s, e) => s + e.weight, 0);
    expect(buffSum).toBeGreaterThan(200);
    const total = adjusted.reduce((s, e) => s + e.weight, 0);
    expect(Math.abs(total - SPAWN_WEIGHT_TOTAL)).toBeLessThan(0.2);
  });

  it("increases buff weight by 20% tier above 60 cells", () => {
    const mid = adjustSpawnWeights(pool, 45);
    const high = adjustSpawnWeights(pool, 65);
    const midBuff = mid.filter((e) => e.kind >= 17).reduce((s, e) => s + e.weight, 0);
    const highBuff = high.filter((e) => e.kind >= 17).reduce((s, e) => s + e.weight, 0);
    expect(highBuff).toBeGreaterThan(midBuff);
  });
});

describe("spawnPoolForPick", () => {
  it("uses boosted weights until first buff spawns in wave", () => {
    const base: SpawnPoolEntry[] = [
      { kind: 1, weight: 900, colorId: 7 },
      { kind: 17, weight: 100, bombRadius: 1 },
    ];
    const boosted = spawnPoolForPick(base, 55, false);
    const reverted = spawnPoolForPick(base, 55, true);
    const boostedBuff = boosted.find((e) => e.kind === 17)!.weight;
    const revertedBuff = reverted.find((e) => e.kind === 17)!.weight;
    expect(boostedBuff).toBeGreaterThan(100);
    expect(revertedBuff).toBe(100);
  });
});

describe("pickRandomPolyline", () => {
  it("can generate a bent polyline on an open board", () => {
    const path = pickRandomPolyline(emptyCtx(8, 8), 3, 4, () => 0.12);
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < path!.length; i++) {
      const a = path![i - 1]!;
      const b = path![i]!;
      expect(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])).toBe(1);
    }
    const hasTurn =
      path!.length >= 3 &&
      (path![2]![0] - path![1]![0] !== path![1]![0] - path![0]![0] ||
        path![2]![1] - path![1]![1] !== path![1]![1] - path![0]![1]);
    expect(hasTurn).toBe(true);
  });
});

describe("areArrowsFacingOpposite", () => {
  it("detects head-on mutual block on same column", () => {
    const up: ArrowItem = {
      kind: 1,
      instanceId: 1,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[2, 3], [2, 2]],
      direction: 2,
      colorId: 3,
    };
    const down: ArrowItem = {
      kind: 1,
      instanceId: 2,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[2, 1], [2, 0]],
      direction: 1,
      colorId: 6,
    };
    expect(areArrowsFacingOpposite(up, down, 5, 5)).toBe(true);
    expect(areArrowsFacingOpposite(down, up, 5, 5)).toBe(true);
  });

  it("ignores same-direction arrows on the same line", () => {
    const a: ArrowItem = {
      kind: 1,
      instanceId: 1,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[2, 3], [2, 2]],
      direction: 2,
      colorId: 3,
    };
    const b: ArrowItem = {
      kind: 1,
      instanceId: 2,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[2, 1], [2, 0]],
      direction: 2,
      colorId: 6,
    };
    expect(areArrowsFacingOpposite(a, b, 5, 5)).toBe(false);
  });
});

describe("flipArrowDirection2", () => {
  it("uses reversed polyline last segment (opposite of first segment trend)", () => {
    expect(flipArrowDirection2([[5, 5], [6, 5], [7, 5]])).toBe(4);
    expect(flipArrowDirection2([[2, 0], [2, 1], [2, 2]])).toBe(2);
  });
});

describe("runSpawnWave", () => {
  it("fills empty board cells", () => {
    const level = rushLevel(basePool, 8, 8);
    let id = 100;
    const wave = runSpawnWave(level, emptyCtx(8, 8), 0, () => id++, () => 0.5);
    expect(wave.arrows.length + wave.corners.length + wave.buffs.length).toBeGreaterThan(0);
  });

  it("generic colorId picks from all seven arrow colors", () => {
    const entry: SpawnPoolEntry = { kind: 1, weight: 1000, colorId: 0 };
    const seen = new Set<number>();
    for (let i = 0; i < 80; i++) {
      seen.add(resolveSpawnColorId(entry, [entry], () => (i * 0.137) % 1));
    }
    for (const colorId of SPAWN_ARROW_COLOR_IDS) {
      expect(seen.has(colorId)).toBe(true);
    }
  });

  it("does not spawn kind1 arrows facing opposite an existing kind1", () => {
    const existing: ArrowItem = {
      kind: 1,
      instanceId: 1,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[2, 3], [2, 2]],
      direction: 2,
      colorId: 7,
    };
    const occupied = new Set<string>();
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        if (x === 2 && (y === 0 || y === 1)) continue;
        occupied.add(vecKey([x, y]));
      }
    }
    for (const p of existing.occupiedPositions) occupied.add(vecKey(p));

    const ctx: SpawnBlockContext = {
      width: 5,
      height: 5,
      occupied,
      curtainCells: new Set(),
      spawnableZoneCells: null,
      existingArrows: [existing],
    };
    const level = rushLevel([{ kind: 1, weight: 1000, colorId: 7 }], 5, 5);
    const wave = runSpawnWave(level, ctx, 0, () => 99, () => 0.5);
    for (const arrow of wave.arrows) {
      expect(areArrowsFacingOpposite(arrow, existing, 5, 5)).toBe(false);
    }
  });
});

describe("SpawnManager countdown deferral", () => {
  it("marks spawn due at zero while blocked by animation", () => {
    const mgr = new SpawnManager(20, true);
    mgr.spawnCountdownSec = 0;
    expect(mgr.tickCountdown(0.1, true)).toBe(true);
    expect(mgr.spawnDuePending).toBe(true);
    expect(mgr.spawnCountdownSec).toBe(0);
  });

  it("fires pending spawn once unblocked", () => {
    const mgr = new SpawnManager(20, true);
    mgr.spawnCountdownSec = 0;
    mgr.tickCountdown(0.1, true);
    expect(mgr.tickCountdown(0.1, false)).toBe(true);
    expect(mgr.spawnDuePending).toBe(true);
  });

  it("clamps countdown at zero once due", () => {
    const mgr = new SpawnManager(20, true);
    mgr.spawnCountdownSec = 0.2;
    expect(mgr.tickCountdown(0.5, false)).toBe(true);
    expect(mgr.spawnCountdownSec).toBe(0);
    expect(mgr.spawnDuePending).toBe(true);
    expect(mgr.isSpawnDue()).toBe(true);
  });
});

describe("computeSpawnEmergence", () => {
  it("starts transparent and small, ends opaque at full scale", () => {
    expect(computeSpawnEmergence(0)).toEqual({ alpha: 0, scale: 0.82 });
    expect(computeSpawnEmergence(1)).toEqual({ alpha: 1, scale: 1 });
    const mid = computeSpawnEmergence(0.5);
    expect(mid.alpha).toBeGreaterThan(0.5);
    expect(mid.scale).toBeGreaterThan(0.9);
  });
});
