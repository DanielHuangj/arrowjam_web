import type { ArrowItem, Direction, Vec2 } from "../types.ts";

export function isFlipArrow(arrow: ArrowItem): boolean {
  return arrow.kind === 2;
}

/** 箭头头部朝向：末段格点趋势方向（与 spawn / 翻转箭 direction2 算法一致） */
export function headDirectionFromPositions(positions: Vec2[]): Direction {
  if (positions.length < 2) return 1;
  const a = positions[positions.length - 2]!;
  const b = positions[positions.length - 1]!;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 1) return 1;
  if (dx === 0 && dy === -1) return 2;
  if (dx === 1 && dy === 0) return 3;
  return 4;
}

function reversePositions(positions: Vec2[]): Vec2[] {
  return [...positions].reverse().map(([x, y]) => [x, y] as Vec2);
}

export function flipArrow(arrow: ArrowItem): ArrowItem {
  if (!isFlipArrow(arrow) || arrow.direction1 == null || arrow.direction2 == null) {
    return arrow;
  }
  const nextDir: Direction =
    arrow.direction === arrow.direction1 ? arrow.direction2 : arrow.direction1;
  return {
    ...arrow,
    occupiedPositions: reversePositions(arrow.occupiedPositions),
    direction: nextDir,
  };
}

/** 翻转按钮：反转路径，头部朝向与反转后箭身末段趋势一致 */
export function flipBoardArrow(arrow: ArrowItem): ArrowItem {
  if (arrow.kind !== 1 && arrow.kind !== 2) return arrow;
  const occupiedPositions = reversePositions(arrow.occupiedPositions);
  return {
    ...arrow,
    occupiedPositions,
    direction: headDirectionFromPositions(occupiedPositions),
  };
}

export function flipAllBoardArrows(
  arrows: ArrowItem[],
  include: (arrow: ArrowItem) => boolean,
): ArrowItem[] {
  return arrows.map((a) => (include(a) ? flipBoardArrow(a) : a));
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
