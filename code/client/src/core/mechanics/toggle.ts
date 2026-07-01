import type {
  ArrowItem,
  ControllerItem,
  CornerItem,
  ShrinkPipeItem,
  ToggleItem,
  Vec2,
} from "../types.ts";
import { syncControllersForHost, syncControllersWithShrinkHosts } from "@arrowjaw/shared";
import { vecKey } from "../types.ts";
import { flipArrow } from "./flip.ts";
import { rotateCorner } from "./corner.ts";
import type { MovingWallManager } from "./moving-wall.ts";
import type { ShrinkPipeManager } from "./shrink-pipe.ts";

export interface ToggleExecutionContext {
  arrows: ArrowItem[];
  corners: CornerItem[];
  shrinkPipes: ShrinkPipeItem[];
  controllers: ControllerItem[];
  wallManager: MovingWallManager;
  shrinkPipeManager: ShrinkPipeManager;
  isToggleCovered: (toggle: ToggleItem) => boolean;
  isControllerCovered: (ctrl: ControllerItem) => boolean;
  wallHasController: (wallId: number) => boolean;
}

function clonePositions(positions: Vec2[]): Vec2[] {
  return positions.map(([x, y]) => [x, y] as Vec2);
}

function syncHostControllers(
  ctx: ToggleExecutionContext,
  hostId: number,
  oldHostPositions: Vec2[],
  newHostPositions: Vec2[],
): void {
  ctx.controllers = syncControllersForHost(
    ctx.controllers,
    hostId,
    oldHostPositions,
    newHostPositions,
  );
}

/** 本步是否有箭身段新进入 cell（穿过拨动杆仅在此刻触发一次） */
function pathEntersCell(prev: Vec2[], next: Vec2[], cell: Vec2): boolean {
  const key = vecKey(cell);
  const wasInPrev = prev.some((p) => vecKey(p) === key);
  const isInNext = next.some((p) => vecKey(p) === key);
  return isInNext && !wasInPrev;
}

export class ToggleManager {
  private flashGroupIds = new Set<number>();
  private flashElapsed = 0;

  constructor(
    private toggles: ToggleItem[],
    private controllers: ControllerItem[],
  ) {}

  getToggles(): ToggleItem[] {
    return this.toggles;
  }

  getControllers(): ControllerItem[] {
    return this.controllers;
  }

  getFlashGroupIds(): Set<number> {
    return this.flashGroupIds;
  }

  tickFlash(dt: number): void {
    if (this.flashGroupIds.size === 0) return;
    this.flashElapsed += dt;
    if (this.flashElapsed >= 0.35) {
      this.flashGroupIds.clear();
      this.flashElapsed = 0;
    }
  }

  collectCrossedToggleIds(
    prevPositions: Vec2[],
    nextPositions: Vec2[],
    ctx: ToggleExecutionContext,
  ): number[] {
    return this.toggles
      .filter(
        (t) =>
          !ctx.isToggleCovered(t) &&
          pathEntersCell(prevPositions, nextPositions, t.occupiedPositions[0]!),
      )
      .map((t) => t.instanceId)
      .sort((a, b) => a - b);
  }

  /** 箭成功消除后，结算飞行途中穿过的拨动杆 */
  commitToggles(toggleIds: number[], ctx: ToggleExecutionContext): void {
    const seen = new Set<number>();
    for (const id of toggleIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const toggle = this.toggles.find((t) => t.instanceId === id);
      if (!toggle || ctx.isToggleCovered(toggle)) continue;
      toggle.direction = toggle.direction === 1 ? 2 : 1;
      this.fireGroup(toggle.groupID, ctx);
      this.flashGroupIds.add(toggle.groupID);
      this.flashElapsed = 0;
    }
  }

  /** @deprecated 测试用：单步穿过即触发（正式逻辑在箭消除时 commit） */
  onArrowStepped(
    prevPositions: Vec2[],
    nextPositions: Vec2[],
    ctx: ToggleExecutionContext,
  ): void {
    this.commitToggles(
      this.collectCrossedToggleIds(prevPositions, nextPositions, ctx),
      ctx,
    );
  }

  private fireGroup(groupID: number, ctx: ToggleExecutionContext): void {
    const ctrls = this.controllers
      .filter((c) => c.groupID === groupID && !ctx.isControllerCovered(c))
      .sort((a, b) => a.instanceId - b.instanceId);
    for (const ctrl of ctrls) {
      this.executeController(ctrl, ctx);
    }
  }

  private executeController(ctrl: ControllerItem, ctx: ToggleExecutionContext): void {
    const id = ctrl.bindInstanceId;
    const arrow = ctx.arrows.find((a) => a.instanceId === id && a.kind === 2);
    if (arrow) {
      const idx = ctx.arrows.findIndex((a) => a.instanceId === id);
      if (idx !== -1) {
        const oldPos = clonePositions(arrow.occupiedPositions);
        const flipped = flipArrow(arrow);
        ctx.arrows[idx] = flipped;
        syncHostControllers(ctx, id, oldPos, flipped.occupiedPositions);
      }
      return;
    }
    const corner = ctx.corners.find((c) => c.instanceId === id);
    if (corner) {
      const idx = ctx.corners.findIndex((c) => c.instanceId === id);
      if (idx !== -1) {
        ctx.corners[idx] = rotateCorner(
          corner,
          corner.spin ?? 0,
          corner.spinDirection ?? 0,
        );
      }
      return;
    }
    if (ctx.wallManager.getWalls().some((w) => w.instanceId === id)) {
      const wall = ctx.wallManager.getWalls().find((w) => w.instanceId === id);
      if (wall) {
        const oldPos = clonePositions(wall.occupiedPositions);
        ctx.wallManager.advanceWall(id);
        const moved = ctx.wallManager.getWalls().find((w) => w.instanceId === id);
        if (moved) {
          syncHostControllers(ctx, id, oldPos, moved.occupiedPositions);
        }
      }
      return;
    }
    if (ctx.shrinkPipes.some((s) => s.instanceId === id)) {
      ctx.shrinkPipeManager.shortenByToggle(id);
      syncControllersWithShrinkHosts(ctx.controllers, ctx.shrinkPipes);
    }
  }

  getControlledWallIds(): Set<number> {
    const wallIds = new Set(
      this.controllers
        .map((c) => c.bindInstanceId),
    );
    return wallIds;
  }
}
