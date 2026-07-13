import type { Vec2 } from "../types.ts";
import { vecKey } from "../types.ts";

/** 从箭头尾部到头部，截掉连续落在黑洞区域内的后缀格 */
export function trimArrowSuffixInBlackHole(
  positions: readonly Vec2[],
  blackHoleCells: ReadonlySet<string>,
): { remaining: Vec2[]; consumed: Vec2[] } {
  if (blackHoleCells.size === 0 || positions.length === 0) {
    return { remaining: [...positions], consumed: [] };
  }

  let cutFrom = positions.length;
  for (let i = positions.length - 1; i >= 0; i--) {
    if (blackHoleCells.has(vecKey(positions[i]!))) {
      cutFrom = i;
    } else {
      break;
    }
  }

  if (cutFrom >= positions.length) {
    return { remaining: [...positions], consumed: [] };
  }

  return {
    remaining: positions.slice(0, cutFrom).map(([x, y]) => [x, y] as Vec2),
    consumed: positions.slice(cutFrom).map(([x, y]) => [x, y] as Vec2),
  };
}

export function arrowHasCellInBlackHole(
  positions: readonly Vec2[],
  blackHoleCells: ReadonlySet<string>,
): boolean {
  for (const p of positions) {
    if (blackHoleCells.has(vecKey(p))) return true;
  }
  return false;
}
