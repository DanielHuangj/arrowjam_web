import type {
  ArrowItem,
  BombItem,
  BundleItem,
  CornerItem,
  Direction,
  FrozenOverlayItem,
  GameLevel,
  GamePhase,
  GameSnapshot,
  KeyArrowItem,
  LaunchAnimation,
  LostReason,
  PipeItem,
  Vec2,
} from "../types.ts";
import { vecKey } from "../types.ts";
import { CellMap, arrowFullyOffBoard } from "../board/cell-map.ts";
import { simulateCanExit } from "../board/path-check.ts";
import { BundleManager, advanceBundleStep } from "../mechanics/bundle.ts";
import { CurtainManager } from "../mechanics/curtain.ts";
import {
  arrowHasKey,
  buildKeyCellSet,
  countKeysOnPositions,
  isKeyCellVisible,
} from "../mechanics/key-arrow.ts";
import {
  advanceArrowStep,
  decrementPipeHealth,
  isHeadBlockedByPipe,
  pruneDeadPipes,
} from "../mechanics/pipe.ts";
import { getCornerAt } from "../mechanics/corner.ts";
import { ZoneManager } from "../mechanics/zone.ts";
import { flipUncoveredArrows } from "../mechanics/flip.ts";
import { BombManager, BOMB_EXPLOSION_DURATION } from "../mechanics/bomb.ts";
import { MovingWallManager, wouldStepIntoWall } from "../mechanics/moving-wall.ts";
import { FrozenManager } from "../mechanics/frozen.ts";
import {
  getAnimStepIntervalMs as computeAnimStepIntervalMs,
} from "./anim-timing.ts";

export const VANISH_ANIM_STEPS = 12;
export const RANDOM_VANISH_COUNT = 3;

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function clonePositions(positions: Vec2[]): Vec2[] {
  return positions.map(([x, y]) => [x, y]);
}

function withPositions(arrow: ArrowItem, positions: Vec2[]): ArrowItem {
  return { ...arrow, occupiedPositions: clonePositions(positions) };
}

function snapshotPositions(arrows: ArrowItem[], ids: number[]): Record<number, Vec2[]> {
  const out: Record<number, Vec2[]> = {};
  for (const id of ids) {
    const arrow = arrows.find((a) => a.instanceId === id);
    if (arrow) out[id] = clonePositions(arrow.occupiedPositions);
  }
  return out;
}

function snapshotDirections(arrows: ArrowItem[], ids: number[]): Record<number, Direction> {
  const out: Record<number, Direction> = {};
  for (const id of ids) {
    const arrow = arrows.find((a) => a.instanceId === id);
    if (arrow) out[id] = arrow.direction;
  }
  return out;
}

export class GameState {
  phase: GamePhase = "playing";
  level: GameLevel;
  remainingSeconds: number;
  arrows: ArrowItem[];
  corners: CornerItem[];
  bundles: BundleItem[];
  pipes: PipeItem[];
  cellMap: CellMap = CellMap.fromArrows([]);
  zoneManager: ZoneManager;
  bundleManager: BundleManager;
  curtainManager: CurtainManager;
  keys: KeyArrowItem[];
  bombManager: BombManager;
  wallManager: MovingWallManager;
  frozenManager: FrozenManager;
  private keyCells: Set<string>;
  private clearedTraceCells = new Set<string>();
  mistakeCount = 0;
  animation: LaunchAnimation | null = null;
  lostReason: LostReason | null = null;
  private bombExplosion: { cells: Vec2[]; elapsed: number } | null = null;

  constructor(level: GameLevel) {
    this.level = level;
    this.remainingSeconds = level.durationInSec;
    this.corners = level.corners.map((c) => ({
      ...c,
      occupiedPositions: clonePositions(c.occupiedPositions),
    }));
    this.bundles = level.bundles.map((b) => ({
      ...b,
      occupiedPositions: clonePositions(b.occupiedPositions),
    }));
    this.arrows = level.arrows.map((a) => ({
      ...a,
      occupiedPositions: clonePositions(a.occupiedPositions),
    }));
    this.pipes = level.pipes.map((p) => ({
      ...p,
      occupiedPositions: clonePositions(p.occupiedPositions),
      passes: p.passes.map((pass) => ({
        position: [pass.position[0], pass.position[1]] as Vec2,
        directions: pass.directions.map(([x, y]) => [x, y] as Vec2),
      })),
      health: p.health,
    }));
    this.zoneManager = new ZoneManager(level.zones);
    this.bundleManager = new BundleManager(this.bundles, this.arrows);
    this.curtainManager = new CurtainManager(level.curtains ?? []);
    this.keys = (level.keys ?? []).map((k) => ({
      ...k,
      occupiedPositions: clonePositions(k.occupiedPositions),
    }));
    this.bombManager = new BombManager(level.bombs ?? [], this.arrows);
    this.wallManager = new MovingWallManager(level.movingWalls ?? []);
    this.frozenManager = new FrozenManager(level.frozenOverlays ?? []);
    this.keyCells = buildKeyCellSet(this.keys);
    this.rebuildCellMap();
    this.bombManager.updateActivation((bomb) => this.isBombCoveredForActivation(bomb));
  }

