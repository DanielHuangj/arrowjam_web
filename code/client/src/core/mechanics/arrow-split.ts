import type { ArrowItem, Direction, Vec2 } from "../types.ts";
import { vecKey } from "../types.ts";

export interface SplitResult {
  removed: boolean;
  arrow: ArrowItem | null;
  credit: boolean;
}

function clonePositions(positions: Vec2[]): Vec2[] {
  return positions.map(([x, y]) => [x, y] as Vec2);
}

function directionFromSegment(a: Vec2, b: Vec2): Direction | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 1) return 1;
  if (dx === 0 && dy === -1) return 2;
  if (dx === 1 && dy === 0) return 3;
  if (dx === -1 && dy === 0) return 4;
  return null;
}

function isOrthAdjacent(a: Vec2, b: Vec2): boolean {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
}

export function splitIntoContiguousSegments(ordered: Vec2[]): Vec2[][] {
  if (ordered.length === 0) return [];
  const segments: Vec2[][] = [];
  let current: Vec2[] = [ordered[0]!];
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1]!;
    const cur = ordered[i]!;
    if (isOrthAdjacent(prev, cur)) {
      current.push(cur);
    } else {
      segments.push(current);
      current = [cur];
    }
  }
  segments.push(current);
  return segments;
}

function orientLinearSegment(segment: Vec2[], headCellIndex: number): Vec2[] {
  if (headCellIndex <= 0) return [...segment].reverse();
  if (headCellIndex >= segment.length - 1) return [...segment];
  const leftLen = headCellIndex;
  const rightLen = segment.length - 1 - headCellIndex;
  if (leftLen >= rightLen) {
    return [...segment.slice(0, headCellIndex + 1)];
  }
  return [...segment.slice(headCellIndex).reverse()];
}

function directionForSegment(segment: Vec2[], fallback: Direction): Direction {
  if (segment.length < 2) return fallback;
  return directionFromSegment(segment[segment.length - 2]!, segment[segment.length - 1]!) ?? fallback;
}

function flipDirection2ForSegment(segment: Vec2[], fallback: Direction): Direction {
  if (segment.length < 2) return fallback;
  return directionFromSegment(segment[1]!, segment[0]!) ?? fallback;
}

function buildArrowFromSegment(
  arrow: ArrowItem,
  segment: Vec2[],
  direction: Direction,
  instanceId: number,
): ArrowItem {
  return {
    ...arrow,
    instanceId,
    occupiedPositions: clonePositions(segment),
    direction,
    ...(arrow.kind === 2
      ? { direction1: direction, direction2: flipDirection2ForSegment(segment, direction) }
      : {}),
  };
}

function buildOrphanSegmentArrow(
  arrow: ArrowItem,
  segment: Vec2[],
  originalHead: Vec2,
  nextInstanceId: () => number,
): ArrowItem {
  let nearestIdx = 0;
  let nearestDist = Infinity;
  for (let i = 0; i < segment.length; i++) {
    const p = segment[i]!;
    const dist = Math.abs(p[0] - originalHead[0]) + Math.abs(p[1] - originalHead[1]);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestIdx = i;
    }
  }
  const ordered = orientLinearSegment(segment, nearestIdx);
  const direction = directionForSegment(ordered, arrow.direction);
  return buildArrowFromSegment(arrow, ordered, direction, nextInstanceId());
}

export function splitArrowByDestroyedCells(
  arrow: ArrowItem,
  destroyedCells: Set<string>,
  nextInstanceId: () => number,
): SplitResult[] {
  const remaining = arrow.occupiedPositions.filter((p) => !destroyedCells.has(vecKey(p)));
  if (remaining.length <= 1) {
    return [{ removed: true, arrow: null, credit: true }];
  }

  const originalHead = arrow.occupiedPositions[arrow.occupiedPositions.length - 1]!;
  const headKey = vecKey(originalHead);
  const segments = splitIntoContiguousSegments(remaining);
  const results: SplitResult[] = [];

  for (const segment of segments) {
    if (segment.length < 2) {
      results.push({ removed: true, arrow: null, credit: true });
      continue;
    }

    const segHasHead = segment.some((p) => vecKey(p) === headKey);
    if (segHasHead) {
      const direction = directionForSegment(segment, arrow.direction);
      results.push({
        removed: false,
        arrow: buildArrowFromSegment(arrow, segment, direction, arrow.instanceId),
        credit: true,
      });
    } else {
      results.push({
        removed: false,
        arrow: buildOrphanSegmentArrow(arrow, segment, originalHead, nextInstanceId),
        credit: true,
      });
    }
  }

  return results.length > 0 ? results : [{ removed: true, arrow: null, credit: true }];
}
