import type { Direction, LevelData, RawItem, ValidationIssue, Vec2 } from "./types.ts";
import { inBounds, vecKey } from "./types.ts";
import { collectAllItems, findArrowCellOverlaps, findCornerArrowCellOverlaps, findPipeArrowCellOverlaps, findArrowHostingCell, findArrowHostingPositions, findItemParentList, isPolylineContinuous, isRectangular } from "./items.ts";

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

  const all = collectAllItems(data.itemModels);
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
        if (![1, 2, 4, 5, 8, 13].includes(child.kind)) {
          push(
            issues,
            "V06",
            "error",
            `区域 #${item.instanceId} 子项 kind ${child.kind} 不允许（仅 1/2/4/5/8/13）`,
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

export function hasBlockingErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}
