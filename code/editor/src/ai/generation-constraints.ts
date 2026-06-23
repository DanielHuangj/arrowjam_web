import type { LevelData, RawItem, ValidationIssue } from "@arrowjaw/shared";
import { collectAllItems } from "@arrowjaw/shared";
import { vecKey } from "@arrowjaw/shared";
import type { GenerationForm } from "./types.ts";
import { getDifficultyTargets } from "./prompts/playability-rules.ts";
import { validateSolvability } from "./level-solvability.ts";

/** kind1/2 折线箭身格不可与其他折线箭共享 */

function countArrows(items: RawItem[]): number {
  return collectAllItems(items).filter((i) => i.kind === 1 || i.kind === 2).length;
}

function countArrowBodyCells(items: RawItem[]): number {
  const cells = new Set<string>();
  for (const item of collectAllItems(items)) {
    if (item.kind === 1 || item.kind === 2) {
      for (const p of item.occupiedPositions) {
        cells.add(vecKey(p));
      }
    }
  }
  return cells.size;
}

function findArrowCellOverlaps(items: RawItem[]): { cell: string; ids: number[] }[] {
  const cellToIds = new Map<string, Set<number>>();
  for (const item of collectAllItems(items)) {
    if (!ARROW_BODY_KINDS.has(item.kind)) continue;
    for (const p of item.occupiedPositions) {
      const key = vecKey(p);
      if (!cellToIds.has(key)) cellToIds.set(key, new Set());
      cellToIds.get(key)!.add(item.instanceId);
    }
  }
  const overlaps: { cell: string; ids: number[] }[] = [];
  for (const [cell, ids] of cellToIds) {
    if (ids.size > 1) {
      overlaps.push({ cell, ids: [...ids] });
    }
  }
  return overlaps;
}

const ARROW_BODY_KINDS = new Set([1, 2]);

export function validateGenerationConstraints(
  data: LevelData,
  form: GenerationForm,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const allowed = new Set(form.allowedKinds);
  const targets = getDifficultyTargets(form);
  const occupancyMin = targets.occupancyCellMin;

  for (const item of collectAllItems(data.itemModels)) {
    if (!allowed.has(item.kind)) {
      issues.push({
        id: "AI-KIND",
        severity: "error",
        message: `kind ${item.kind} 未在用户勾选列表中（仅允许 ${form.allowedKinds.join(", ")}）`,
        instanceId: item.instanceId,
      });
    }
  }

  const arrowCount = countArrows(data.itemModels);
  if (arrowCount < targets.arrowCountMin) {
    issues.push({
      id: "AI-COUNT",
      severity: "error",
      message: `折线箭数量不足：当前 ${arrowCount} 条，要求至少 ${targets.arrowCountMin} 条（kind1+kind2）`,
    });
  }

  const bodyCells = countArrowBodyCells(data.itemModels);
  if (bodyCells < occupancyMin) {
    const cells = form.width * form.height;
    issues.push({
      id: "AI-DENSITY",
      severity: "error",
      message: `箭身占用格子过少：当前 ${bodyCells} 格，要求至少 ${occupancyMin} 格（约棋盘 ${Math.round((occupancyMin / cells) * 100)}%）`,
    });
  }

  const overlaps = findArrowCellOverlaps(data.itemModels);
  for (const o of overlaps.slice(0, 5)) {
    issues.push({
      id: "AI-OVERLAP",
      severity: "error",
      message: `格子 ${o.cell} 被多条折线箭同时占用（#${o.ids.join(", #")}）`,
    });
  }
  if (overlaps.length > 5) {
    issues.push({
      id: "AI-OVERLAP",
      severity: "error",
      message: `另有 ${overlaps.length - 5} 处折线箭格重叠`,
    });
  }

  if (form.fillBaseOccupiedCells != null) {
    const minAdded = form.fillMinAddedCells ?? 8;
    const added = bodyCells - form.fillBaseOccupiedCells;
    if (added < minAdded) {
      issues.push({
        id: "AI-FILL-PROGRESS",
        severity: "error",
        message: `二次填充须新增至少 ${minAdded} 格箭身占用（相对基础关），当前仅新增 ${Math.max(0, added)} 格`,
      });
    }
  }

  if (form.allowedKinds.every((k) => k === 1 || k === 2)) {
    issues.push(...validateSolvability(data));
  }

  return issues;
}