  private getCurtainCells(): Set<string> {
    return this.curtainManager.getActiveCellKeys();
  }

  getBlockingArrows(): ArrowItem[] {
    return this.arrows.filter(
      (a) =>
        !this.curtainManager.isArrowHidden(a) &&
        this.zoneManager.isArrowActive(a, this.arrows, this.corners),
    );
  }

  /** 可操作的箭（冰冻中的宿主箭不可发射/消除） */
  getActiveArrows(): ArrowItem[] {
    return this.getBlockingArrows().filter(
      (a) => !this.frozenManager.isHostFrozen(a.instanceId),
    );
  }

  private isArrowCoveredForMechanics(arrow: ArrowItem): boolean {
    if (this.curtainManager.isArrowHidden(arrow)) return true;
    if (!this.zoneManager.isArrowActive(arrow, this.arrows, this.corners)) {
      return true;
    }
    if (this.frozenManager.isHostFrozen(arrow.instanceId)) return true;
    return false;
  }

  private isBombCoveredForActivation(bomb: BombItem): boolean {
    if (!this.isMechanicDrawable(bomb.zoneId)) return true;
    const host = this.arrows.find((a) => a.instanceId === bomb.hostArrowId);
    if (!host) return true;
    if (bomb.zoneId !== host.zoneId) return true;
    return this.isArrowCoveredForMechanics(host);
  }

  getWallBlockerCells(): Set<string> {
    return this.wallManager.getBlockerCells();
  }

  private onArrowEliminationBatch(
    removedArrows: ArrowItem[],
    originalPositionsById?: Record<number, Vec2[]>,
  ): void {
    if (removedArrows.length === 0) return;

    const forFrozen = removedArrows.map((arrow) => {
      const orig = originalPositionsById?.[arrow.instanceId];
      return orig ? { ...arrow, occupiedPositions: orig } : arrow;
    });
    this.frozenManager.onAdjacentElimination(forFrozen, (overlay) =>
      this.canFrozenOverlayTakeAdjacentDamage(overlay),
    );
    this.arrows = flipUncoveredArrows(this.arrows, (a) =>
      this.isArrowCoveredForMechanics(a),
    );
    this.wallManager.advanceAll();

    const hostIds = new Set(removedArrows.map((a) => a.instanceId));
    this.bombManager.removeForHosts(hostIds);
    this.bombManager.updateActivation((bomb) => this.isBombCoveredForActivation(bomb));
  }

  getActiveCorners(): CornerItem[] {
    return this.corners.filter((c) =>
      this.zoneManager.isCornerActive(c, this.arrows, this.corners),
    );
  }

  getActiveBundles(): BundleItem[] {
    return this.bundles.filter(
      (b) =>
        !this.curtainManager.arePositionsHidden(b.occupiedPositions) &&
        this.zoneManager.isArrowActive(
          {
            kind: 1,
            instanceId: -1,
            layer: 2,
            zoneId: b.zoneId,
            occupiedPositions: b.occupiedPositions,
            direction: 1,
            colorId: 1,
          },
          this.arrows,
          this.corners,
        ),
    );
  }

  getActivePipes(): PipeItem[] {
    return this.pipes.filter(
      (p) =>
        p.health > 0 &&
        this.zoneManager.isArrowActive(
          {
            kind: 1,
            instanceId: -1,
            layer: 2,
            zoneId: p.zoneId,
            occupiedPositions: p.occupiedPositions,
            direction: 1,
            colorId: 1,
          },
          this.arrows,
          this.corners,
        ),
    );
  }

  private applyKeyRewards(
    removedArrows: ArrowItem[],
    anim: LaunchAnimation,
  ): void {
    let keys = 0;
    for (const arrow of removedArrows) {
      const positions =
        anim.originalPositionsById[arrow.instanceId] ??
        arrow.occupiedPositions;
      keys += countKeysOnPositions(positions, this.keyCells);
    }
    if (keys > 0) this.curtainManager.applyKey(keys);
  }

  private applyPipeCrossingDamage(anim: LaunchAnimation): void {
    if (anim.mode !== "exit") return;
    const pipeIds = new Set<number>();
    for (const id of anim.memberIds) {
      for (const pipeId of anim.pipesCrossedById[id] ?? []) {
        pipeIds.add(pipeId);
      }
    }
    for (const pipeId of pipeIds) {
      decrementPipeHealth(this.pipes, pipeId);
    }
    this.pipes = pruneDeadPipes(this.pipes);
  }

  private clearPipeAnimState(anim: LaunchAnimation): void {
    for (const id of anim.memberIds) {
      anim.pipeTransitById[id] = null;
      anim.pipesCrossedById[id] = [];
    }
  }

  /** 正在管道内穿行的箭头（渲染时隐藏，位于管道层下） */
  getPipeHiddenArrowIds(): Set<number> {
    const anim = this.animation;
    if (!anim) return new Set();
    const hidden = new Set<number>();
    for (const id of anim.memberIds) {
      if (anim.pipeTransitById[id]) hidden.add(id);
    }
    return hidden;
  }

  rebuildCellMap(): void {
    this.cellMap = CellMap.fromArrows(this.getBlockingArrows());
  }

