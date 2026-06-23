import type { LevelData, RawItem, ValidationIssue } from "@arrowjaw/shared";
import {
  collectAllItems,
  findArrowHostingCell,
  findCornerArrowCellOverlaps,
  findPipeArrowCellOverlaps,
  isBombAnchoredOnMidBody,
} from "@arrowjaw/shared";
import { vecKey } from "@arrowjaw/shared";
import type { GenerationForm } from "./types.ts";
import { AI_KIND_OPTIONS } from "./types.ts";
import { getDifficultyTargets } from "./prompts/playability-rules.ts";
import { validateSolvability } from "./level-solvability.ts";
import { validateCornerUtility } from "./level-corner-utility.ts";
import { validatePipeUtility } from "./level-pipe-utility.ts";

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

function kindLabel(kind: number): string {
  return AI_KIND_OPTIONS.find((o) => o.kind === kind)?.label ?? `kind${kind}`;
}

/** 统计关卡中各 kind 出现次数（含子区域 items） */
export function countKindsInLevel(items: RawItem[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const item of collectAllItems(items)) {
    counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  }
  return counts;
}

export function getMissingRequiredKinds(
  items: RawItem[],
  allowedKinds: number[],
): number[] {
  const counts = countKindsInLevel(items);
  return allowedKinds.filter((k) => (counts.get(k) ?? 0) < 1);
}

export function formatRequiredKindsLine(form: GenerationForm): string {
  const labels = form.allowedKinds.map((k) => `${kindLabel(k)}(kind${k})`);
  return `勾选 kind 每种至少 1 个：${labels.join("、")}`;
}

function validateBombAnchors(data: LevelData): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const bomb of collectAllItems(data.itemModels)) {
    if (bomb.kind !== 5) continue;
    const cell = bomb.occupiedPositions[0];
    if (!cell) continue;
    const host = findArrowHostingCell(data.itemModels, cell);
    if (!host) continue;
    if (host.occupiedPositions.length < 3) {
      issues.push({
        id: "AI-BOMB-SHORT",
        severity: "error",
        message: `炸弹 #${bomb.instanceId} 宿主箭 #${host.instanceId} 仅 ${host.occupiedPositions.length} 格，须 ≥3 格以便绑在中段`,
        instanceId: bomb.instanceId,
      });
      continue;
    }
    if (!isBombAnchoredOnMidBody(host.occupiedPositions, cell)) {
      issues.push({
        id: "AI-BOMB-ANCHOR",
        severity: "error",
        message: `炸弹 #${bomb.instanceId} 应绑在宿主箭 #${host.instanceId} 身中段（非头尾格）`,
        instanceId: bomb.instanceId,
      });
    }
  }
  return issues;
}

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

  for (const kind of getMissingRequiredKinds(data.itemModels, form.allowedKinds)) {
    issues.push({
      id: "AI-KIND-MIN",
      severity: "error",
      message: `缺少用户勾选的 ${kindLabel(kind)}：itemModels 中须至少包含 1 个 kind ${kind}`,
    });
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

  const pipeOverlaps = findPipeArrowCellOverlaps(data.itemModels);
  for (const o of pipeOverlaps.slice(0, 5)) {
    issues.push({
      id: "AI-PIPE-OVERLAP",
      severity: "error",
      message: `管道 #${o.pipeId} 与箭 #${o.arrowId} 共享格子 ${o.cell}（管身与箭身不可重叠）`,
      instanceId: o.pipeId,
    });
  }
  if (pipeOverlaps.length > 5) {
    issues.push({
      id: "AI-PIPE-OVERLAP",
      severity: "error",
      message: `另有 ${pipeOverlaps.length - 5} 处管道与箭身格重叠`,
    });
  }

  const cornerOverlaps = findCornerArrowCellOverlaps(data.itemModels);
  for (const o of cornerOverlaps.slice(0, 5)) {
    issues.push({
      id: "AI-CORNER-OVERLAP",
      severity: "error",
      message: `反射角 #${o.cornerId} 与箭 #${o.arrowId} 共享格子 ${o.cell}（角块与箭身不可重叠）`,
      instanceId: o.cornerId,
    });
  }
  if (cornerOverlaps.length > 5) {
    issues.push({
      id: "AI-CORNER-OVERLAP",
      severity: "error",
      message: `另有 ${cornerOverlaps.length - 5} 处反射角与箭身格重叠`,
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

  if (form.allowedKinds.includes(3)) {
    issues.push(...validatePipeUtility(data));
  }

  if (form.allowedKinds.includes(4)) {
    issues.push(...validateCornerUtility(data));
  }

  if (form.allowedKinds.includes(5)) {
    issues.push(...validateBombAnchors(data));
  }

  if (form.allowedKinds.every((k) => k === 1 || k === 2)) {
    issues.push(...validateSolvability(data));
  }

  return issues;
}
