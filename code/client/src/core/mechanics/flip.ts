import type { ArrowItem, Direction, Vec2 } from "../types.ts";

export function isFlipArrow(arrow: ArrowItem): boolean {
  return arrow.kind === 2;
}

export function flipArrow(arrow: ArrowItem): ArrowItem {
  if (!isFlipArrow(arrow) || arrow.direction1 == null || arrow.direction2 == null) {
    return arrow;
  }
  const nextDir: Direction =
    arrow.direction === arrow.direction1 ? arrow.direction2 : arrow.direction1;
  return {
    ...arrow,
    occupiedPositions: [...arrow.occupiedPositions].reverse().map(([x, y]) => [x, y] as Vec2),
    direction: nextDir,
  };
}

export function flipUncoveredArrows(
  arrows: ArrowItem[],
  isCovered: (arrow: ArrowItem) => boolean,
): ArrowItem[] {
  return arrows.map((a) => {
    if (!isFlipArrow(a) || isCovered(a)) return a;
    return flipArrow(a);
  });
}