  snapshot(): GameSnapshot {
    return {
      phase: this.phase,
      level: this.level,
      remainingSeconds: this.remainingSeconds,
      arrows: this.arrows,
      mistakeCount: this.mistakeCount,
      animation: this.animation,
    };
  }

  /** 测试用：增加剩余时间 */
  addTime(seconds: number): void {
    if (this.phase !== "playing" && this.phase !== "animating") return;
    this.remainingSeconds += seconds;
  }

  tick(dt: number): void {
    if (this.phase === "exploding") {
      if (this.bombExplosion) {
        this.bombExplosion.elapsed += dt;
        if (this.bombExplosion.elapsed >= BOMB_EXPLOSION_DURATION) {
          this.lostReason = "bomb";
          this.phase = "lost";
          this.bombExplosion = null;
        }
      }
      return;
    }

    if (this.phase !== "playing" && this.phase !== "animating") return;
    if (this.phase === "playing" || this.phase === "animating") {
      this.remainingSeconds -= dt;
      if (this.remainingSeconds <= 0) {
        this.remainingSeconds = 0;
        if (this.arrows.length > 0 && this.phase === "playing") {
          this.lostReason = "time";
          this.phase = "lost";
        }
      }
    }
    this.bombManager.updateActivation((bomb) => this.isBombCoveredForActivation(bomb));
    const explodedCells = this.bombManager.tick(dt);
    if (
      explodedCells.length > 0 &&
      this.arrows.length > 0 &&
      (this.phase === "playing" || this.phase === "animating")
    ) {
      this.startBombExplosion(explodedCells);
    }
  }

  private startBombExplosion(cells: Vec2[]): void {
    this.bombExplosion = {
      cells: cells.map(([x, y]) => [x, y] as Vec2),
      elapsed: 0,
    };
    this.finishAnimation();
    this.phase = "exploding";
  }

  tryLaunch(instanceId: number): boolean {
    if (this.phase !== "playing") return false;
    const arrow = this.arrows.find((a) => a.instanceId === instanceId);
    if (
      !arrow ||
      !this.zoneManager.isArrowActive(arrow, this.arrows, this.corners)
    ) {
      return false;
    }

    const memberIds = this.bundleManager.getMemberIds(instanceId);
    const activeArrows = this.getActiveArrows();
    const blockingArrows = this.getBlockingArrows();
    const activeCorners = this.getActiveCorners();
    const group = this.bundleManager.getGroupForArrow(instanceId);
    const stripIds = group?.stripIds ?? [];

    const canExit = group
      ? this.bundleManager.canLaunchGroup(
          group,
          activeArrows,
          activeCorners,
          this.level,
          this.getActivePipes(),
          this.getCurtainCells(),
          this.getWallBlockerCells(),
          blockingArrows,
        )
      : simulateCanExit(
          arrow,
          blockingArrows,
          activeCorners,
          this.level,
          this.getActivePipes(),
          this.getCurtainCells(),
          this.getWallBlockerCells(),
        );
    if (!canExit) this.mistakeCount++;

    this.phase = "animating";
    this.animation = {
      instanceId,
      memberIds,
      stripIds,
      mode: canExit ? "exit" : "bump",
      originalPositionsById: snapshotPositions(this.arrows, memberIds),
      originalDirectionById: snapshotDirections(this.arrows, memberIds),
      originalStripPositionsById:
        this.bundleManager.snapshotStripPositions(stripIds, this.bundles),
      bumpHistoryById: Object.fromEntries(memberIds.map((id) => [id, []])),
      stripBumpHistoryById: Object.fromEntries(stripIds.map((id) => [id, []])),
      reversing: false,
      currentDirectionById: snapshotDirections(this.arrows, memberIds),
      stepCount: 0,
      flightStepCount: 0,
      pipeTransitById: Object.fromEntries(memberIds.map((id) => [id, null])),
      pipesCrossedById: Object.fromEntries(memberIds.map((id) => [id, []])),
    };
    return true;
  }

  /** 修复 animating 阶段卡死（animation 丢失或成员已清空） */
  recoverAnimationState(): void {
    if (this.phase === "animating" && !this.animation) {
      this.phase = "playing";
      this.rebuildCellMap();
      return;
    }
    if (this.phase !== "animating" || !this.animation) return;

    const anim = this.animation;
    const remaining = anim.memberIds.filter((id) =>
      this.arrows.some((a) => a.instanceId === id),
    );
    if (remaining.length === 0) {
      if (anim.mode === "exit") {
        this.completeLaunchAnimation();
      } else {
        this.finishAnimationOrPlaying();
      }
    }
  }

  private maxAnimationSteps(): number {
    if (this.animation?.mode === "vanish") return VANISH_ANIM_STEPS;
    const len = Math.max(
      ...this.arrows.map((a) => a.occupiedPositions.length),
      1,
    );
    const pipeLen = Math.max(
      ...this.pipes.map((p) => p.occupiedPositions.length),
      0,
    );
    return (this.level.width + this.level.height + len + pipeLen) * 8;
  }

  private allMembersOffBoard(memberIds: number[]): boolean {
    return memberIds.every((id) => {
      const arrow = this.arrows.find((a) => a.instanceId === id);
      return !arrow || arrowFullyOffBoard(arrow, this.level);
    });
  }

