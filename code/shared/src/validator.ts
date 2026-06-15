import type { Direction, LevelData, RawItem, ValidationIssue, Vec2 } from "./types.ts";
import { inBounds, vecKey } from "./types.ts";
import { collectAllItems, isPolylineContinuous, isRectangular } from "./items.ts";

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
    for (const pos of item.occupiedPositions) {
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

    if (item.kind === 1 || item.kind === 3) {
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
        if (![1, 4, 8].includes(child.kind)) {
          push(
            issues,
            "V06",
            "error",
            `区域 #${item.instanceId} 子项 kind ${child.kind} 不允许（仅 1/4/8）`,
            child.instanceId,
          );
        }
      }
    }

    if (item.kind === 3) {
      const passes = item.passes as { position: Vec2; directions: Vec2[] }[] | undefined;
      if (!passes || passes.length < 2) {
        push(issues, "V08", "error", `管道 #${item.instanceId} 至少需要 2 个 pass 端点`, item.instanceId);
      } else {
        const posSet = new Set(item.occupiedPositions.map((p) => vecKey(p)));
        for (const pass of passes) {
          if (!posSet.has(vecKey(pass.position))) {
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
        const hasArrow = all.some(
          (o) =>
            o.kind === 1 &&
            o.occupiedPositions.some((p) => vecKey(p) === vecKey(keyPos)),
        );
        if (!hasArrow) {
          push(issues, "V14", "warning", `钥匙 #${item.instanceId} 未绑定同格 kind 1 箭`, item.instanceId);
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

  return issues;
}

export function hasBlockingErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}
