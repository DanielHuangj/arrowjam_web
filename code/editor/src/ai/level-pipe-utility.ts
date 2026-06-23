import type { GameLevel, LevelData, ValidationIssue } from "@arrowjaw/shared";
import { parseLevelData } from "@arrowjaw/shared";
import { getArrowPipeCrossings } from "@arrowjaw/client/core/mechanics/pipe.ts";

export function countArrowsTraversingPipe(level: GameLevel, pipeId: number): number {
  const board = { width: level.width, height: level.height };
  let count = 0;
  for (const arrow of level.arrows) {
    const crossed = getArrowPipeCrossings(
      arrow,
      level.arrows,
      level.corners,
      board,
      level.pipes,
    );
    if (crossed.includes(pipeId)) count++;
  }
  return count;
}

/** 每条管道须有足够多的箭可从 pass 端点进入并穿出（≥ health） */
export function validatePipeUtility(data: LevelData): ValidationIssue[] {
  let level: GameLevel;
  try {
    level = parseLevelData(0, data);
  } catch {
    return [];
  }
  if (level.pipes.length === 0) return [];

  const issues: ValidationIssue[] = [];
  for (const pipe of level.pipes) {
    const traversable = countArrowsTraversingPipe(level, pipe.instanceId);
    if (traversable < pipe.health) {
      issues.push({
        id: "AI-PIPE-USELESS",
        severity: "error",
        message: `管道 #${pipe.instanceId} 仅有 ${traversable} 条箭可穿行穿出，须 ≥ health(${pipe.health})；请布置箭从 pass 端点沿允许方向进入并穿出管道`,
        instanceId: pipe.instanceId,
      });
    }
  }
  return issues;
}