  private completeLaunchAnimation(): void {
    const anim = this.animation;
    if (!anim) {
      this.phase = "playing";
      this.rebuildCellMap();
      return;
    }

    const removeIds = new Set(anim.memberIds);
    const group = this.bundleManager.getGroupForArrow(anim.instanceId);
    const removedArrows = this.arrows.filter((a) => removeIds.has(a.instanceId));

    this.applyKeyRewards(removedArrows, anim);
    for (const id of anim.memberIds) {
      const orig = anim.originalPositionsById[id];
      if (!orig) continue;
      for (const pos of orig) {
        this.clearedTraceCells.add(vecKey(pos));
      }
    }
    this.arrows = this.arrows.filter((a) => !removeIds.has(a.instanceId));
    if (anim.stripIds.length > 0) {
      this.bundles = this.bundles.filter(
        (b) => !anim.stripIds.includes(b.instanceId),
      );
    }
    if (group) {
      this.bundleManager.removeGroup(group);
    }

    this.applyPipeCrossingDamage(anim);
    this.onArrowEliminationBatch(removedArrows, anim.originalPositionsById);
    this.finishAnimation();
    this.rebuildCellMap();
    this.bombManager.updateActivation((bomb) => this.isBombCoveredForActivation(bomb));
    this.phase = this.arrows.length === 0 ? "won" : "playing";
  }

  private restoreBumpDirections(anim: LaunchAnimation | null): void {
    if (!anim || anim.mode !== "bump") return;
    for (const id of anim.memberIds) {
      const origDir = anim.originalDirectionById[id];
      if (!origDir) continue;
      const idx = this.arrows.findIndex((a) => a.instanceId === id);
      if (idx !== -1) {
        this.arrows[idx] = { ...this.arrows[idx]!, direction: origDir };
      }
    }
  }

  private finishAnimationOrPlaying(): void {
    const anim = this.animation;
    if (anim?.stripIds.length) {
      this.bundleManager.resetGroupStrips(anim.stripIds, this.bundles);
    }
    this.restoreBumpDirections(anim);
    this.finishAnimation();
    this.phase = "playing";
    this.rebuildCellMap();
  }

  advanceAnimation(): boolean {
    if (this.phase === "animating" && !this.animation) {
      this.phase = "playing";
      this.rebuildCellMap();
      return true;
    }
    if (!this.animation || this.phase !== "animating") return true;

    this.animation.stepCount += 1;
    if (this.animation.stepCount > this.maxAnimationSteps()) {
      if (this.animation.mode === "exit" || this.animation.mode === "vanish") {
        this.completeLaunchAnimation();
      } else {
        this.finishAnimationOrPlaying();
      }
      return true;
    }

    if (this.animation.mode === "vanish") {
      return true;
    }

    if (this.animation.mode === "exit") {
      return this.advanceExitAnimation();
    }
    return this.advanceBumpAnimation();
  }

  getAnimStepIntervalMs(): number {
    const anim = this.animation;
    if (!anim) return computeAnimStepIntervalMs(0, "exit", false);
    return computeAnimStepIntervalMs(
      anim.flightStepCount,
      anim.mode,
      anim.reversing,
    );
  }

  private recordFlightStep(): void {
    const anim = this.animation;
    if (!anim) return;
    if (anim.mode === "exit" || (anim.mode === "bump" && !anim.reversing)) {
      anim.flightStepCount += 1;
    }
  }

  private getAnimMembers(): ArrowItem[] {
    const ids = this.animation!.memberIds;
    return ids
      .map((id) => this.arrows.find((a) => a.instanceId === id))
      .filter((a): a is ArrowItem => a != null);
  }

  private advanceExitAnimation(): boolean {
    const anim = this.animation!;
    const members = this.getAnimMembers();
    if (members.length === 0 || this.allMembersOffBoard(anim.memberIds)) {
      this.completeLaunchAnimation();
      return true;
    }

    for (const arrow of members) {
      this.cellMap.removeArrow(arrow);
    }

    const stepped: ArrowItem[] = [];
    const activePipes = this.getActivePipes();
    const activeCorners = this.getActiveCorners();
    const curtainCells = this.getCurtainCells();
    const wallCells = this.getWallBlockerCells();
    const memberSet = new Set(anim.memberIds);

    if (anim.stripIds.length > 0) {
      const dir =
        anim.currentDirectionById[members[0]!.instanceId] ?? members[0]!.direction;
      const result = advanceBundleStep(
        anim.memberIds,
        members,
        (id) => this.arrows.find((a) => a.instanceId === id)!.occupiedPositions,
        dir,
        this.level,
        activeCorners,
        activePipes,
        curtainCells,
        wallCells,
        this.getBlockingArrows(),
        memberSet,
      );
      if (!result.blocked) stepped.push(...result.arrows);
    } else {
      for (const arrow of members) {
        const dir = anim.currentDirectionById[arrow.instanceId] ?? arrow.direction;
        const transit = anim.pipeTransitById[arrow.instanceId] ?? null;
        const result = advanceArrowStep(
          arrow,
          dir,
          transit,
          activeCorners,
          activePipes,
          curtainCells,
          wallCells,
        );
        anim.currentDirectionById[arrow.instanceId] = result.dir;
        anim.pipeTransitById[arrow.instanceId] = result.transit;
        if (result.pipeExitedId != null) {
          anim.pipesCrossedById[arrow.instanceId] ??= [];
          anim.pipesCrossedById[arrow.instanceId]!.push(result.pipeExitedId);
        }
        stepped.push(result.arrow);
      }
    }

    for (const arrow of stepped) {
      const idx = this.arrows.findIndex((a) => a.instanceId === arrow.instanceId);
      if (idx !== -1) this.arrows[idx] = arrow;
    }

    if (anim.stripIds.length > 0) {
      this.bundleManager.syncGroupStrips(
        anim.stripIds,
        this.bundles,
        this.arrows,
        true,
      );
    }

    if (
      stepped.length > 0 &&
      (stepped.every((a) => arrowFullyOffBoard(a, this.level)) ||
        this.allMembersOffBoard(anim.memberIds))
    ) {
      this.recordFlightStep();
      this.completeLaunchAnimation();
      return true;
    }

    for (const arrow of stepped) {
      this.cellMap.addArrow(arrow);
    }
    if (stepped.length > 0) this.recordFlightStep();
    return false;
  }

