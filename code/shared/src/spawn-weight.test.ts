import { describe, expect, it } from "vitest";
import {
  adjustSpawnPoolWeights,
  applyEvenCategoryWeightDelta,
  defaultSpawnWeightAdjustTiers,
  isSpawnWeightAdjustTierBalanced,
  resolveSpawnWeightAdjustTier,
  spawnWeightAdjustTierBalance,
  SPAWN_WEIGHT_TOTAL,
} from "./spawn-weight.ts";
import type { SpawnPoolEntry } from "./types.ts";

describe("resolveSpawnWeightAdjustTier", () => {
  const tiers = defaultSpawnWeightAdjustTiers();

  it("uses zero tier for elim cells up to 30", () => {
    expect(resolveSpawnWeightAdjustTier(tiers, 30).buffDelta).toBe(0);
  });

  it("uses middle tier for 31-60 cells", () => {
    expect(resolveSpawnWeightAdjustTier(tiers, 45).buffDelta).toBe(100);
  });

  it("uses high tier above 60 cells", () => {
    expect(resolveSpawnWeightAdjustTier(tiers, 80).buffDelta).toBe(200);
  });
});

describe("spawnWeightAdjustTierBalance", () => {
  it("is balanced when buffDelta equals arrow+mech", () => {
    const tier = { buffDelta: 150, arrowDelta: 80, mechDelta: 70 };
    expect(spawnWeightAdjustTierBalance(tier)).toBe(0);
    expect(isSpawnWeightAdjustTierBalanced(tier)).toBe(true);
  });

  it("reports imbalance when conservation breaks", () => {
    const tier = { buffDelta: 200, arrowDelta: 50, mechDelta: 50 };
    expect(spawnWeightAdjustTierBalance(tier)).toBe(100);
    expect(isSpawnWeightAdjustTierBalanced(tier)).toBe(false);
  });

  it("default tiers are all balanced", () => {
    expect(defaultSpawnWeightAdjustTiers().every(isSpawnWeightAdjustTierBalanced)).toBe(
      true,
    );
  });
});

describe("applyEvenCategoryWeightDelta", () => {
  it("splits buff delta evenly across entries", () => {
    const entries = [{ weight: 10 }, { weight: 10 }, { weight: 10 }, { weight: 10 }];
    applyEvenCategoryWeightDelta(entries, 100);
    expect(entries.every((e) => e.weight === 35)).toBe(true);
  });
});

describe("adjustSpawnPoolWeights", () => {
  const pool: SpawnPoolEntry[] = [
    { kind: 1, weight: 400, colorId: 7 },
    { kind: 4, weight: 400 },
    { kind: 17, weight: 100, bombRadius: 1 },
    { kind: 20, weight: 100 },
  ];

  it("keeps original weights for 0-30 eliminated cells", () => {
    const adjusted = adjustSpawnPoolWeights(pool, 30);
    expect(adjusted).toEqual(pool);
  });

  it("boosts buff weights at mid tier", () => {
    const adjusted = adjustSpawnPoolWeights(pool, 45);
    const buffSum = adjusted
      .filter((e) => e.kind >= 17)
      .reduce((s, e) => s + e.weight, 0);
    expect(buffSum).toBeGreaterThan(200);
    const total = adjusted.reduce((s, e) => s + e.weight, 0);
    expect(Math.abs(total - SPAWN_WEIGHT_TOTAL)).toBeLessThan(0.2);
  });

  it("supports custom tier tables", () => {
    const custom = [
      { minElimCells: 0, buffDelta: 0, arrowDelta: 0, mechDelta: 0 },
      { minElimCells: 10, buffDelta: 50, arrowDelta: 25, mechDelta: 25 },
    ];
    const low = adjustSpawnPoolWeights(pool, 5, custom);
    const high = adjustSpawnPoolWeights(pool, 15, custom);
    const lowBuff = low.filter((e) => e.kind >= 17).reduce((s, e) => s + e.weight, 0);
    const highBuff = high.filter((e) => e.kind >= 17).reduce((s, e) => s + e.weight, 0);
    expect(highBuff).toBeGreaterThan(lowBuff);
  });
});
