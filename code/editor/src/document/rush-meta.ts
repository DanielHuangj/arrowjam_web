import type { LevelGoal, SpawnPoolEntry, SpawnPoolKind } from "@arrowjaw/shared";
import {
  isSpawnWeightAdjustTierBalanced,
  isSpawnWeightTotalValid,
  normalizeSpawnPoolWeights,
  spawnPoolWeightSum,
  spawnWeightAdjustTierBalance,
  spawnWeightSumPercent,
  defaultSpawnWeightAdjustTiers,
} from "@arrowjaw/shared";

export {
  isSpawnWeightAdjustTierBalanced,
  isSpawnWeightTotalValid,
  normalizeSpawnPoolWeights,
  spawnPoolWeightSum,
  spawnWeightAdjustTierBalance,
  spawnWeightSumPercent,
  defaultSpawnWeightAdjustTiers,
};

export function spawnPoolEntryKey(entry: SpawnPoolEntry): string {
  return `${entry.kind}:${entry.colorId ?? ""}:${entry.bombRadius ?? ""}:${entry.crossArm ?? ""}`;
}

export function defaultSpawnPoolEntry(kind: SpawnPoolKind): SpawnPoolEntry {
  if (kind === 1 || kind === 2) {
    return { kind, weight: 100, colorId: 7 };
  }
  if (kind === 17) return { kind: 17, weight: 100, bombRadius: 1 };
  if (kind === 18) return { kind: 18, weight: 100, crossArm: 2 };
  if (kind === 4) return { kind: 4, weight: 100 };
  if (kind === 19) return { kind: 19, weight: 100 };
  if (kind === 21) return { kind: 21, weight: 100 };
  if (kind === 22) return { kind: 22, weight: 100 };
  if (kind === 23) return { kind: 23, weight: 100 };
  return { kind: 20, weight: 100 };
}

export function defaultRushGoals(): LevelGoal[] {
  return [{ type: "clearArrowCount", count: 20 }];
}

export function defaultRushSpawnPool(): SpawnPoolEntry[] {
  return [
    { kind: 1, weight: 500, colorId: 7 },
    { kind: 1, weight: 300, colorId: 3 },
    { kind: 4, weight: 200 },
  ];
}