  private advanceBumpAnimation(): boolean {
    const anim = this.animation!;
    const memberSet = new Set(anim.memberIds);
    const members = this.getAnimMembers();
    if (members.length === 0 || this.allMembersOffBoard(anim.memberIds)) {
      if (this.allMembersOffBoard(anim.memberIds)) {
        this.completeLaunchAnimation();
      } else {
        this.finishAnimationOrPlaying();
      }
      return true;
    }

    if (anim.reversing) {
      for (const arrow of members) {
        this.cellMap.removeArrow(arrow);
      }

      let allDone = true;
      for (const arrow of members) {
        const history = anim.bumpHistoryById[arrow.instanceId] ?? [];
        const prev = history.pop();
        const target =
          prev ?? anim.originalPositionsById[arrow.instanceId] ?? arrow.occupiedPositions;
        const idx = this.arrows.findIndex((a) => a.instanceId === arrow.instanceId);
        if (idx !== -1) {
          this.arrows[idx] = withPositions(arrow, target);
          this.cellMap.addArrow(this.arrows[idx]!);
        }
        if (history.length > 0) allDone = false;
      }

      for (const stripId of anim.stripIds) {
        const history = anim.stripBumpHistoryById[stripId] ?? [];
        if (history.length > 0) {
          const prev = history.pop();
          const target =
            prev ??
            anim.originalStripPositionsById[stripId] ??
            this.bundles.find((b) => b.instanceId === stripId)?.occupiedPositions;
          if (target) {
            const strip = this.bundles.find((b) => b.instanceId === stripId);
            if (strip) strip.occupiedPositions = clonePositions(target);
          }
        }
      }

      // 以箭头回退历史为准，避免条带历史不同步导致永远无法结束
      for (const arrow of members) {
        if ((anim.bumpHistoryById[arrow.instanceId] ?? []).length > 0) {
          allDone = false;
          break;
        }
      }

      if (allDone) {
        this.bundleManager.resetGroupStrips(anim.stripIds, this.bundles);
        this.restoreBumpDirections(anim);
        this.finishAnimation();
        this.phase = "playing";
        return true;
      }
      return false;
    }

    for (const arrow of members) {
      this.cellMap.removeArrow(arrow);
    }

    for (const stripId of anim.stripIds) {
      anim.stripBumpHistoryById[stripId] ??= [];
      const strip = this.bundles.find((b) => b.instanceId === stripId);
      if (strip) {
        anim.stripBumpHistoryById[stripId]!.push(
          clonePositions(strip.occupiedPositions),
        );
      }
    }

    const stepped: ArrowItem[] = [];
    const activePipes = this.getActivePipes();
    const activeCorners = this.getActiveCorners();
    const curtainCells = this.getCurtainCells();
    const wallCells = this.getWallBlockerCells();
    let hitWall = false;

    if (anim.stripIds.length > 0) {
      for (const arrow of members) {
        anim.bumpHistoryById[arrow.instanceId] ??= [];
        anim.bumpHistoryById[arrow.instanceId]!.push(
          clonePositions(arrow.occupiedPositions),
        );
      }
      const dir =
        anim.currentDirectionById[members[0]!.instanceId] ?? members[0]!.direction;
      const result = advanceBundleStep(
        anim.memberIds,
        members,
        (id) => this.arrows.find((a) => a.instanceId === id)!.occupiedPositions,
        dir,
        this.level,
        activeCorners,
        activePipes,
        curtainCells,
        wallCells,
        this.getBlockingArrows(),
        memberSet,
      );
      if (result.blocked) {
        hitWall = true;
        for (const arrow of members) {
          this.cellMap.addArrow(arrow);
        }
      } else {
        stepped.push(...result.arrows);
      }
    } else {
      for (const arrow of members) {
        anim.bumpHistoryById[arrow.instanceId] ??= [];
        anim.bumpHistoryById[arrow.instanceId]!.push(
          clonePositions(arrow.occupiedPositions),
        );
        const dir = anim.currentDirectionById[arrow.instanceId] ?? arrow.direction;
        const transit = anim.pipeTransitById[arrow.instanceId] ?? null;
        const result = advanceArrowStep(
          arrow,
          dir,
          transit,
          activeCorners,
          activePipes,
          curtainCells,
          wallCells,
        );
        if (result.blocked) hitWall = true;
        anim.currentDirectionById[arrow.instanceId] = result.dir;
        anim.pipeTransitById[arrow.instanceId] = result.transit;
        if (result.pipeExitedId != null) {
          anim.pipesCrossedById[arrow.instanceId] ??= [];
          anim.pipesCrossedById[arrow.instanceId]!.push(result.pipeExitedId);
        }
        stepped.push(result.arrow);
      }
    }

    for (const arrow of stepped) {
      const idx = this.arrows.findIndex((a) => a.instanceId === arrow.instanceId);
      if (idx !== -1) {
        this.arrows[idx] = arrow;
        this.cellMap.addArrow(arrow);
      }
    }

    if (anim.stripIds.length > 0) {
      this.bundleManager.syncGroupStrips(
        anim.stripIds,
        this.bundles,
        this.arrows,
        true,
      );
    }

    if (
      stepped.length > 0 &&
      (stepped.every((a) => arrowFullyOffBoard(a, this.level)) ||
        this.allMembersOffBoard(anim.memberIds))
    ) {
      this.recordFlightStep();
      this.completeLaunchAnimation();
      return true;
    }

    const blocked =
      hitWall ||
      (anim.stripIds.length === 0 &&
        stepped.some((arrow, idx) => {
          const memberId = members[idx]!.instanceId;
          if (anim.pipeTransitById[memberId]) return false;
          const dir =
            anim.currentDirectionById[memberId] ?? members[idx]!.direction;
          const head = arrow.occupiedPositions.at(-1);
          if (head && curtainCells.has(vecKey(head))) {
            return true;
          }
          if (
            head &&
            isHeadBlockedByPipe(head, dir, this.getActivePipes())
          ) {
            return true;
          }
          return this.isBundleHeadOnBlocker(arrow, memberSet);
        }));
    if (blocked) {
      this.clearPipeAnimState(anim);
      anim.reversing = true;
    } else if (stepped.length > 0) {
      this.recordFlightStep();
    }
    return false;
  }

