import type {
  ArrowItem,
  BoardSize,
  CornerItem,
  PipeItem,
  Vec2,
} from "../types.ts";
import { vecKey } from "../types.ts";
import type { CellMap } from "./cell-map.ts";
import { simulateCanExitWithPipes } from "../mechanics/pipe.ts";
import { getCornerAt } from "../mechanics/corner.ts";
import { isHeadBlockedByPipe } from "../mechanics/pipe.ts";

/** Simulate snake exit with corner reflections and pipes until fully off board. */
export function simulateCanExit(
  arrow: ArrowItem,
  allArrows: ArrowItem[],
  corners: CornerItem[],
  board: BoardSize,
  pipes: PipeItem[] = [],
  curtainCells: Set<string> = new Set(),
  extraBlockerCells: Set<string> = new Set(),
): boolean {
  return simulateCanExitWithPipes(
    arrow,
    allArrows,
    corners,
    board,
    pipes,
    curtainCells,
    extraBlockerCells,
  );
}

export function canLaunchArrow(
  arrow: ArrowItem,
  _cellMap: CellMap,
  board: BoardSize,
  corners: CornerItem[] = [],
  allArrows: ArrowItem[] = [],
  pipes: PipeItem[] = [],
  curtainCells: Set<string> = new Set(),
  extraBlockerCells: Set<string> = new Set(),
): boolean {
  return simulateCanExit(
    arrow,
    allArrows,
    corners,
    board,
    pipes,
    curtainCells,
    extraBlockerCells,
  );
}

/** True when head touches another arrow, pipe, or a corner cell. */
export function isHeadOnBlocker(
  arrow: ArrowItem,
  cellMap: CellMap,
  corners: CornerItem[] = [],
  pipes: PipeItem[] = [],
  curtainCells: Set<string> = new Set(),
  extraBlockerCells: Set<string> = new Set(),
): boolean {
  const head = arrow.occupiedPositions.at(-1);
  if (!head) return false;
  if (extraBlockerCells.has(vecKey(head))) return true;
  if (curtainCells.has(vecKey(head))) return true;
  if (cellMap.isBlockedByOther(head, arrow.instanceId)) return true;
  if (isHeadBlockedByPipe(head, arrow.direction, pipes)) return true;
  return getCornerAt(head, corners) != null;
}

export function findArrowAtCell(
  pos: Vec2,
  arrows: ArrowItem[],
): ArrowItem | null {
  for (let i = arrows.length - 1; i >= 0; i--) {
    const arrow = arrows[i]!;
    for (const p of arrow.occupiedPositions) {
      if (p[0] === pos[0] && p[1] === pos[1]) return arrow;
    }
  }
  return null;
}
