import type { LevelData, ValidationIssue } from "@arrowjaw/shared";
import { parseLevelData } from "@arrowjaw/shared";
import type { ArrowItem } from "@arrowjaw/client/core/types.ts";
import { simulateCanExit } from "@arrowjaw/client/core/board/path-check.ts";

export interface SolvabilityResult {
  solvable: boolean;
  /** 贪心模拟后仍无法消掉的箭 id */
  stuckIds: number[];
}

/** kind1/kind2 折线箭：贪心依次移除「当前可飞出」的箭，判断能否清空 */
export function checkGreedySolvability(data: LevelData): SolvabilityResult {
  let level;
  try {
    level = parseLevelData(0, data);
  } catch {
    return { solvable: false, stuckIds: [] };
  }

  const board = { width: data.width, height: data.height };
  let remaining: ArrowItem[] = level.arrows.map((a) => ({
    ...a,
    occupiedPositions: a.occupiedPositions.map(([x, y]) => [x, y] as [number, number]),
  }));

  if (remaining.length === 0) {
    return { solvable: true, stuckIds: [] };
  }

  let progress = true;
  while (progress && remaining.length > 0) {
    progress = false;
    for (let i = remaining.length - 1; i >= 0; i--) {
      const arrow = remaining[i]!;
      if (
        simulateCanExit(
          arrow,
          remaining,
          level.corners,
          board,
          level.pipes,
          new Set(),
          new Set(),
        )
      ) {
        remaining.splice(i, 1);
        progress = true;
      }
    }
  }

  return {
    solvable: remaining.length === 0,
    stuckIds: remaining.map((a) => a.instanceId),
  };
}

export function validateSolvability(data: LevelData): ValidationIssue[] {
  const { solvable, stuckIds } = checkGreedySolvability(data);
  if (solvable) return [];

  const preview = stuckIds.slice(0, 6).map((id) => `#${id}`).join(", ");
  const extra = stuckIds.length > 6 ? ` 等 ${stuckIds.length} 条` : "";
  return [
    {
      id: "AI-UNSOLVABLE",
      severity: "error",
      message: `关卡不可解（贪心模拟无法消完）：卡住箭 ${preview}${extra}`,
    },
  ];
}