  private isBundleHeadOnBlocker(
    arrow: ArrowItem,
    memberIds: Set<number>,
  ): boolean {
    const wallCells = this.getWallBlockerCells();
    const head = arrow.occupiedPositions.at(-1);
    if (!head) return false;
    const dir =
      this.animation?.currentDirectionById[arrow.instanceId] ?? arrow.direction;
    if (wallCells.size > 0 && wouldStepIntoWall(head, dir, wallCells)) {
      return true;
    }
    if (this.cellMap.isBlockedExcept(head, memberIds)) return true;
    if (this.getCurtainCells().has(vecKey(head))) return true;
    if (isHeadBlockedByPipe(head, dir, this.getActivePipes())) return true;
    return getCornerAt(head, this.getActiveCorners()) != null;
  }

  private finishAnimation(): void {
    this.animation = null;
  }

  getTopLevelArrows(): ArrowItem[] {
    return this.arrows.filter((a) => a.zoneId == null);
  }

  getRevealedZoneArrows(): ArrowItem[] {
    return this.arrows.filter(
      (a) =>
        a.zoneId != null &&
        this.zoneManager.isZoneContentRevealed(
          a.zoneId,
          this.arrows,
          this.corners,
        ),
    );
  }

  getVisibleArrows(): ArrowItem[] {
    return [...this.getTopLevelArrows(), ...this.getRevealedZoneArrows()];
  }

  getAnimatedArrows(): ArrowItem[] {
    return this.getVisibleArrows();
  }

  getTopLevelCorners(): CornerItem[] {
    return this.corners.filter((c) => c.zoneId == null);
  }

  getRevealedZoneCorners(): CornerItem[] {
    return this.corners.filter(
      (c) =>
        c.zoneId != null &&
        this.zoneManager.isZoneContentRevealed(
          c.zoneId,
          this.arrows,
          this.corners,
        ),
    );
  }

  getVisibleCorners(): CornerItem[] {
    return [...this.getTopLevelCorners(), ...this.getRevealedZoneCorners()];
  }

  getTopLevelBundles(): BundleItem[] {
    return this.bundles.filter((b) => b.zoneId == null);
  }

  getRevealedZoneBundles(): BundleItem[] {
    return this.bundles.filter(
      (b) =>
        b.zoneId != null &&
        this.zoneManager.isZoneContentRevealed(
          b.zoneId,
          this.arrows,
          this.corners,
        ),
    );
  }

  getVisibleBundles(): BundleItem[] {
    return [...this.getTopLevelBundles(), ...this.getRevealedZoneBundles()];
  }

  getTopLevelPipes(): PipeItem[] {
    return this.pipes.filter((p) => p.zoneId == null && p.health > 0);
  }

