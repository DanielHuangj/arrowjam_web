import type { Direction, LevelData, RawItem, ValidationIssue, Vec2 } from "./types.ts";
import { inBounds, vecKey } from "./types.ts";
import {
  buildBoardMaskFromLevel,
  expandMaskRows,
  isOrthogonallyConnected,
  resolveBoardShape,
} from "./board-mask.ts";
import {
  isValidInvalidCellColorId,
} from "./invalid-cell-colors.ts";
import {
  isSpawnWeightAdjustTierBalanced,
  isSpawnWeightTotalValid,
  spawnWeightAdjustTierBalance,
  SPAWN_WEIGHT_TOTAL,
} from "./spawn-weight.ts";
import { collectAllItems, findArrowCellOverlaps, findCornerArrowCellOverlaps, findPipeArrowCellOverlaps, findArrowHostingCell, findArrowHostingPositions, findItemParentList, isPolylineContinuous, isRectangular, CONTROLLER_HOST_KINDS, validateShrinkStripAgainstPipe } from "./items.ts";

function push(
  issues: ValidationIssue[],
  id: string,
  severity: ValidationIssue["severity"],
  message: string,
  instanceId?: number,
): void {
  issues.push({ id, severity, message, instanceId });
}

function walkItems(
  items: RawItem[],
  fn: (item: RawItem, inZone: boolean) => void,
  inZone = false,
): void {
  for (const item of items) {
    fn(item, inZone);
    if (item.kind === 12 && item.items) walkItems(item.items, fn, true);
  }
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

export function validateLevelData(data: LevelData): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!data.width || !data.height) {
    push(issues, "V01", "error", "顶层字段缺失：width / height");
  }
  if (!Array.isArray(data.itemModels)) {
    push(issues, "V01", "error", "顶层字段缺失：itemModels");
    return issues;
  }

  validateRushFields(data, issues);

  const all = collectAllItems(data.itemModels);
  validateBoardMaskFields(data, issues, all);
  const idSet = new Map<number, number>();
  for (const item of all) {
    idSet.set(item.instanceId, (idSet.get(item.instanceId) ?? 0) + 1);
  }
  for (const [id, count] of idSet) {
    if (count > 1) {
      push(issues, "V02", "error", `instanceId ${id} 重复（${count} 次）`, id);
    }
  }

  const curtainOrders = new Map<number, number>();

  walkItems(data.itemModels, (item, inZone) => {
    if (!Array.isArray(item.occupiedPositions)) {
      push(
        issues,
        "V16",
        "error",
        `物件 #${item.instanceId} 缺少 occupiedPositions`,
        item.instanceId,
      );
      return;
    }

    for (const pos of item.occupiedPositions) {
      if (!Array.isArray(pos) || pos.length < 2) {
        push(
          issues,
          "V16",
          "error",
          `物件 #${item.instanceId} occupiedPositions 格式无效`,
          item.instanceId,
        );
        continue;
      }
      if (!inBounds(pos, data.width, data.height)) {
        push(
          issues,
          "V03",
          "error",
          `物件 #${item.instanceId} 坐标 [${pos[0]},${pos[1]}] 超出棋盘`,
          item.instanceId,
        );
      }
    }

    if (item.kind === 1 || item.kind === 2) {
      if (!isPolylineContinuous(item.occupiedPositions)) {
        push(issues, "V04", "error", `物件 #${item.instanceId} 折线不连续`, item.instanceId);
      }
      const keys = item.occupiedPositions.map((p) => vecKey(p));
      if (new Set(keys).size !== keys.length) {
        push(issues, "V12", "error", `物件 #${item.instanceId} 路径自交`, item.instanceId);
      }
    }

    if (item.kind === 6 || item.kind === 12) {
      if (!isRectangular(item.occupiedPositions as [number, number][])) {
        push(issues, "V05", "error", `物件 #${item.instanceId} 区域不是完整矩形`, item.instanceId);
      }
    }

    if (item.kind === 12 && item.items) {
      for (const child of item.items) {
        if (![1, 2, 4, 5, 8, 13, 14, 15, 16].includes(child.kind)) {
          push(
            issues,
            "V06",
            "error",
            `区域 #${item.instanceId} 子项 kind ${child.kind} 不允许（仅 1/2/4/5/8/13/14/15/16）`,
            child.instanceId,
          );
        }
      }
    }

    if (item.kind === 3) {
      if (!isPolylineContinuous(item.occupiedPositions)) {
        push(issues, "V04", "error", `物件 #${item.instanceId} 折线不连续`, item.instanceId);
      }
      const keys = item.occupiedPositions.map((p) => vecKey(p));
      if (new Set(keys).size !== keys.length) {
        push(issues, "V12", "error", `物件 #${item.instanceId} 路径自交`, item.instanceId);
      }
    }

    if (item.kind === 3) {
      const passes = item.passes as { position: Vec2; directions: Vec2[] }[] | undefined;
      if (!passes || passes.length < 2) {
        push(issues, "V08", "error", `管道 #${item.instanceId} 至少需要 2 个 pass 端点`, item.instanceId);
      } else {
        const posSet = new Set(item.occupiedPositions.map((p) => vecKey(p)));
        for (const pass of passes) {
          if (!pass || !Array.isArray(pass.position) || pass.position.length < 2) {
            push(
              issues,
              "V07",
              "error",
              `管道 #${item.instanceId} pass 格式无效（须含 position: [x,y]）`,
              item.instanceId,
            );
            continue;
          }
          if (!posSet.has(vecKey(pass.position as Vec2))) {
            push(
              issues,
              "V07",
              "error",
              `管道 #${item.instanceId} pass 位置不在 occupiedPositions 内`,
              item.instanceId,
            );
          }
        }
      }
      if (item.health == null) {
        push(issues, "V16", "error", `管道 #${item.instanceId} 缺少 health`, item.instanceId);
      }
    }

    if (item.kind === 4) {
      const d1 = item.direction1 as Vec2 | undefined;
      const d2 = item.direction2 as Vec2 | undefined;
      if (!d1 || !d2) {
        push(issues, "V16", "error", `角块 #${item.instanceId} 缺少 direction1/2`, item.instanceId);
      } else {
        const dot = d1[0] * d2[0] + d1[1] * d2[1];
        if (dot !== 0) {
          push(issues, "V09", "warning", `角块 #${item.instanceId} direction1 与 direction2 不垂直`, item.instanceId);
        }
        if (d1[0] === -d2[0] && d1[1] === -d2[1]) {
          push(issues, "V10", "error", `角块 #${item.instanceId} 方向指向后方`, item.instanceId);
        }
      }
    }

    if (item.kind === 1) {
      if (item.direction == null || item.colorId == null) {
        push(issues, "V16", "error", `箭 #${item.instanceId} 缺少 direction/colorId`, item.instanceId);
      } else if (item.occupiedPositions.length >= 2) {
        const tail = item.occupiedPositions.at(-2)!;
        const head = item.occupiedPositions.at(-1)!;
        const segDir = directionFromSegment(tail, head);
        if (segDir !== item.direction) {
          push(issues, "V11", "error", `箭 #${item.instanceId} 头部方向与末段不一致`, item.instanceId);
        }
      }
    }

    if (item.kind === 2) {
      const d1 = item.direction1 as number | undefined;
      const d2 = item.direction2 as number | undefined;
      if (d1 == null || d2 == null || item.colorId == null) {
        push(issues, "V-NEW-02", "error", `翻转箭 #${item.instanceId} 缺少 direction1/2/colorId`, item.instanceId);
      }
      if (item.layer !== 2) {
        push(issues, "V-NEW-02", "warning", `翻转箭 #${item.instanceId} layer 应为 2`, item.instanceId);
      }
      if (item.occupiedPositions.length >= 2 && d1 != null) {
        const tail = item.occupiedPositions.at(-2)!;
        const head = item.occupiedPositions.at(-1)!;
        const segDir = directionFromSegment(tail, head);
        if (segDir !== d1) {
          push(
            issues,
            "V11",
            "error",
            `翻转箭 #${item.instanceId} direction1 与末段不一致（箭头应顺箭身）`,
            item.instanceId,
          );
        }
        const rev = [...item.occupiedPositions].reverse();
        const revTail = rev.at(-2)!;
        const revHead = rev.at(-1)!;
        const flipDir = directionFromSegment(revTail, revHead);
        if (d2 != null && flipDir !== d2) {
          push(
            issues,
            "V11",
            "error",
            `翻转箭 #${item.instanceId} direction2 与翻转后末段不一致`,
            item.instanceId,
          );
        }
      }
    }

    if (item.kind === 5) {
      if (item.time == null || (item.time as number) <= 0) {
        push(issues, "V-NEW-05", "error", `炸弹 #${item.instanceId} 缺少有效 time`, item.instanceId);
      }
      if (item.occupiedPositions.length !== 1) {
        push(issues, "V-NEW-05", "error", `炸弹 #${item.instanceId} 须占 1 格`, item.instanceId);
      }
      if (item.layer !== 3) {
        push(issues, "V-NEW-05", "warning", `炸弹 #${item.instanceId} layer 应为 3`, item.instanceId);
      }
      const cell = item.occupiedPositions[0];
      if (cell) {
        const hasHost = findArrowHostingCell(data.itemModels, cell, item.instanceId) != null;
        if (!hasHost) {
          push(issues, "V-NEW-05", "error", `炸弹 #${item.instanceId} 未绑定箭`, item.instanceId);
        }
      }
    }

    if (item.kind === 7) {
      const path = item.movingPath as Vec2[] | undefined;
      if (!path || path.length < 2) {
        push(issues, "V-NEW-07", "error", `移动墙 #${item.instanceId} movingPath 至少 2 格`, item.instanceId);
      } else {
        for (const p of path) {
          if (!inBounds(p, data.width, data.height)) {
            push(issues, "V-NEW-07", "error", `移动墙 #${item.instanceId} 路径点超出棋盘`, item.instanceId);
            break;
          }
        }
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1]!;
          const b = path[i]!;
          const dx = Math.abs(b[0] - a[0]);
          const dy = Math.abs(b[1] - a[1]);
          if (dx + dy !== 1) {
            push(issues, "V-NEW-07", "error", `移动墙 #${item.instanceId} 路径须正交连续`, item.instanceId);
            break;
          }
        }
      }
      const dist = item.movingDistance as number | undefined;
      if (dist == null || dist < 1) {
        push(issues, "V-NEW-07", "error", `移动墙 #${item.instanceId} movingDistance 须 ≥ 1`, item.instanceId);
      }
      const mt = item.movingType as number | undefined;
      if (mt !== 1 && mt !== 2) {
        push(issues, "V-NEW-07", "error", `移动墙 #${item.instanceId} movingType 须为 1 或 2`, item.instanceId);
      }
      if (inZone) {
        push(issues, "V-NEW-07", "error", `移动墙 #${item.instanceId} 不可置于子区域内`, item.instanceId);
      }
    }

    if (item.kind === 14) {
      const shorten = item.shorten as number | undefined;
      if (shorten == null || shorten < 1) {
        push(issues, "V-P8-14", "error", `收缩障碍 #${item.instanceId} shorten 须 ≥ 1`, item.instanceId);
      }
      const bind = item.bindCoordinate as Vec2 | undefined;
      if (!bind) {
        push(issues, "V-P8-14", "error", `收缩障碍 #${item.instanceId} 缺少 bindCoordinate`, item.instanceId);
      }
      if (!isPolylineContinuous(item.occupiedPositions)) {
        push(issues, "V-P8-14", "error", `收缩障碍 #${item.instanceId} 路径不连续`, item.instanceId);
      }
      if (bind) {
        const pipes = all.filter((p) => p.kind === 3);
        const hostPipe = pipes.find((p) =>
          p.occupiedPositions.some((pc) => vecKey(pc) === vecKey(bind)),
        );
        if (!hostPipe) {
          push(
            issues,
            "V-P8-14",
            "error",
            `收缩障碍 #${item.instanceId} bindCoordinate 不在管道占格上`,
            item.instanceId,
          );
        } else {
          const msg = validateShrinkStripAgainstPipe(
            bind,
            item.occupiedPositions,
            hostPipe.occupiedPositions,
          );
          if (msg) {
            push(issues, "V-P8-14", "error", `收缩障碍 #${item.instanceId} ${msg}`, item.instanceId);
          }
        }
      }
    }

    if (item.kind === 15) {
      if (item.occupiedPositions.length !== 1) {
        push(issues, "V-P8-15", "error", `拨动杆 #${item.instanceId} 须占 1 格`, item.instanceId);
      }
      const groupID = item.groupID as number | undefined;
      if (groupID == null || groupID < 1) {
        push(issues, "V-P8-15", "error", `拨动杆 #${item.instanceId} groupID 无效`, item.instanceId);
      }
    }

    if (item.kind === 16) {
      if (item.occupiedPositions.length !== 1) {
        push(issues, "V-P8-16", "error", `控制器 #${item.instanceId} 须占 1 格`, item.instanceId);
      }
      const groupID = item.groupID as number | undefined;
      const bindInstanceId = item.bindInstanceId as number | undefined;
      if (groupID == null || groupID < 1) {
        push(issues, "V-P8-16", "error", `控制器 #${item.instanceId} groupID 无效`, item.instanceId);
      }
      if (bindInstanceId == null) {
        push(issues, "V-P8-16", "error", `控制器 #${item.instanceId} 缺少 bindInstanceId`, item.instanceId);
      } else {
        const host = all.find((h) => h.instanceId === bindInstanceId);
        if (!host || !CONTROLLER_HOST_KINDS.has(host.kind)) {
          push(
            issues,
            "V-P8-16",
            "error",
            `控制器 #${item.instanceId} 绑定宿主无效（须 kind2/4/7/14）`,
            item.instanceId,
          );
        } else {
          const ctrlCell = item.occupiedPositions[0];
          if (
            ctrlCell &&
            !host.occupiedPositions.some((p) => vecKey(p) === vecKey(ctrlCell))
          ) {
            push(
              issues,
              "V-P8-16",
              "error",
              `控制器 #${item.instanceId} 须落在宿主占格内`,
              item.instanceId,
            );
          }
        }
      }
    }

    if (item.kind === 4) {
      const spin = item.spin as number | undefined;
      if (spin != null && ![0, 90, 180, 270].includes(spin)) {
        push(issues, "V-P8-CORNER", "error", `角块 #${item.instanceId} spin 无效`, item.instanceId);
      }
    }

    if (item.kind === 13) {
      const health = item.health as number | undefined;
      if (health == null || health < 1) {
        push(issues, "V-NEW-13", "error", `冻结 #${item.instanceId} health 须 ≥ 1`, item.instanceId);
      }
      if (item.layer !== 8) {
        push(issues, "V-NEW-13", "error", `冻结 #${item.instanceId} layer 须为 8`, item.instanceId);
      }
      const host = findArrowHostingPositions(
        data.itemModels,
        item.occupiedPositions,
        item.instanceId,
      );
      if (!host) {
        push(issues, "V-NEW-13", "error", `冻结 #${item.instanceId} 未绑定同格箭`, item.instanceId);
      }
    }

    if (item.kind === 6) {
      if (item.health == null) {
        push(issues, "V16", "error", `幕布 #${item.instanceId} 缺少 health`, item.instanceId);
      }
      const order = (item.order as number) ?? 0;
      curtainOrders.set(order, (curtainOrders.get(order) ?? 0) + 1);
      if (item.layer !== 8) {
        push(issues, "V16", "warning", `幕布 #${item.instanceId} layer 应为 8`, item.instanceId);
      }
    }

    if (item.kind === 8) {
      const len = item.occupiedPositions.length;
      if (len < 2 || len > 4) {
        push(issues, "V15", "error", `捆绑 #${item.instanceId} 须占 2~4 格`, item.instanceId);
      }
    }

    if (item.kind === 11) {
      const keyPos = item.occupiedPositions[0];
      if (keyPos) {
        const hasArrow = findArrowHostingCell(data.itemModels, keyPos, item.instanceId) != null;
        if (!hasArrow) {
          push(issues, "V14", "warning", `钥匙 #${item.instanceId} 未绑定同格箭`, item.instanceId);
        }
      }
    }

    if (inZone && ![1, 4, 8].includes(item.kind)) {
      // child kinds checked above in zone.items loop
    }
  });

  for (const [order, count] of curtainOrders) {
    if (count > 1) {
      push(issues, "V13", "warning", `幕布 order ${order} 重复（${count} 个）`);
    }
  }

  for (const o of findPipeArrowCellOverlaps(data.itemModels)) {
    push(
      issues,
      "V-PIPE-01",
      "error",
      `管道 #${o.pipeId} 与箭 #${o.arrowId} 共享格子 ${o.cell}`,
      o.pipeId,
    );
  }

  for (const o of findCornerArrowCellOverlaps(data.itemModels)) {
    push(
      issues,
      "V-CORNER-01",
      "error",
      `反射角 #${o.cornerId} 与箭 #${o.arrowId} 共享格子 ${o.cell}（角块与箭身不可重叠）`,
      o.cornerId,
    );
  }

  for (const o of findArrowCellOverlaps(data.itemModels)) {
    push(
      issues,
      "V-ARROW-01",
      "error",
      `折线箭 #${o.ids.join(" 与 #")} 共享格子 ${o.cell}`,
      o.ids[0],
    );
  }

  const toggleGroups = new Set<number>();
  const controllerGroups = new Set<number>();
  for (const item of all) {
    if (item.kind === 15) {
      const g = item.groupID as number | undefined;
      if (g != null && g >= 1) toggleGroups.add(g);
    }
    if (item.kind === 16) {
      const g = item.groupID as number | undefined;
      if (g != null && g >= 1) controllerGroups.add(g);
    }
  }
  for (const g of new Set([...toggleGroups, ...controllerGroups])) {
    if (!toggleGroups.has(g)) {
      push(issues, "V-P8-GROUP", "warning", `分组 ${g} 缺少拨动杆（kind15）`);
    }
    if (!controllerGroups.has(g)) {
      push(issues, "V-P8-GROUP", "warning", `分组 ${g} 缺少控制器（kind16）`);
    }
  }

  for (const item of all) {
    if (item.kind !== 15 && item.kind !== 16) continue;
    const cell = item.occupiedPositions[0];
    if (!cell) continue;
    const key = vecKey(cell);
    for (const other of all) {
      if (other.instanceId === item.instanceId) continue;
      if (other.kind === 6 || other.kind === 12) continue;
      if (item.kind === 16 && other.instanceId === (item.bindInstanceId as number)) {
        continue;
      }
      if (other.occupiedPositions.some((p) => vecKey(p) === key)) {
        push(
          issues,
          "V-P8-CELL",
          "error",
          `物件 #${item.instanceId} 与 #${other.instanceId} 共享格子 ${key}`,
          item.instanceId,
        );
        break;
      }
    }
  }

  for (const arrow of all) {
    if (arrow.kind !== 1 && arrow.kind !== 2) continue;
    const siblings = findItemParentList(data.itemModels, arrow.instanceId)?.list ?? [];
    let attachments = 0;
    const arrowCells = new Set(arrow.occupiedPositions.map((p) => vecKey(p)));

    for (const other of siblings) {
      if (other.instanceId === arrow.instanceId) continue;
      if (other.kind === 13) {
        if (
          other.occupiedPositions.length === arrow.occupiedPositions.length &&
          other.occupiedPositions.every(
            (p, i) =>
              p[0] === arrow.occupiedPositions[i]![0] &&
              p[1] === arrow.occupiedPositions[i]![1],
          )
        ) {
          attachments += 1;
        }
      } else if (other.kind === 5 || other.kind === 11) {
        const cell = other.occupiedPositions[0];
        if (cell && arrowCells.has(vecKey(cell))) attachments += 1;
      }
    }
    if (attachments > 1) {
      push(
        issues,
        "V-EDIT-01",
        "error",
        `箭 #${arrow.instanceId} 不可同时绑定多种附件（钥匙/炸弹/冻结）`,
        arrow.instanceId,
      );
    }
  }

  return issues;
}

