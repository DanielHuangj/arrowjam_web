import type {
  CornerItem,
  Direction,
  GameLevel,
  LevelData,
  RawItem,
  ValidationIssue,
  Vec2,
} from "@arrowjaw/shared";
import { collectAllItems, findCornerArrowCellOverlaps, parseLevelData, vecKey } from "@arrowjaw/shared";
import { DIR_VEC } from "@arrowjaw/client/core/types.ts";
import {
  getReflectedDirection,
  isValidCornerEntry,
} from "@arrowjaw/client/core/mechanics/corner.ts";
import {
  getArrowCornerCrossings,
  traceArrowFlight,
} from "@arrowjaw/client/core/mechanics/pipe.ts";

export function countArrowsReflectingAtCorner(level: GameLevel, cornerId: number): number {
  const board = { width: level.width, height: level.height };
  let count = 0;
  for (const arrow of level.arrows) {
    const crossed = getArrowCornerCrossings(
      arrow,
      level.arrows,
      level.corners,
      board,
      level.pipes,
    );
    if (crossed.includes(cornerId)) count++;
  }
  return count;
}

/** 每条反射角须至少有 1 条箭在飞出时经其折射 */
export function validateCornerUtility(data: LevelData): ValidationIssue[] {
  let level: GameLevel;
  try {
    level = parseLevelData(0, data);
  } catch {
    return [];
  }
  if (level.corners.length === 0) return [];

  const issues: ValidationIssue[] = [];
  for (const corner of level.corners) {
    const reflecting = countArrowsReflectingAtCorner(level, corner.instanceId);
    if (reflecting < 1) {
      issues.push({
        id: "AI-CORNER-USELESS",
        severity: "error",
        message: `反射角 #${corner.instanceId} 无箭穿过折射（0 条）；请将角块放在箭飞行路径上，或调整箭 direction 使其经角块转向`,
        instanceId: corner.instanceId,
      });
    }
  }
  return issues;
}

function perpendicularDirs(d: Direction): Direction[] {
  return d === 1 || d === 2 ? [3, 4] : [1, 2];
}

function cornerDirsForReflection(inc: Direction, out: Direction): [Vec2, Vec2] {
  const inV = DIR_VEC[inc];
  return [DIR_VEC[out], [-inV[0], -inV[1]]];
}

function blockedCellsForCornerPlacement(level: GameLevel, excludeCornerId: number): Set<string> {
  const blocked = new Set<string>();
  for (const arrow of level.arrows) {
    for (const p of arrow.occupiedPositions) {
      blocked.add(vecKey(p));
    }
  }
  for (const pipe of level.pipes) {
    for (const p of pipe.occupiedPositions) {
      blocked.add(vecKey(p));
    }
  }
  for (const corner of level.corners) {
    if (corner.instanceId === excludeCornerId) continue;
    const p = corner.occupiedPositions[0];
    if (p) blocked.add(vecKey(p));
  }
  return blocked;
}

export interface CornerPlacementSuggestion {
  cell: Vec2;
  direction1: Vec2;
  direction2: Vec2;
}

export function suggestCornerPlacementOnArrowPath(
  level: GameLevel,
  cornerId: number,
): CornerPlacementSuggestion | null {
  const board = { width: level.width, height: level.height };
  const otherCorners = level.corners.filter((c) => c.instanceId !== cornerId);
  const blocked = blockedCellsForCornerPlacement(level, cornerId);

  for (const arrow of level.arrows) {
    const steps = traceArrowFlight(arrow, level.arrows, otherCorners, board, level.pipes);
    for (const { head, incidentDir } of steps) {
      const key = vecKey(head);
      if (blocked.has(key)) continue;

      for (const out of perpendicularDirs(incidentDir)) {
        const [direction1, direction2] = cornerDirsForReflection(incidentDir, out);
        const testCorner: CornerItem = {
          kind: 4,
          instanceId: cornerId,
          layer: 2,
          zoneId: null,
          occupiedPositions: [head],
          direction1,
          direction2,
        };
        if (!isValidCornerEntry(incidentDir, testCorner)) continue;
        if (getReflectedDirection(incidentDir, testCorner) !== out) continue;

        const allCorners = [...otherCorners, testCorner];
        const crossed = getArrowCornerCrossings(
          arrow,
          level.arrows,
          allCorners,
          board,
          level.pipes,
        );
        if (crossed.includes(cornerId)) {
          return { cell: [head[0], head[1]], direction1, direction2 };
        }
      }
    }
  }
  return null;
}

function findItemById(items: RawItem[], id: number): RawItem | undefined {
  return collectAllItems(items).find((i) => i.instanceId === id);
}

function removeItemById(items: RawItem[], id: number): RawItem[] {
  return items
    .filter((item) => item.instanceId !== id)
    .map((item) => {
      if (item.kind === 12 && item.items) {
        return { ...item, items: removeItemById(item.items, id) };
      }
      return item;
    });
}

/** 将无用反射角移到箭飞行路径上，或删除 */
export function tryFixOneUselessCorner(data: LevelData, actions: string[]): boolean {
  let level: GameLevel;
  try {
    level = parseLevelData(0, data);
  } catch {
    return false;
  }

  for (const corner of level.corners) {
    if (countArrowsReflectingAtCorner(level, corner.instanceId) >= 1) continue;

    const raw = findItemById(data.itemModels, corner.instanceId);
    if (!raw || raw.kind !== 4) continue;

    const suggestion = suggestCornerPlacementOnArrowPath(level, corner.instanceId);
    if (suggestion) {
      const originalPos = raw.occupiedPositions.map((p) => [p[0], p[1]] as Vec2);
      const originalD1 = raw.direction1;
      const originalD2 = raw.direction2;
      raw.occupiedPositions = [[suggestion.cell[0], suggestion.cell[1]]];
      raw.direction1 = suggestion.direction1;
      raw.direction2 = suggestion.direction2;
      const overlap = findCornerArrowCellOverlaps(data.itemModels).some(
        (o) => o.cornerId === corner.instanceId,
      );
      if (!overlap) {
        actions.push(
          `AI-CORNER-USELESS corner #${corner.instanceId} placed on path→${vecKey(suggestion.cell)}`,
        );
        return true;
      }
      raw.occupiedPositions = originalPos;
      raw.direction1 = originalD1;
      raw.direction2 = originalD2;
    }

    data.itemModels = removeItemById(data.itemModels, corner.instanceId);
    actions.push(`AI-CORNER-USELESS removed corner #${corner.instanceId}`);
    return true;
  }

  return false;
}