  getRevealedZonePipes(): PipeItem[] {
    return this.pipes.filter(
      (p) =>
        p.health > 0 &&
        p.zoneId != null &&
        this.zoneManager.isZoneContentRevealed(
          p.zoneId,
          this.arrows,
          this.corners,
        ),
    );
  }

  getLaunchableIds(): Set<number> {
    const ids = new Set<number>();
    const activeArrows = this.getActiveArrows();
    const blockingArrows = this.getBlockingArrows();
    const activeCorners = this.getActiveCorners();
    const checkedGroups = new Set<number>();

    for (const arrow of activeArrows) {
      const group = this.bundleManager.getGroupForArrow(arrow.instanceId);
      if (group) {
        if (checkedGroups.has(group.id)) continue;
        checkedGroups.add(group.id);
        if (
          this.bundleManager.canLaunchGroup(
            group,
            activeArrows,
            activeCorners,
            this.level,
            this.getActivePipes(),
            this.getCurtainCells(),
            this.getWallBlockerCells(),
            blockingArrows,
          )
        ) {
          for (const id of group.arrowIds) ids.add(id);
        }
      } else if (
        simulateCanExit(
          arrow,
          blockingArrows,
          activeCorners,
          this.level,
          this.getActivePipes(),
          this.getCurtainCells(),
          this.getWallBlockerCells(),
        )
      ) {
        ids.add(arrow.instanceId);
      }
    }
    return ids;
  }

  /** 自动消除：选取一条当前可立即出界的箭并发射（与手动点击等效） */
  tryAutoLaunch(): boolean {
    this.recoverAnimationState();
    if (this.phase !== "playing") return false;

    const launchable = [...this.getLaunchableIds()];
    if (launchable.length === 0) return false;

    return this.tryLaunch(launchable[0]!);
  }

  /** 可被随机/指定消除的箭头：当前可见、非捆绑、无钥匙 */
  getRandomVanishCandidates(): ArrowItem[] {
    return this.getActiveArrows().filter((a) => this.canVanishArrow(a));
  }

  /** 可被指定消除的箭头 */
  getTargetVanishCandidates(): ArrowItem[] {
    return this.getRandomVanishCandidates();
  }

  canTargetVanish(arrow: ArrowItem): boolean {
    return this.canVanishArrow(arrow);
  }

  private canVanishArrow(arrow: ArrowItem): boolean {
    if (this.curtainManager.isArrowHidden(arrow)) return false;
    if (!this.zoneManager.isArrowActive(arrow, this.arrows, this.corners)) {
      return false;
    }
    if (this.bundleManager.getGroupForArrow(arrow.instanceId)) return false;
    if (arrowHasKey(arrow, this.keyCells)) return false;
    if (this.frozenManager.isHostFrozen(arrow.instanceId)) return false;
    return true;
  }

  /** 指定消除模式下悬停格：可消除 / 不可消除物件 / 空格 */
  getTargetVanishHoverAtCell(pos: Vec2): "valid" | "invalid" | "none" {
    if (this.curtainManager.isCellCovered(pos)) return "invalid";
    if (this.findTargetVanishArrowAtCell(pos)) return "valid";
    if (this.findOperableArrowAtCell(pos)) return "invalid";
    if (this.hasVisibleNonArrowItemAt(pos)) return "invalid";
    return "none";
  }

  private hasVisibleNonArrowItemAt(pos: Vec2): boolean {
    const match = ([x, y]: Vec2) => x === pos[0] && y === pos[1];
    for (const corner of this.getActiveCorners()) {
      if (corner.occupiedPositions.some(match)) return true;
    }
    for (const bundle of [
      ...this.getDrawableTopLevelBundles(),
      ...this.getDrawableRevealedZoneBundles(),
    ]) {
      if (bundle.occupiedPositions.some(match)) return true;
    }
    for (const pipe of this.getActivePipes()) {
      if (pipe.occupiedPositions.some(match)) return true;
    }
    for (const key of this.getVisibleKeys()) {
      const kpos = key.occupiedPositions[0];
      if (kpos && match(kpos)) return true;
    }
    return false;
  }

  private startVanishAnimation(memberIds: number[]): boolean {
    if (memberIds.length === 0) return false;
    this.phase = "animating";
    this.animation = {
      instanceId: memberIds[0]!,
      memberIds,
      stripIds: [],
      mode: "vanish",
      originalPositionsById: snapshotPositions(this.arrows, memberIds),
      originalDirectionById: snapshotDirections(this.arrows, memberIds),
      originalStripPositionsById: {},
      bumpHistoryById: Object.fromEntries(memberIds.map((id) => [id, []])),
      stripBumpHistoryById: {},
      reversing: false,
      currentDirectionById: snapshotDirections(this.arrows, memberIds),
      stepCount: 0,
      flightStepCount: 0,
      pipeTransitById: Object.fromEntries(memberIds.map((id) => [id, null])),
      pipesCrossedById: Object.fromEntries(memberIds.map((id) => [id, []])),
    };
    return true;
  }

  getVanishAnimProgress(): number {
    if (this.animation?.mode !== "vanish") return 0;
    return Math.min(1, this.animation.stepCount / VANISH_ANIM_STEPS);
  }