function spawnPoolEntryKey(entry: import("./types.ts").SpawnPoolEntry): string {
  return `${entry.kind}:${entry.colorId ?? ""}:${entry.bombRadius ?? ""}:${entry.crossArm ?? ""}`;
}

function validateRushFields(data: import("./types.ts").LevelData, issues: ValidationIssue[]): void {
  const isRush =
    data.gameMode === "rush" ||
    (data.gameMode !== "classic" &&
      (data.spawnIntervalSec != null ||
        (data.spawnPool != null && data.spawnPool.length > 0) ||
        (data.levelGoals != null && data.levelGoals.length > 0)));

  if (!isRush) return;

  if (data.spawnIntervalSec == null || data.spawnIntervalSec <= 0) {
    push(issues, "V-V2-001", "error", "rush 模式缺少有效的 spawnIntervalSec");
  }
  if (!data.spawnPool || data.spawnPool.length === 0) {
    push(issues, "V-V2-001", "error", "rush 模式缺少 spawnPool");
  }
  if (!data.levelGoals || data.levelGoals.length === 0) {
    push(issues, "V-V2-001", "error", "rush 模式缺少 levelGoals");
  }

  if (data.spawnPool) {
    const sum = data.spawnPool.reduce((s, e) => s + e.weight, 0);
    if (!isSpawnWeightTotalValid(sum)) {
      push(issues, "V-V2-002", "error", `spawnPool 权重之和须为 ${SPAWN_WEIGHT_TOTAL}，当前为 ${sum}`);
    }
    const keys = new Set<string>();
    for (const entry of data.spawnPool) {
      const key = spawnPoolEntryKey(entry);
      if (keys.has(key)) {
        push(issues, "V-V2-003", "error", `spawnPool 重复条目: ${key}`);
      }
      keys.add(key);
      if ((entry.kind === 1 || entry.kind === 2) && entry.colorId == null) {
        push(issues, "V-V2-004", "error", `spawnPool 箭头条目须配置 colorId`);
      }
      if (entry.kind === 17 && entry.bombRadius !== 1 && entry.bombRadius !== 2) {
        push(issues, "V-V2-004", "error", `spawnPool 区域炸弹须配置 bombRadius`);
      }
      if (entry.kind === 18 && entry.crossArm !== 2 && entry.crossArm !== 5) {
        push(issues, "V-V2-004", "error", `spawnPool 十字炸弹须配置 crossArm`);
      }
    }
  }

  if (data.spawnWeightAdjust != null) {
    if (data.spawnWeightAdjust.length === 0) {
      push(issues, "V-V2-006", "error", "spawnWeightAdjust 须至少包含一段配置");
    }
    let prevMin = -1;
    for (const tier of [...data.spawnWeightAdjust].sort(
      (a, b) => a.minElimCells - b.minElimCells,
    )) {
      if (!Number.isFinite(tier.minElimCells) || tier.minElimCells < 0) {
        push(issues, "V-V2-006", "error", "spawnWeightAdjust.minElimCells 须为非负整数");
      }
      if (tier.minElimCells <= prevMin) {
        push(
          issues,
          "V-V2-006",
          "error",
          "spawnWeightAdjust 各段 minElimCells 须严格升序",
        );
      }
      prevMin = tier.minElimCells;
      for (const key of ["buffDelta", "arrowDelta", "mechDelta"] as const) {
        if (!Number.isFinite(tier[key])) {
          push(
            issues,
            "V-V2-006",
            "error",
            `spawnWeightAdjust.${key} 须为有效数字`,
          );
        }
      }
      if (
        Number.isFinite(tier.buffDelta) &&
        Number.isFinite(tier.arrowDelta) &&
        Number.isFinite(tier.mechDelta) &&
        !isSpawnWeightAdjustTierBalanced(tier)
      ) {
        push(
          issues,
          "V-V2-007",
          "error",
          `spawnWeightAdjust（≥${tier.minElimCells}）须满足 增益+ = 箭头− + 机制−（保持总分 ${SPAWN_WEIGHT_TOTAL}），当前差额 ${spawnWeightAdjustTierBalance(tier).toFixed(1)}`,
        );
      }
    }
    const first = data.spawnWeightAdjust.reduce(
      (m, t) => (t.minElimCells < m.minElimCells ? t : m),
      data.spawnWeightAdjust[0]!,
    );
    if (first.minElimCells !== 0) {
      push(
        issues,
        "V-V2-006",
        "warning",
        "spawnWeightAdjust 建议首段 minElimCells 为 0",
      );
    }
  }

  if (data.levelGoals) {
    for (const goal of data.levelGoals) {
      if (goal.type === "clearArrowCount") {
        if (goal.count <= 0) {
          push(issues, "V-V2-005", "error", "clearArrowCount 须大于 0");
        }
      } else if (goal.type === "clearColorArrows") {
        if (!goal.targets.length) {
          push(issues, "V-V2-005", "error", "clearColorArrows 须至少一个颜色目标");
        }
        for (const t of goal.targets) {
          if (t.colorId <= 0 || t.count <= 0) {
            push(issues, "V-V2-005", "error", "颜色目标须指定有效 colorId 与 count");
          }
        }
      }
    }
  }
}

