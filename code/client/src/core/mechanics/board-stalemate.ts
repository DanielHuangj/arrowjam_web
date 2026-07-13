import type {
  ArrowItem,
  BoardSize,
  BuffItem,
  CornerItem,
  Direction,
  PipeItem,
  PipeTransitState,
  Vec2,
} from "../types.ts";
import { vecKey } from "../types.ts";
import { advanceBundleStep, type BundleManager } from "./bundle.ts";
import { isChainTriggerBuffKind } from "./buff-effects.ts";
import { dominantArrowColorId, regionForBuff } from "./buff-items.ts";
import { getCornerAt } from "./corner.ts";
import { wouldStepIntoWall } from "./moving-wall.ts";
import {
  advanceArrowStep,
  isHeadBlockedByPipe,
} from "./pipe.ts";

function pipesForSim(pipes: PipeItem[]): PipeItem[] {
  return pipes.filter((p) => p.health > 0);
}

export interface LaunchUnit {
  memberIds: number[];
  members: ArrowItem[];
}

export interface BoardStalemateContext {
  board: BoardSize;
  arrows: ArrowItem[];
  buffs: BuffItem[];
  launchableIds: Set<number>;
  launchUnits: LaunchUnit[];
  blockingArrows: ArrowItem[];
  activeCorners: CornerItem[];
  pipes: PipeItem[];
  curtainCells: Set<string>;
  wallCells: Set<string>;
  canClickBuffs: boolean;
  activeBlackHoleIds: Set<number>;
  blackHoleCells: Set<string>;
  balloonArrowFilter: (balloon: BuffItem, arrow: ArrowItem) => boolean;
}

export interface BumpCrossing {
  arrowId: number;
  cellKey: string;
}

function clonePositions(positions: Vec2[]): Vec2[] {
  return positions.map(([x, y]) => [x, y] as Vec2);
}

function isHeadBlockedByOtherArrows(
  head: Vec2,
  memberSet: Set<number>,
  allArrows: ArrowItem[],
): boolean {
  for (const other of allArrows) {
    if (memberSet.has(other.instanceId)) continue;
    for (const p of other.occupiedPositions) {
      if (p[0] === head[0] && p[1] === head[1]) return true;
    }
  }
  return false;
}

function recordNewlyEnteredCells(
  prevKeys: Set<string>,
  positions: Vec2[],
  out: Set<string>,
): Set<string> {
  const nextKeys = new Set(positions.map(vecKey));
  for (const k of nextKeys) {
    if (!prevKeys.has(k)) out.add(k);
  }
  return nextKeys;
}

function bumpBlockedAfterStep(
  head: Vec2,
  dir: Direction,
  memberSet: Set<number>,
  ctx: BoardStalemateContext,
): boolean {
  if (ctx.curtainCells.has(vecKey(head))) return true;
  if (isHeadBlockedByPipe(head, dir, ctx.pipes)) return true;
  if (getCornerAt(head, ctx.activeCorners)) return true;
  if (ctx.wallCells.size > 0 && wouldStepIntoWall(head, dir, ctx.wallCells)) {
    return true;
  }
  return isHeadBlockedByOtherArrows(head, memberSet, ctx.blockingArrows);
}

function traceSingleBumpCrossings(
  arrow: ArrowItem,
  ctx: BoardStalemateContext,
): BumpCrossing[] {
  const crossings: BumpCrossing[] = [];
  const entered = new Set<string>();
  let positions = clonePositions(arrow.occupiedPositions);
  let dir = arrow.direction;
  let transit: PipeTransitState | null = null;
  let prevKeys = new Set(positions.map(vecKey));
  const memberSet = new Set([arrow.instanceId]);
  const maxSteps =
    (ctx.board.width + ctx.board.height) * positions.length * 8;

  for (let step = 0; step < maxSteps; step++) {
    const fakeArrow: ArrowItem = {
      ...arrow,
      occupiedPositions: positions,
      direction: dir,
    };
    const result = advanceArrowStep(
      fakeArrow,
      dir,
      transit,
      ctx.activeCorners,
      pipesForSim(ctx.pipes),
      ctx.curtainCells,
      ctx.wallCells,
    );
    if (result.blocked) break;

    positions = result.arrow.occupiedPositions;
    dir = result.dir;
    transit = result.transit;
    prevKeys = recordNewlyEnteredCells(prevKeys, positions, entered);

    const head = positions.at(-1)!;
    if (bumpBlockedAfterStep(head, dir, memberSet, ctx)) break;
  }

  for (const cellKey of entered) {
    crossings.push({ arrowId: arrow.instanceId, cellKey });
  }
  return crossings;
}

