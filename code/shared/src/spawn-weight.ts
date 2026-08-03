import type { SpawnPoolEntry, SpawnWeightAdjustTier } from "./types.ts";

/** 生成池权重总分：1000 = 100%，1 = 0.1% */
export const SPAWN_WEIGHT_TOTAL = 1000;

export const SPAWN_WEIGHT_TOLERANCE = 0.1;

/** 单条目低于此权重（0.5%）时在动态调整后归零 */
export const SPAWN_WEIGHT_MIN_ACTIVE = 50;

/** 箭 + 机制权重合计低于此值（10%）时，整类归零并转给 buff */
export const SPAWN_WEIGHT_ARROW_MECH_MIN_TOTAL = 100;

export function defaultSpawnWeightAdjustTiers(): SpawnWeightAdjustTier[] {
  return [
    { minElimCells: 0, buffDelta: 0, arrowDelta: 0, mechDelta: 0 },
    { minElimCells: 31, buffDelta: 100, arrowDelta: 50, mechDelta: 50 },
    { minElimCells: 61, buffDelta: 200, arrowDelta: 100, mechDelta: 100 },
  ];
}

export function resolveSpawnWeightAdjustTier(
  tiers: readonly SpawnWeightAdjustTier[],
  cycleElimCells: number,
): SpawnWeightAdjustTier {
  const sorted = [...tiers].sort((a, b) => a.minElimCells - b.minElimCells);
  if (sorted.length === 0) {
    return { minElimCells: 0, buffDelta: 0, arrowDelta: 0, mechDelta: 0 };
  }
  let active = sorted[0]!;
  for (const tier of sorted) {
    if (cycleElimCells >= tier.minElimCells) active = tier;
    else break;
  }
  return active;
}

function isBuffSpawnKind(kind: number): boolean {
  return kind >= 17;
}

function isArrowSpawnKind(kind: number): boolean {
  return kind === 1 || kind === 2;
}

function isMechSpawnKind(kind: number): boolean {
  return kind === 4;
}

/** 将 delta 均分给 entries 中每一项（delta 可正可负） */
export function applyEvenCategoryWeightDelta(
  entries: { weight: number }[],
  delta: number,
): void {
  if (entries.length === 0 || delta === 0) return;
  const per = delta / entries.length;
  for (const e of entries) {
    e.weight += per;
  }
}

export function adjustSpawnPoolWeights(
  pool: readonly SpawnPoolEntry[],
  cycleElimCells: number,
  adjustTiers: readonly SpawnWeightAdjustTier[] = defaultSpawnWeightAdjustTiers(),
): SpawnPoolEntry[] {
  const tier = resolveSpawnWeightAdjustTier(adjustTiers, cycleElimCells);
  const cloned = pool.map((e) => ({ ...e }));

  const arrowEntries = cloned.filter((e) => isArrowSpawnKind(e.kind));
  const mechEntries = cloned.filter((e) => isMechSpawnKind(e.kind));
  const buffEntries = cloned.filter((e) => isBuffSpawnKind(e.kind));

  applyEvenCategoryWeightDelta(arrowEntries, -tier.arrowDelta);
  applyEvenCategoryWeightDelta(mechEntries, -tier.mechDelta);
  applyEvenCategoryWeightDelta(buffEntries, tier.buffDelta);

  const clampSmall = (entries: SpawnPoolEntry[]) => {
    let freed = 0;
    for (const e of entries) {
      if (e.weight > 0 && e.weight < SPAWN_WEIGHT_MIN_ACTIVE) {
        freed += e.weight;
        e.weight = 0;
      }
    }
    return freed;
  };

  let freedArrow = clampSmall(arrowEntries);
  let freedMech = clampSmall(mechEntries);
  const arrowTotal = arrowEntries.reduce((s, e) => s + e.weight, 0);
  const mechTotal = mechEntries.reduce((s, e) => s + e.weight, 0);
  if (
    arrowTotal + mechTotal < SPAWN_WEIGHT_ARROW_MECH_MIN_TOTAL &&
    tier.arrowDelta + tier.mechDelta > 0
  ) {
    for (const e of arrowEntries) e.weight = 0;
    for (const e of mechEntries) e.weight = 0;
    const per = buffEntries.length > 0 ? SPAWN_WEIGHT_TOTAL / buffEntries.length : 0;
    for (const e of buffEntries) e.weight = per;
    return cloned;
  }

  if (freedArrow > 0 && buffEntries.length > 0) {
    applyEvenCategoryWeightDelta(buffEntries, freedArrow);
  } else if (freedArrow > 0 && mechEntries.length > 0) {
    applyEvenCategoryWeightDelta(mechEntries, freedArrow);
  }
  if (freedMech > 0 && buffEntries.length > 0) {
    applyEvenCategoryWeightDelta(buffEntries, freedMech);
  } else if (freedMech > 0 && arrowEntries.length > 0) {
    applyEvenCategoryWeightDelta(arrowEntries, freedMech);
  }

  const sum = cloned.reduce((s, e) => s + Math.max(0, e.weight), 0);
  if (sum <= 0) return pool.map((e) => ({ ...e }));
  for (const e of cloned) {
    e.weight = (Math.max(0, e.weight) / sum) * SPAWN_WEIGHT_TOTAL;
  }
  return cloned;
}

export function spawnPoolWeightSum(
  pool: readonly { weight: number }[] | undefined,
): number {
  if (!pool?.length) return 0;
  return pool.reduce((s, e) => s + e.weight, 0);
}

export function isSpawnWeightTotalValid(sum: number): boolean {
  return Math.abs(sum - SPAWN_WEIGHT_TOTAL) <= SPAWN_WEIGHT_TOLERANCE;
}

/** 动态调整段守恒：增益增加量应等于箭头+机制减少量，以保持总分 1000 */
export function spawnWeightAdjustTierBalance(
  tier: Pick<SpawnWeightAdjustTier, "buffDelta" | "arrowDelta" | "mechDelta">,
): number {
  return tier.buffDelta - (tier.arrowDelta + tier.mechDelta);
}

export function isSpawnWeightAdjustTierBalanced(
  tier: Pick<SpawnWeightAdjustTier, "buffDelta" | "arrowDelta" | "mechDelta">,
): boolean {
  return Math.abs(spawnWeightAdjustTierBalance(tier)) <= SPAWN_WEIGHT_TOLERANCE;
}

/** 权重合计 → 显示用百分比（1000 → 100%） */
export function spawnWeightSumPercent(sum: number): number {
  return sum / 10;
}

export function normalizeSpawnPoolWeights<T extends { weight: number }>(
  pool: T[],
): T[] {
  const sum = spawnPoolWeightSum(pool);
  if (sum <= 0 || isSpawnWeightTotalValid(sum)) {
    return pool.map((e) => ({ ...e }));
  }
  return pool.map((e) => ({
    ...e,
    weight: (e.weight / sum) * SPAWN_WEIGHT_TOTAL,
  }));
}