function validateBoardMaskFields(
  data: LevelData,
  issues: ValidationIssue[],
  all: RawItem[],
): void {
  const boardShape = resolveBoardShape(data);
  const { playableCells, blackHoleCells } = buildBoardMaskFromLevel(data);

  if (boardShape === "custom") {
    if (!data.playableMask?.rows?.length) {
      push(issues, "V-BOARD-01", "error", "异形棋盘缺少 playableMask");
    } else if (playableCells.size === 0) {
      push(issues, "V-BOARD-01", "error", "有效格不能为空");
    }
  }

  for (const item of all) {
    for (const pos of item.occupiedPositions) {
      const key = vecKey(pos);
      if (boardShape === "custom" && !playableCells.has(key)) {
        push(
          issues,
          "V-BOARD-02",
          "error",
          `物件 #${item.instanceId} 坐标 [${pos[0]},${pos[1]}] 不在有效格内`,
          item.instanceId,
        );
      }
      if (blackHoleCells.has(key)) {
        push(
          issues,
          "V-BOARD-05",
          "error",
          `物件 #${item.instanceId} 坐标 [${pos[0]},${pos[1]}] 与黑洞区域重叠`,
          item.instanceId,
        );
      }
    }
  }

  for (const key of blackHoleCells) {
    if (!playableCells.has(key)) {
      push(issues, "V-BOARD-03", "error", `黑洞格 ${key} 不在有效格内`);
    }
  }

  for (let i = 0; i < (data.blackHoleRegions?.length ?? 0); i++) {
    const region = data.blackHoleRegions![i]!;
    const cells = expandMaskRows(data.width, data.height, region.rows ?? []);
    if (cells.size > 0 && !isOrthogonallyConnected(cells)) {
      push(issues, "V-BOARD-04", "warning", `黑洞区域 #${i + 1} 未四邻连通`);
    }
  }

  if (data.invalidCellColors?.length) {
    const total = data.width * data.height;
    const invalidCells = new Set<string>();
    if (boardShape === "custom") {
      for (let y = 0; y < data.height; y++) {
        for (let x = 0; x < data.width; x++) {
          const key = vecKey([x, y]);
          if (!playableCells.has(key)) invalidCells.add(key);
        }
      }
    }
    for (let i = 0; i < data.invalidCellColors.length; i++) {
      const entry = data.invalidCellColors[i]!;
      if (!isValidInvalidCellColorId(entry.color)) {
        push(
          issues,
          "V-BOARD-06",
          "error",
          `无效格着色 #${i + 1} 使用了非法颜色 ${entry.color}`,
        );
        continue;
      }
      for (const key of expandMaskRows(data.width, data.height, entry.rows ?? [])) {
        if (boardShape !== "custom") {
          push(issues, "V-BOARD-06", "error", `无效格着色 ${key} 仅可用于异形棋盘`);
        } else if (!invalidCells.has(key)) {
          push(issues, "V-BOARD-06", "error", `无效格着色 ${key} 不在无效格内`);
        }
      }
    }
    if (boardShape === "custom" && playableCells.size === total && data.invalidCellColors.length > 0) {
      push(issues, "V-BOARD-06", "warning", "全格有效时无效格着色将被忽略");
    }
  }
}

export function hasBlockingErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}