function traceBundleBumpCrossings(
  unit: LaunchUnit,
  ctx: BoardStalemateContext,
): BumpCrossing[] {
  const crossings: BumpCrossing[] = [];
  const enteredByArrow = new Map<number, Set<string>>();
  for (const id of unit.memberIds) enteredByArrow.set(id, new Set());

  const positions = new Map<number, Vec2[]>();
  for (const member of unit.members) {
    positions.set(member.instanceId, clonePositions(member.occupiedPositions));
  }
  let dir = unit.members[0]!.direction;
  const memberSet = new Set(unit.memberIds);
  const maxLen = Math.max(...unit.members.map((a) => a.occupiedPositions.length), 1);
  const maxSteps = (ctx.board.width + ctx.board.height) * maxLen * 8;

  for (let step = 0; step < maxSteps; step++) {
    const result = advanceBundleStep(
      unit.memberIds,
      unit.members,
      (id) => positions.get(id)!,
      dir,
      ctx.board,
      ctx.activeCorners,
      ctx.pipes,
      ctx.curtainCells,
      ctx.wallCells,
      ctx.blockingArrows,
      memberSet,
    );
    if (result.blocked) break;

    for (const stepped of result.arrows) {
      const prev = positions.get(stepped.instanceId)!;
      const prevKeys = new Set(prev.map(vecKey));
      const entered = enteredByArrow.get(stepped.instanceId)!;
      recordNewlyEnteredCells(prevKeys, stepped.occupiedPositions, entered);
      positions.set(stepped.instanceId, clonePositions(stepped.occupiedPositions));
    }
  }

  for (const [arrowId, cells] of enteredByArrow) {
    for (const cellKey of cells) {
      crossings.push({ arrowId, cellKey });
    }
  }
  return crossings;
}

export function collectBumpCrossings(ctx: BoardStalemateContext): BumpCrossing[] {
  const out: BumpCrossing[] = [];
  for (const unit of ctx.launchUnits) {
    if (unit.memberIds.length === 1) {
      out.push(...traceSingleBumpCrossings(unit.members[0]!, ctx));
    } else {
      out.push(...traceBundleBumpCrossings(unit, ctx));
    }
  }
  return out;
}

function buffCellKeys(buff: BuffItem): string[] {
  return buff.occupiedPositions.map(vecKey);
}

function crossesBuff(
  buff: BuffItem,
  crossings: BumpCrossing[],
): BumpCrossing[] {
  const keys = new Set(buffCellKeys(buff));
  return crossings.filter((c) => keys.has(c.cellKey));
}

function balloonHasAffectedColor(
  balloon: BuffItem,
  colorId: number,
  ctx: BoardStalemateContext,
): boolean {
  return ctx.arrows.some(
    (a) => a.colorId === colorId && ctx.balloonArrowFilter(balloon, a),
  );
}

function buffInExplosiveChainRegion(
  buff: BuffItem,
  triggerableExplosiveIds: Set<number>,
  ctx: BoardStalemateContext,
): boolean {
  for (const other of ctx.buffs) {
    if (!isChainTriggerBuffKind(other.kind)) continue;
    if (!triggerableExplosiveIds.has(other.instanceId)) continue;
    const regionKeys = new Set(regionForBuff(other).map(vecKey));
    if (buffCellKeys(buff).some((k) => regionKeys.has(k))) return true;
  }
  return false;
}

function balloonChainTriggerable(
  balloon: BuffItem,
  triggerableExplosiveIds: Set<number>,
  ctx: BoardStalemateContext,
): boolean {
  const colorId = dominantArrowColorId(ctx.arrows, (a) =>
    ctx.balloonArrowFilter(balloon, a),
  );
  if (colorId == null || !balloonHasAffectedColor(balloon, colorId, ctx)) {
    return false;
  }
  return buffInExplosiveChainRegion(balloon, triggerableExplosiveIds, ctx);
}

function expandExplosiveChainTriggerable(
  buffs: BuffItem[],
  seed: Set<number>,
): Set<number> {
  const triggerable = new Set(seed);
  let changed = true;
  while (changed) {
    changed = false;
    for (const buff of buffs) {
      if (!isChainTriggerBuffKind(buff.kind)) continue;
      if (triggerable.has(buff.instanceId)) continue;
      const cellKeys = buffCellKeys(buff);
      for (const other of buffs) {
        if (!isChainTriggerBuffKind(other.kind)) continue;
        if (!triggerable.has(other.instanceId)) continue;
        const regionKeys = new Set(regionForBuff(other).map(vecKey));
        if (cellKeys.some((k) => regionKeys.has(k))) {
          triggerable.add(buff.instanceId);
          changed = true;
          break;
        }
      }
    }
  }
  return triggerable;
}