  /** 随机消除最多 3 条可见、非捆绑箭（无视阻挡） */
  tryRandomVanish(count = RANDOM_VANISH_COUNT): boolean {
    this.recoverAnimationState();
    if (this.phase !== "playing") return false;

    const candidates = this.getRandomVanishCandidates();
    if (candidates.length === 0) return false;

    const picked = shuffle(candidates).slice(0, Math.min(count, candidates.length));
    return this.startVanishAnimation(picked.map((a) => a.instanceId));
  }

  findTargetVanishArrowAtCell(pos: Vec2): ArrowItem | null {
    if (this.curtainManager.isCellCovered(pos)) return null;
    const active = this.getActiveArrows();
    for (let i = active.length - 1; i >= 0; i--) {
      const arrow = active[i]!;
      if (!this.canTargetVanish(arrow)) continue;
      for (const p of arrow.occupiedPositions) {
        if (p[0] === pos[0] && p[1] === pos[1]) return arrow;
      }
    }
    return null;
  }

  /** 指定消除：点击可见、无捆绑/钥匙的箭 */
  tryTargetVanishAtCell(pos: Vec2): boolean {
    this.recoverAnimationState();
    if (this.phase !== "playing") return false;
    const arrow = this.findTargetVanishArrowAtCell(pos);
    if (!arrow) return false;
    return this.startVanishAnimation([arrow.instanceId]);
  }

  findOperableArrowAtCell(pos: Vec2): ArrowItem | null {
    if (this.curtainManager.isCellCovered(pos)) return null;
    const active = this.getActiveArrows();
    for (let i = active.length - 1; i >= 0; i--) {
      const arrow = active[i]!;
      for (const p of arrow.occupiedPositions) {
        if (p[0] === pos[0] && p[1] === pos[1]) return arrow;
      }
    }
    return null;
  }

  getDrawableTopLevelArrows(): ArrowItem[] {
    return this.getTopLevelArrows().filter(
      (a) => !this.curtainManager.isArrowHidden(a),
    );
  }

  getDrawableRevealedZoneArrows(): ArrowItem[] {
    return this.getRevealedZoneArrows().filter(
      (a) => !this.curtainManager.isArrowHidden(a),
    );
  }

  getDrawableTopLevelBundles(): BundleItem[] {
    return this.getTopLevelBundles().filter(
      (b) => !this.curtainManager.arePositionsHidden(b.occupiedPositions),
    );
  }

  getDrawableRevealedZoneBundles(): BundleItem[] {
    return this.getRevealedZoneBundles().filter(
      (b) => !this.curtainManager.arePositionsHidden(b.occupiedPositions),
    );
  }

  getVisibleKeys(): KeyArrowItem[] {
    const active = this.getActiveArrows();
    return this.keys.filter((key) => {
      const pos = key.occupiedPositions[0];
      return pos != null && isKeyCellVisible(pos, active);
    });
  }

  getActiveCurtainsForRender() {
    return this.curtainManager.getActiveCurtains();
  }

  getClearedTraceCells(): Vec2[] {
    return [...this.clearedTraceCells].map((k) => {
      const [x, y] = k.split(",").map(Number);
      return [x!, y!] as Vec2;
    });
  }

  getOccupiedArrowCellKeys(): Set<string> {
    const keys = new Set<string>();
    for (const arrow of this.arrows) {
      for (const pos of arrow.occupiedPositions) {
        keys.add(vecKey(pos));
      }
    }
    return keys;
  }

  getMovingWalls() {
    return this.wallManager.getWalls();
  }

  getFrozenOverlays() {
    return this.frozenManager
      .getOverlays()
      .filter((overlay) => this.canFrozenOverlayTakeAdjacentDamage(overlay));
  }

  /** 子区域已揭开且不在幕布下时，冰冻才参与相邻消除扣血与绘制 */
  private canFrozenOverlayTakeAdjacentDamage(overlay: FrozenOverlayItem): boolean {
    if (!this.isMechanicDrawable(overlay.zoneId)) return false;
    const host = this.arrows.find((a) => a.instanceId === overlay.hostArrowId);
    if (host && this.curtainManager.isArrowHidden(host)) return false;
    return true;
  }

  private isMechanicDrawable(zoneId: number | null): boolean {
    if (zoneId == null) return true;
    return this.zoneManager.isZoneContentRevealed(
      zoneId,
      this.arrows,
      this.corners,
    );
  }

  getBombs() {
    this.bombManager.syncWithArrows(this.arrows);
    return this.bombManager
      .getDrawableBombs()
      .filter((bomb) => this.isMechanicDrawable(bomb.zoneId));
  }

  getBombDrawStates() {
    this.bombManager.syncWithArrows(this.arrows);
    return this.bombManager
      .getDrawableStates()
      .filter((state) => this.isMechanicDrawable(state.bomb.zoneId));
  }

  getBombExplosion(): { cells: Vec2[]; progress: number } | null {
    if (!this.bombExplosion) return null;
    return {
      cells: this.bombExplosion.cells,
      progress: Math.min(1, this.bombExplosion.elapsed / BOMB_EXPLOSION_DURATION),
    };
  }

  getLostReason(): LostReason | null {
    return this.lostReason;
  }

  getUrgentBombRemaining(): number | null {
    return this.bombManager.getUrgentRemaining();
  }
}
