import type { ArrowItem, KeyArrowItem, Vec2 } from "../types.ts";
import { vecKey } from "../types.ts";

/** kind 11 钥匙所在格集合 */
export function buildKeyCellSet(keys: KeyArrowItem[]): Set<string> {
  const set = new Set<string>();
  for (const key of keys) {
    for (const pos of key.occupiedPositions) {
      set.add(vecKey(pos));
    }
  }
  return set;
}

export function countKeysOnPositions(
  positions: Vec2[],
  keyCells: Set<string>,
): number {
  let n = 0;
  for (const pos of positions) {
    if (keyCells.has(vecKey(pos))) n++;
  }
  return n;
}

/** 箭头占用的格子上是否有钥匙 */
export function countKeysOnArrow(
  arrow: ArrowItem,
  keyCells: Set<string>,
): number {
  return countKeysOnPositions(arrow.occupiedPositions, keyCells);
}

export function arrowHasKey(
  arrow: ArrowItem,
  keyCells: Set<string>,
): boolean {
  return countKeysOnArrow(arrow, keyCells) > 0;
}

export function isKeyCellVisible(
  pos: Vec2,
  activeArrows: ArrowItem[],
): boolean {
  return activeArrows.some((a) =>
    a.occupiedPositions.some((p) => p[0] === pos[0] && p[1] === pos[1]),
  );
}