export function isBuffTriggerable(
  buff: BuffItem,
  ctx: BoardStalemateContext,
  crossings: BumpCrossing[],
  triggerableExplosiveIds: Set<number>,
): boolean {
  if (buff.kind === 17 || buff.kind === 18 || buff.kind === 19 || buff.kind === 22) {
    if (ctx.canClickBuffs) return true;
    return crossesBuff(buff, crossings).length > 0;
  }

  if (buff.kind === 23) {
    if (ctx.canClickBuffs) return true;
    if (crossesBuff(buff, crossings).length > 0) return true;
    return buffInExplosiveChainRegion(buff, triggerableExplosiveIds, ctx);
  }

  if (buff.kind === 20) {
    for (const hit of crossesBuff(buff, crossings)) {
      const arrow = ctx.arrows.find((a) => a.instanceId === hit.arrowId);
      if (!arrow) continue;
      if (balloonHasAffectedColor(buff, arrow.colorId, ctx)) return true;
    }
    return balloonChainTriggerable(buff, triggerableExplosiveIds, ctx);
  }

  if (buff.kind === 21) {
    if (!ctx.activeBlackHoleIds.has(buff.instanceId)) return false;
    return crossesBuff(buff, crossings).length > 0;
  }

  return false;
}

export function areAllArrowsBlockedFromElimination(ctx: BoardStalemateContext): boolean {
  const activeCount = ctx.launchUnits.reduce((n, u) => n + u.memberIds.length, 0);
  if (activeCount === 0) return false;
  if (ctx.launchableIds.size > 0) return false;
  if ((ctx.blackHoleCells?.size ?? 0) > 0) {
    const crossings = collectBumpCrossings(ctx);
    for (const c of crossings) {
      if (ctx.blackHoleCells.has(c.cellKey)) return false;
    }
  }
  return true;
}

export function computeTriggerableBuffIds(ctx: BoardStalemateContext): Set<number> {
  const crossings = collectBumpCrossings(ctx);
  const directExplosives = new Set<number>();
  for (const buff of ctx.buffs) {
    if (!isChainTriggerBuffKind(buff.kind)) continue;
    if (isBuffTriggerable(buff, ctx, crossings, directExplosives)) {
      directExplosives.add(buff.instanceId);
    }
  }
  const triggerableExplosives = expandExplosiveChainTriggerable(
    ctx.buffs,
    directExplosives,
  );

  const triggerable = new Set<number>();
  for (const buff of ctx.buffs) {
    if (
      isBuffTriggerable(buff, ctx, crossings, triggerableExplosives)
    ) {
      triggerable.add(buff.instanceId);
    }
  }
  return triggerable;
}

export function areAllBuffsUntriggerable(ctx: BoardStalemateContext): boolean {
  const drawable = ctx.buffs;
  if (drawable.length === 0) return true;
  const triggerable = computeTriggerableBuffIds(ctx);
  return triggerable.size === 0;
}

export function isBoardStalemate(ctx: BoardStalemateContext): boolean {
  return (
    areAllArrowsBlockedFromElimination(ctx) &&
    areAllBuffsUntriggerable(ctx)
  );
}

export function pickAutoRefreshArrowIds(
  arrows: ArrowItem[],
  include: (arrow: ArrowItem) => boolean,
  rng: () => number = Math.random,
): Set<number> {
  const eligible = arrows.filter(include);
  if (eligible.length === 0) return new Set();
  const count = Math.ceil(eligible.length / 2);
  const shuffled = [...eligible];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return new Set(shuffled.slice(0, count).map((a) => a.instanceId));
}

export function buildLaunchUnits(
  activeArrows: ArrowItem[],
  bundleManager: BundleManager,
): LaunchUnit[] {
  const units: LaunchUnit[] = [];
  const checkedGroups = new Set<number>();

  for (const arrow of activeArrows) {
    const group = bundleManager.getGroupForArrow(arrow.instanceId);
    if (group) {
      if (checkedGroups.has(group.id)) continue;
      checkedGroups.add(group.id);
      const members = group.arrowIds
        .map((id) => activeArrows.find((a) => a.instanceId === id))
        .filter((a): a is ArrowItem => a != null);
      if (members.length === 0) continue;
      units.push({ memberIds: [...group.arrowIds], members });
    } else {
      units.push({ memberIds: [arrow.instanceId], members: [arrow] });
    }
  }
  return units;
}
