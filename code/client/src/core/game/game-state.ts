import type {
  ArrowItem,
  BombItem,
  BuffItem,
  BundleItem,
  ControllerItem,
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
  ShrinkPipeItem,
  ToggleItem,
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
import { flipBoardArrow, flipUncoveredArrows } from "../mechanics/flip.ts";
import {
  buildLaunchUnits,
  isBoardStalemate,
  pickAutoRefreshArrowIds,
  type BoardStalemateContext,
} from "../mechanics/board-stalemate.ts";
import {
  buildFullBoardPlayable,
  removeControllersForHosts,
  syncControllersForHost,
  syncControllersWithArrowHosts,
  syncControllersWithShrinkHosts,
} from "@arrowjaw/shared";
import { BombManager, BOMB_EXPLOSION_DURATION } from "../mechanics/bomb.ts";
import { MovingWallManager, wouldStepIntoWall } from "../mechanics/moving-wall.ts";
import { FrozenManager } from "../mechanics/frozen.ts";
import { ShrinkPipeManager } from "../mechanics/shrink-pipe.ts";
import { ToggleManager } from "../mechanics/toggle.ts";
import {
  applyPartialArrowDestruction,
  collectArrowCellsInRegion,
  rankArrowColorIds,
  manhattanDistance,
  regionForBuff,
  type BuffSplitOutcome,
} from "../mechanics/buff-items.ts";
import {
  AREA_BOMB_EFFECT_DURATION,
  buildAreaBombDebris,
  buildCrossBombCellBlasts,
  buildFireSpreadSchedule,
  crossBombEffectTotalDuration,
  crossCellsByRing,
  CROSS_BOMB_PRIMED_DURATION,
  CROSS_CELL_BLAST_DURATION,
  crossBombWaveStartTime,
  FIRE_BURST_DURATION,
  FIRE_CELL_BURN_DURATION,
  fireBombEffectTotalDuration,
  fireCellBurnProgress,
  shouldHideArrowCellFromFire,
  fireCellCharProgress,
  isBalloonEffectComplete,
  computeBalloonEffectTiming,
  isCandyMachineEffectComplete,
  computeCandyShotArrowTiming,
  tickCandyMachineArrivals,
  candyFlightDuration,
  candyShotFlightProgress,
  assignCandyShotLaunchDelays,
  CANDY_MACHINE_SHOT_COUNT,
  CANDY_MACHINE_CANDY_COLOR_IDS,
  BLACK_HOLE_SPIN_DURATION,
  BLACK_HOLE_LIFETIME_SEC,
  BLACK_HOLE_VANISH_DURATION,
  CHAIN_TRIGGER_DELAY_SEC,
  AUTO_REFRESH_EFFECT_DURATION,
  autoRefreshEffectProgress,
  isChainTriggerBuffKind,
  hitCellKeys,
  maskArrowsForDestroyedCells,
  type AreaBombEffectState,
  type AutoRefreshEffectState,
  type BalloonEffectState,
  type CandyMachineEffectState,
  type BlackHoleRenderFx,
  type CrossBombEffectState,
  type FireBombEffectState,
} from "../mechanics/buff-effects.ts";
import { trimArrowSuffixInBlackHole } from "../mechanics/black-hole-region.ts";
import { GoalTracker } from "./goal-tracker.ts";
import {
  runSpawnWave,
  SpawnManager,
  type SpawnBlockContext,
} from "../mechanics/spawn.ts";
import {
  getAnimStepIntervalMs as computeAnimStepIntervalMs,
} from "./anim-timing.ts";
import {
  DOT_PULSE_FX_DURATION,
  LAUNCH_CLICK_FX_DURATION,
  type DotPulseFxState,
  type LaunchClickFxState,
} from "./flight-fx-state.ts";

export const VANISH_ANIM_STEPS = 12;
export const RANDOM_VANISH_COUNT = 3;
/** 前一次发射后，允许再次点击发射的最短间隔（毫秒） */
export const LAUNCH_CLICK_COOLDOWN_MS = 200;

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

type BlackHolePhase = "active" | "swallow-spin" | "expiring";

interface BlackHoleRuntime {
  age: number;
  phase: BlackHolePhase;
  effectElapsed: number;
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
  shrinkPipes: ShrinkPipeItem[];
  toggles: ToggleItem[];
  controllers: ControllerItem[];
  shrinkPipeManager: ShrinkPipeManager;
  toggleManager: ToggleManager;
  buffs: BuffItem[];
  goalTracker: GoalTracker;
  spawnManager: SpawnManager;
  private instanceIdSeq: number;
  private keyCells: Set<string>;
  private clearedTraceCells = new Set<string>();
  mistakeCount = 0;
  animations: LaunchAnimation[] = [];
  private lastLaunchTimeMs = 0;
  lostReason: LostReason | null = null;
  private bombExplosion: { cells: Vec2[]; elapsed: number } | null = null;
  private areaBombEffects: AreaBombEffectState[] = [];
  private crossBombEffects: CrossBombEffectState[] = [];
  private fireBombEffects: FireBombEffectState[] = [];
  private balloonEffects: BalloonEffectState[] = [];
  private candyMachineEffects: CandyMachineEffectState[] = [];
  private pendingBalloonTriggers: {
    buffId: number;
    colorId: number;
    requireArrowReturn: boolean;
    hitArrowInstanceId: number;
    remainingSec: number;
  }[] = [];
  private pendingCandyMachineTriggers: {
    buffId: number;
    remainingSec: number;
  }[] = [];
  private autoRefreshEffect: AutoRefreshEffectState | null = null;
  private blackHoleRuntime = new Map<number, BlackHoleRuntime>();
  private pendingChainTriggers: { buffId: number; remainingSec: number }[] = [];
  /** 已排入连爆队列、尚未开始效果的 buff */
  private chainTriggerScheduled = new Set<number>();
  private launchClickEffects: LaunchClickFxState[] = [];
  private dotPulseEffects: DotPulseFxState[] = [];

  /** 兼容单动画测试与快照：返回首个活跃动画 */
  get animation(): LaunchAnimation | null {
    return this.animations[0] ?? null;
  }

  getAnimatingMemberIds(): Set<number> {
    const ids = new Set<number>();
    for (const anim of this.animations) {
      for (const id of anim.memberIds) ids.add(id);
    }
    return ids;
  }

  /** 正在飞出（exit 动画）的箭：不阻挡后续箭沿同路径发射 */
  getExitingMemberIds(): Set<number> {
    const ids = new Set<number>();
    for (const anim of this.animations) {
      if (anim.mode !== "exit") continue;
      for (const id of anim.memberIds) ids.add(id);
    }
    return ids;
  }

  getBlockingArrowsForPathCheck(): ArrowItem[] {
    const exiting = this.getExitingMemberIds();
    return this.getBlockingArrows().filter((a) => !exiting.has(a.instanceId));
  }

  hasVanishAnimation(): boolean {
    return this.animations.some((a) => a.mode === "vanish");
  }

  canAcceptLaunchClick(now = performance.now()): boolean {
    if (this.spawnManager.spawnPhase) return false;
    if (this.hasActiveExplosiveBuffEffect()) return false;
    if (this.balloonEffects.length > 0 || this.pendingBalloonTriggers.length > 0) {
      return false;
    }
    if (this.candyMachineEffects.length > 0) return false;
    if (this.pendingCandyMachineTriggers.length > 0) return false;
    if (this.autoRefreshEffect) return false;
    if (this.phase === "won" || this.phase === "lost" || this.phase === "exploding") {
      return false;
    }
    if (this.hasVanishAnimation()) return false;
    const launchAnims = this.animations.filter((a) => a.mode !== "vanish");
    if (launchAnims.length === 0) return true;
    return now - this.lastLaunchTimeMs >= LAUNCH_CLICK_COOLDOWN_MS;
  }

  private isRushMode(): boolean {
    return this.level.gameMode === "rush";
  }

  private checkWinCondition(): boolean {
    if (this.isRushMode()) return this.goalTracker.isMet();
    return this.arrows.length === 0;
  }

  private resolveWinOrPlaying(): void {
    if (this.checkWinCondition()) {
      this.phase = "won";
    } else {
      this.phase = "playing";
      this.checkAndAutoRefreshBoard();
    }
  }

  private syncPhaseAfterAnimations(): void {
    if (this.animations.length === 0) {
      if (this.phase === "animating") {
        this.resolveWinOrPlaying();
      }
      return;
    }
    if (this.phase === "playing" || this.phase === "animating") {
      this.phase = "animating";
    }
  }

  private removeAnimation(anim: LaunchAnimation): void {
    this.animations = this.animations.filter((a) => a !== anim);
    this.syncPhaseAfterAnimations();
  }

  constructor(level: GameLevel) {
    this.level = {
      ...level,
      boardShape: level.boardShape ?? "full",
      playableCells:
        level.playableCells ??
        buildFullBoardPlayable(level.width, level.height),
      blackHoleCells: level.blackHoleCells ?? new Set<string>(),
      invalidCellColors: level.invalidCellColors ?? new Map(),
    };
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
    this.shrinkPipes = (level.shrinkPipes ?? []).map((s) => ({
      ...s,
      bindCoordinate: [s.bindCoordinate[0], s.bindCoordinate[1]] as Vec2,
      occupiedPositions: clonePositions(s.occupiedPositions),
    }));
    this.toggles = (level.toggles ?? []).map((t) => ({
      ...t,
      occupiedPositions: clonePositions(t.occupiedPositions),
    }));
    this.controllers = (level.controllers ?? []).map((c) => ({
      ...c,
      occupiedPositions: clonePositions(c.occupiedPositions),
    }));
    this.shrinkPipeManager = new ShrinkPipeManager(this.shrinkPipes, this.pipes);
    this.toggleManager = new ToggleManager(this.toggles, this.controllers);
    this.buffs = (level.buffs ?? []).map((b) => ({
      ...b,
      occupiedPositions: clonePositions(b.occupiedPositions),
    }));
    this.goalTracker = new GoalTracker(
      level.levelGoals,
      level.gameMode === "rush",
    );
    this.spawnManager = new SpawnManager(
      level.spawnIntervalSec ?? 25,
      level.gameMode === "rush",
    );
    this.instanceIdSeq =
      Math.max(
        0,
        ...[
          ...this.arrows,
          ...this.corners,
          ...this.bundles,
          ...this.pipes,
          ...this.buffs,
          ...this.keys,
          ...(level.bombs ?? []),
          ...this.shrinkPipes,
          ...this.toggles,
          ...this.controllers,
        ].map((o) => o.instanceId),
      ) + 1;
    this.keyCells = buildKeyCellSet(this.keys);
    for (const buff of this.buffs) {
      if (buff.kind === 21) this.registerBlackHole(buff.instanceId);
    }
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
        this.isArrowZoneActive(a),
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
    if (!this.isArrowZoneActive(arrow)) {
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
    const cells = this.wallManager.getBlockerCells();
    for (const k of this.shrinkPipeManager.getBlockerCells()) {
      cells.add(k);
    }
    return cells;
  }

  private getControllerBoundHostIds(): Set<number> {
    return new Set(this.controllers.map((c) => c.bindInstanceId));
  }

  private getControlledWallIds(): Set<number> {
    const bound = this.getControllerBoundHostIds();
    return new Set(
      this.wallManager
        .getWalls()
        .filter((w) => bound.has(w.instanceId))
        .map((w) => w.instanceId),
    );
  }

  private isToggleCovered(toggle: ToggleItem): boolean {
    if (!this.isMechanicDrawable(toggle.zoneId)) return true;
    const cell = toggle.occupiedPositions[0];
    if (cell && this.getCurtainCells().has(vecKey(cell))) return true;
    return false;
  }

  private isControllerCovered(ctrl: ControllerItem): boolean {
    if (!this.isMechanicDrawable(ctrl.zoneId)) return true;
    const cell = ctrl.occupiedPositions[0];
    if (cell && this.getCurtainCells().has(vecKey(cell))) return true;
    return false;
  }

  private syncControllersForHostMove(
    hostId: number,
    oldPositions: Vec2[],
    newPositions: Vec2[],
  ): void {
    this.controllers = syncControllersForHost(
      this.controllers,
      hostId,
      oldPositions,
      newPositions,
    );
  }

  private syncControllersIfHostMoved(
    hostId: number,
    oldPositions: Vec2[],
    newPositions: Vec2[],
  ): void {
    if (
      !this.controllers.some(
        (c) => c.kind === 16 && c.bindInstanceId === hostId,
      )
    ) {
      return;
    }
    if (
      oldPositions.length === newPositions.length &&
      oldPositions.every(
        (p, i) =>
          p[0] === newPositions[i]![0] && p[1] === newPositions[i]![1],
      )
    ) {
      return;
    }
    this.syncControllersForHostMove(hostId, oldPositions, newPositions);
  }

  private toggleExecutionContext() {
    return {
      arrows: this.arrows,
      corners: this.corners,
      shrinkPipes: this.shrinkPipes,
      controllers: this.controllers,
      wallManager: this.wallManager,
      shrinkPipeManager: this.shrinkPipeManager,
      isToggleCovered: (t: ToggleItem) => this.isToggleCovered(t),
      isControllerCovered: (c: ControllerItem) => this.isControllerCovered(c),
      wallHasController: (id: number) => this.getControlledWallIds().has(id),
    };
  }

  private recordToggleCrossingForAnim(
    anim: LaunchAnimation,
    prev: Vec2[],
    next: Vec2[],
  ): void {
    if (anim.reversing) return;
    const ids = this.toggleManager.collectCrossedToggleIds(
      prev,
      next,
      this.toggleExecutionContext(),
    );
    for (const id of ids) {
      if (!anim.togglesCrossedIds.includes(id)) {
        anim.togglesCrossedIds.push(id);
      }
    }
  }

  private commitPendingToggles(anim: LaunchAnimation): void {
    if (anim.togglesCrossedIds.length === 0) return;
    const ctx = this.toggleExecutionContext();
    this.toggleManager.commitToggles(anim.togglesCrossedIds, ctx);
    this.controllers = ctx.controllers;
    this.rebuildCellMap();
  }

  private collectCrossedFlipButtonIds(
    prevPositions: Vec2[],
    nextPositions: Vec2[],
  ): number[] {
    const prevKeys = new Set(prevPositions.map(vecKey));
    const newKeys = new Set(nextPositions.map(vecKey));
    return this.buffs
      .filter(
        (b) =>
          b.kind === 22 &&
          this.isMechanicDrawable(b.zoneId) &&
          b.occupiedPositions.some((p) => {
            const k = vecKey(p);
            return newKeys.has(k) && !prevKeys.has(k);
          }),
      )
      .map((b) => b.instanceId)
      .sort((a, b) => a - b);
  }

  private recordFlipButtonCrossingForAnim(
    anim: LaunchAnimation,
    prev: Vec2[],
    next: Vec2[],
  ): void {
    if (anim.reversing) return;
    for (const id of this.collectCrossedFlipButtonIds(prev, next)) {
      if (!anim.flipButtonsCrossedIds.includes(id)) {
        anim.flipButtonsCrossedIds.push(id);
      }
    }
  }

  private commitPendingFlipButtons(anim: LaunchAnimation): void {
    if (anim.flipButtonsCrossedIds.length === 0) return;
    const excludeArrowIds =
      anim.mode === "bump" ? new Set(anim.memberIds) : undefined;
    for (const id of anim.flipButtonsCrossedIds) {
      const buff = this.buffs.find((b) => b.instanceId === id && b.kind === 22);
      if (buff) this.triggerFlipButton(buff, { excludeArrowIds });
    }
  }

  /** 发射动画中覆盖箭的发射前原位，用于子区域揭示判定 */
  private getZoneOverlayOriginalPositions(): Map<number, Vec2[]> {
    const map = new Map<number, Vec2[]>();
    for (const anim of this.animations) {
      for (const id of anim.memberIds) {
        const orig = anim.originalPositionsById[id];
        if (orig) map.set(id, orig);
      }
    }
    return map;
  }

  private isZoneContentRevealed(zoneId: number): boolean {
    return this.zoneManager.isZoneContentRevealed(
      zoneId,
      this.arrows,
      this.corners,
      new Map(),
      this.getZoneOverlayOriginalPositions(),
    );
  }

  private isArrowZoneActive(arrow: ArrowItem): boolean {
    return this.zoneManager.isArrowActive(
      arrow,
      this.arrows,
      this.corners,
      this.getZoneOverlayOriginalPositions(),
    );
  }

  private isCornerZoneActive(corner: CornerItem): boolean {
    return this.zoneManager.isCornerActive(
      corner,
      this.arrows,
      this.corners,
      this.getZoneOverlayOriginalPositions(),
    );
  }

  private onArrowEliminationBatch(
    removedArrows: ArrowItem[],
    originalPositionsById?: Record<number, Vec2[]>,
    opts?: { skipFlipArrowToggle?: boolean },
  ): void {
    if (removedArrows.length === 0) return;

    const forFrozen = removedArrows.map((arrow) => {
      const orig = originalPositionsById?.[arrow.instanceId];
      return orig ? { ...arrow, occupiedPositions: orig } : arrow;
    });
    this.frozenManager.onAdjacentElimination(forFrozen, (overlay) =>
      this.canFrozenOverlayTakeAdjacentDamage(overlay),
    );
    if (!opts?.skipFlipArrowToggle) {
      const arrowPosBefore = new Map(
        this.arrows.map((a) => [a.instanceId, clonePositions(a.occupiedPositions)]),
      );
      this.arrows = flipUncoveredArrows(this.arrows, (a) =>
        this.isArrowCoveredForMechanics(a) ||
        (a.kind === 2 && this.getControllerBoundHostIds().has(a.instanceId)),
      );
      for (const arrow of this.arrows) {
        const oldPos = arrowPosBefore.get(arrow.instanceId);
        if (!oldPos) continue;
        if (
          oldPos.length !== arrow.occupiedPositions.length ||
          oldPos.some(
            (p, i) =>
              p[0] !== arrow.occupiedPositions[i]![0] ||
              p[1] !== arrow.occupiedPositions[i]![1],
          )
        ) {
          this.syncControllersForHostMove(
            arrow.instanceId,
            oldPos,
            arrow.occupiedPositions,
          );
        }
      }
    }

    const wallPosBefore = new Map(
      this.wallManager.getWalls().map((w) => [w.instanceId, clonePositions(w.occupiedPositions)]),
    );
    this.wallManager.advanceAll(this.getControlledWallIds());
    for (const wall of this.wallManager.getWalls()) {
      const oldPos = wallPosBefore.get(wall.instanceId);
      if (!oldPos) continue;
      if (
        oldPos.some(
          (p, i) =>
            p[0] !== wall.occupiedPositions[i]![0] ||
            p[1] !== wall.occupiedPositions[i]![1],
        )
      ) {
        this.syncControllersForHostMove(
          wall.instanceId,
          oldPos,
          wall.occupiedPositions,
        );
      }
    }

    const hostIds = new Set(removedArrows.map((a) => a.instanceId));
    this.bombManager.removeForHosts(hostIds);
    removeControllersForHosts(this.controllers, hostIds);
    this.bombManager.updateActivation((bomb) => this.isBombCoveredForActivation(bomb));

    const elimCells = removedArrows.reduce(
      (sum, a) => sum + a.occupiedPositions.length,
      0,
    );
    this.spawnManager.onEliminationCells(elimCells);
    this.goalTracker.onEliminationBatch(removedArrows);
  }

  getActiveCorners(): CornerItem[] {
    return this.corners.filter((c) =>
      this.isCornerZoneActive(c),
    );
  }

  getActiveBundles(): BundleItem[] {
    return this.bundles.filter(
      (b) =>
        !this.curtainManager.arePositionsHidden(b.occupiedPositions) &&
        (b.zoneId == null || this.isZoneContentRevealed(b.zoneId)),
    );
  }

  getActivePipes(): PipeItem[] {
    return this.pipes.filter(
      (p) =>
        p.health > 0 &&
        (p.zoneId == null || this.isZoneContentRevealed(p.zoneId)),
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
    this.shrinkPipeManager.onPipeTraversed([...pipeIds]);
    this.pipes = pruneDeadPipes(this.pipes);
    this.shrinkPipeManager.setPipes(this.pipes);
    const livePipeIds = new Set(this.pipes.map((p) => p.instanceId));
    const removedStripIds = this.shrinkPipes
      .filter((s) => !livePipeIds.has(s.bindPipeId))
      .map((s) => s.instanceId);
    this.shrinkPipeManager.removeForDeadPipes(livePipeIds);
    removeControllersForHosts(this.controllers, new Set(removedStripIds));
    syncControllersWithShrinkHosts(this.controllers, this.shrinkPipes);
  }

  private clearPipeAnimState(anim: LaunchAnimation): void {
    for (const id of anim.memberIds) {
      anim.pipeTransitById[id] = null;
      anim.pipesCrossedById[id] = [];
    }
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
    this.tickFlightVisualFx(dt);

    for (let i = this.areaBombEffects.length - 1; i >= 0; i--) {
      const effect = this.areaBombEffects[i]!;
      effect.elapsed += dt;
      if (effect.elapsed >= AREA_BOMB_EFFECT_DURATION) {
        this.commitAreaBombEffectAt(i);
      }
    }

    for (let i = this.crossBombEffects.length - 1; i >= 0; i--) {
      this.tickCrossBombEffectAt(i, dt);
    }

    for (let i = this.fireBombEffects.length - 1; i >= 0; i--) {
      this.tickFireBombEffectAt(i, dt);
    }

    if (this.balloonEffects.length > 0) {
      this.tickBalloonEffects(dt);
    }
    if (this.candyMachineEffects.length > 0) {
      this.tickCandyMachineEffects(dt);
    }
    this.tickPendingBalloonTriggers(dt);
    this.tickPendingCandyMachineTriggers(dt);

    this.tickBlackHoles(dt);
    this.tickChainTriggers(dt);
    this.tickAutoRefreshEffect(dt);

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
        if (this.phase === "playing" && !this.checkWinCondition()) {
          this.lostReason = "time";
          this.phase = "lost";
        }
      }
    }
    const hasBlockingAnim =
      this.animations.length > 0 || this.hasVanishAnimation();
    if (this.spawnManager.tickSpawnFade(dt * 1000)) {
      this.rebuildCellMap();
    }
    const countdownBlocked =
      hasBlockingAnim || this.spawnManager.spawnPhase;
    const countdownReady = this.spawnManager.tickCountdown(dt, countdownBlocked);
    const propBlocksSpawn = this.hasActivePropEffect();
    const immediateOnEmpty = this.shouldTriggerImmediateSpawn(countdownBlocked);
    if (
      !propBlocksSpawn &&
      !countdownBlocked &&
      (countdownReady || immediateOnEmpty)
    ) {
      this.executeSpawnWave();
    }
    this.bombManager.updateActivation((bomb) => this.isBombCoveredForActivation(bomb));
    const explodedCells = this.bombManager.tick(dt);
    this.toggleManager.tickFlash(dt);
    if (
      explodedCells.length > 0 &&
      this.arrows.length > 0 &&
      (this.phase === "playing" || this.phase === "animating")
    ) {
      this.startBombExplosion(explodedCells);
    }
    if (this.phase === "playing") {
      this.checkAndAutoRefreshBoard();
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

  tryLaunch(
    instanceId: number,
    now = performance.now(),
    launchClick?: { boardPx: [number, number] },
  ): boolean {
    if (!this.canAcceptLaunchClick(now)) return false;
    if (this.phase === "won" || this.phase === "lost" || this.phase === "exploding") {
      return false;
    }

    const animatingIds = this.getAnimatingMemberIds();
    const memberIds = this.bundleManager.getMemberIds(instanceId);
    if (memberIds.some((id) => animatingIds.has(id))) return false;

    const arrow = this.arrows.find((a) => a.instanceId === instanceId);
    if (
      !arrow ||
      !this.isArrowZoneActive(arrow)
    ) {
      return false;
    }

    const activeArrows = this.getActiveArrows();
    const blockingArrows = this.getBlockingArrowsForPathCheck();
    const activeCorners = this.getActiveCorners();
    const group = this.bundleManager.getGroupForArrow(instanceId);
    const stripIds = this.bundleManager.getStripIdsForArrowIds(
      memberIds,
      this.bundles,
    );

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
          this.level.blackHoleCells,
        )
      : simulateCanExit(
          arrow,
          blockingArrows,
          activeCorners,
          this.level,
          this.getActivePipes(),
          this.getCurtainCells(),
          this.getWallBlockerCells(),
          this.level.blackHoleCells,
        );
    if (!canExit) this.mistakeCount++;

    this.animations.push({
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
      stepAccumMs: 0,
      pipeTransitById: Object.fromEntries(memberIds.map((id) => [id, null])),
      pipesCrossedById: Object.fromEntries(memberIds.map((id) => [id, []])),
      togglesCrossedIds: [],
      flipButtonsCrossedIds: [],
    });
    this.lastLaunchTimeMs = now;
    this.phase = "animating";
    if (launchClick) {
      this.launchClickEffects.push({
        x: launchClick.boardPx[0],
        y: launchClick.boardPx[1],
        colorId: arrow.colorId,
        elapsed: 0,
      });
    }
    return true;
  }

  /** 修复 animating 阶段卡死（animation 丢失或成员已清空） */
  recoverAnimationState(): void {
    if (this.phase === "animating" && this.animations.length === 0) {
      this.phase = "playing";
      this.rebuildCellMap();
      return;
    }
    if (this.animations.length === 0) return;

    for (const anim of [...this.animations]) {
      const remaining = anim.memberIds.filter((id) =>
        this.arrows.some((a) => a.instanceId === id),
      );
      if (remaining.length === 0) {
        if (anim.mode === "exit") {
          this.completeLaunchAnimation(anim);
        } else if (anim.mode !== "vanish") {
          this.finishAnimationOrPlaying(anim);
        } else {
          this.removeAnimation(anim);
        }
      }
    }
  }

  private maxAnimationSteps(anim: LaunchAnimation): number {
    if (anim.mode === "vanish") return VANISH_ANIM_STEPS;
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

  private completeLaunchAnimation(anim: LaunchAnimation): void {
    const removeIds = new Set(anim.memberIds);
    const group = this.bundleManager.getGroupForArrow(anim.instanceId);
    const removedArrows = this.arrows.filter((a) => removeIds.has(a.instanceId));

    this.commitPendingToggles(anim);

    // 相邻消除须在钥匙扣幕布 health 之前结算，幕布下物件不受本次飞出消除影响
    this.onArrowEliminationBatch(removedArrows, anim.originalPositionsById, {
      skipFlipArrowToggle: anim.flipButtonsCrossedIds.length > 0,
    });

    this.commitPendingFlipButtons(anim);

    this.applyKeyRewards(removedArrows, anim);
    for (const id of anim.memberIds) {
      const orig = anim.originalPositionsById[id];
      if (!orig) continue;
      this.recordClearedTraceCells(orig);
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
    this.removeAnimation(anim);
    this.rebuildCellMap();
    this.bombManager.updateActivation((bomb) => this.isBombCoveredForActivation(bomb));
    if (this.animations.length === 0) {
      this.resolveWinOrPlaying();
    }
  }

  private nextInstanceId(): number {
    const id = this.instanceIdSeq;
    this.instanceIdSeq += 1;
    return id;
  }

  private collectBoardOccupiedCellKeys(): Set<string> {
    const occupied = new Set<string>();
    for (const a of this.arrows) {
      for (const p of a.occupiedPositions) occupied.add(vecKey(p));
    }
    for (const c of this.corners) {
      for (const p of c.occupiedPositions) occupied.add(vecKey(p));
    }
    for (const b of this.buffs) {
      for (const p of b.occupiedPositions) occupied.add(vecKey(p));
    }
    for (const p of this.pipes) {
      for (const pos of p.occupiedPositions) occupied.add(vecKey(pos));
    }
    for (const w of this.wallManager.getWalls()) {
      for (const p of w.occupiedPositions) occupied.add(vecKey(p));
    }
    for (const s of this.shrinkPipes) {
      for (const p of s.occupiedPositions) occupied.add(vecKey(p));
    }
    for (const t of this.toggles) {
      for (const p of t.occupiedPositions) occupied.add(vecKey(p));
    }
    for (const c of this.controllers) {
      for (const p of c.occupiedPositions) occupied.add(vecKey(p));
    }
    for (const k of this.keys) {
      for (const p of k.occupiedPositions) occupied.add(vecKey(p));
    }
    for (const bundle of this.bundles) {
      for (const p of bundle.occupiedPositions) occupied.add(vecKey(p));
    }
    for (const key of this.getCurtainCells()) {
      occupied.add(key);
    }
    for (const key of this.level.blackHoleCells) {
      occupied.add(key);
    }
    return occupied;
  }

  private buildSpawnBlockContext(): SpawnBlockContext {
    const occupied = this.collectBoardOccupiedCellKeys();
    return {
      width: this.level.width,
      height: this.level.height,
      occupied,
      curtainCells: this.getCurtainCells(),
      spawnableZoneCells:
        this.level.boardShape === "custom" ? this.level.playableCells : null,
      blackHoleCells: this.level.blackHoleCells,
      existingArrows: this.arrows,
    };
  }

  private shouldTriggerImmediateSpawn(spawnBlocked: boolean): boolean {
    if (spawnBlocked) return false;
    if (!this.spawnManager.isEnabled()) return false;
    if (this.arrows.length > 0) return false;
    return true;
  }

  private executeSpawnWave(): void {
    if (!this.spawnManager.isEnabled()) return;
    const wave = runSpawnWave(
      this.level,
      this.buildSpawnBlockContext(),
      this.spawnManager.cycleElimCells,
      () => this.nextInstanceId(),
    );
    this.arrows.push(...wave.arrows);
    this.corners.push(...wave.corners);
    this.buffs.push(...wave.buffs);
    for (const buff of wave.buffs) {
      if (buff.kind === 21) this.registerBlackHole(buff.instanceId);
    }
    this.spawnManager.beginSpawnPhase(wave.instanceIds);
    this.spawnManager.resetCountdown();
    this.rebuildCellMap();
  }

  tryTriggerBuffAtCell(cell: Vec2): boolean {
    if (!this.canAcceptLaunchClick()) return false;
    const key = vecKey(cell);
    const buff = this.buffs.find(
      (b) =>
        this.isMechanicDrawable(b.zoneId) &&
        b.occupiedPositions.some((p) => vecKey(p) === key),
    );
    if (!buff || buff.kind === 20 || buff.kind === 21) return false;
    return this.triggerBuff(buff.instanceId);
  }

  triggerBuff(buffId: number): boolean {
    if (this.spawnManager.spawnPhase) return false;
    if (this.chainTriggerScheduled.has(buffId)) return false;
    const idx = this.buffs.findIndex((b) => b.instanceId === buffId);
    if (idx === -1) return false;
    const buff = this.buffs[idx]!;
    if (!this.isMechanicDrawable(buff.zoneId)) return false;

    const chainRegionKeys = isChainTriggerBuffKind(buff.kind)
      ? new Set(regionForBuff(buff).map(vecKey))
      : null;

    let started = false;
    if (buff.kind === 19) {
      started = this.startFireBombEffect(idx, buff);
    } else if (buff.kind === 17) {
      started = this.startAreaBombEffect(idx, buff);
    } else if (buff.kind === 18) {
      started = this.startCrossBombEffect(idx, buff);
    } else if (buff.kind === 22) {
      return this.triggerFlipButton(buff);
    } else if (buff.kind === 23) {
      return this.startCandyMachineEffect(idx, buff);
    }

    if (started && chainRegionKeys) {
      const center = buff.occupiedPositions[0];
      this.enqueueChainTriggersInRegion(chainRegionKeys, buff.instanceId);
      if (center) {
        this.enqueueBalloonsInRegion(chainRegionKeys, center);
        this.enqueueCandyMachinesInRegion(chainRegionKeys, center);
      }
    }
    return started;
  }

  private enqueueChainTriggersInRegion(
    regionKeys: Set<string>,
    sourceInstanceId: number,
  ): void {
    for (const buff of this.buffs) {
      if (buff.instanceId === sourceInstanceId) continue;
      if (!isChainTriggerBuffKind(buff.kind)) continue;
      if (!this.isMechanicDrawable(buff.zoneId)) continue;
      if (this.chainTriggerScheduled.has(buff.instanceId)) continue;
      const inRegion = buff.occupiedPositions.some((p) =>
        regionKeys.has(vecKey(p)),
      );
      if (!inRegion) continue;
      this.chainTriggerScheduled.add(buff.instanceId);
      this.pendingChainTriggers.push({
        buffId: buff.instanceId,
        remainingSec: CHAIN_TRIGGER_DELAY_SEC,
      });
    }
  }

  private tickChainTriggers(dt: number): void {
    if (this.pendingChainTriggers.length === 0) return;
    const ready: number[] = [];
    for (const pending of this.pendingChainTriggers) {
      pending.remainingSec -= dt;
      if (pending.remainingSec <= 0) ready.push(pending.buffId);
    }
    if (ready.length === 0) return;
    this.pendingChainTriggers = this.pendingChainTriggers.filter(
      (p) => p.remainingSec > 0,
    );
    for (const buffId of ready) {
      this.chainTriggerScheduled.delete(buffId);
      this.triggerBuff(buffId);
    }
  }

  /** 炸弹结算用箭位置：飞行中的箭按发射前原位计算伤害，当前飞行位置不受伤。 */
  private getAnimOriginalPositionOverlay(): Map<number, Vec2[]> {
    const map = new Map<number, Vec2[]>();
    for (const anim of this.animations) {
      if (anim.mode === "vanish") continue;
      for (const id of anim.memberIds) {
        const orig = anim.originalPositionsById[id];
        if (orig) map.set(id, clonePositions(orig));
      }
    }
    return map;
  }

  private arrowsForBuffDamage(): ArrowItem[] {
    const overlay = this.getAnimOriginalPositionOverlay();
    return this.arrows.map((a) => {
      const orig = overlay.get(a.instanceId);
      if (!orig) return a;
      return { ...a, occupiedPositions: orig };
    });
  }

  private patchAnimOriginalPositions(arrowId: number, positions: Vec2[]): void {
    for (const anim of this.animations) {
      if (anim.memberIds.includes(arrowId)) {
        anim.originalPositionsById[arrowId] = clonePositions(positions);
      }
    }
  }

  private removeAnimatingArrow(arrowId: number): void {
    for (const anim of [...this.animations]) {
      if (!anim.memberIds.includes(arrowId)) continue;
      anim.memberIds = anim.memberIds.filter((id) => id !== arrowId);
      delete anim.originalPositionsById[arrowId];
      delete anim.originalDirectionById[arrowId];
      delete anim.bumpHistoryById[arrowId];
      delete anim.currentDirectionById[arrowId];
      delete anim.pipeTransitById[arrowId];
      if (anim.memberIds.length === 0) {
        this.finishAnimationOrPlaying(anim);
      }
    }
  }

  private applyBuffHitOutcome(
    outcome: BuffSplitOutcome,
    hit: Map<number, Set<string>>,
    snapshotBefore: ArrowItem[],
  ): void {
    const overlay = this.getAnimOriginalPositionOverlay();
    const beforeMap = new Map(snapshotBefore.map((a) => [a.instanceId, a]));
    const next: ArrowItem[] = [];

    for (const arrow of outcome.arrows) {
      if (outcome.removedIds.includes(arrow.instanceId)) {
        if (overlay.has(arrow.instanceId)) {
          this.removeAnimatingArrow(arrow.instanceId);
        }
        continue;
      }
      const wasHit = hit.has(arrow.instanceId);
      const fly = beforeMap.get(arrow.instanceId);
      if (overlay.has(arrow.instanceId) && fly) {
        next.push({
          ...arrow,
          occupiedPositions: clonePositions(fly.occupiedPositions),
        });
        if (wasHit) {
          this.patchAnimOriginalPositions(
            arrow.instanceId,
            arrow.occupiedPositions,
          );
        }
      } else {
        next.push(arrow);
      }
    }
    this.arrows = next;
  }

  private getActiveFireIgnitedArrowIds(): Set<number> {
    const ids = new Set<number>();
    for (const effect of this.fireBombEffects) {
      for (const id of effect.affectedArrowIds) ids.add(id);
    }
    return ids;
  }

  private startFireBombEffect(buffIdx: number, buff: BuffItem): boolean {
    const center = buff.occupiedPositions[0];
    if (!center) return false;
    const region = regionForBuff(buff);
    const { schedules, affectedArrowIds } = buildFireSpreadSchedule(
      this.arrowsForBuffDamage(),
      region,
      [center[0], center[1]],
      this.getActiveFireIgnitedArrowIds(),
    );

    this.fireBombEffects.push({
      center: [center[0], center[1]],
      regionCells: region.map(([x, y]) => [x, y] as Vec2),
      elapsed: 0,
      schedules,
      affectedArrowIds,
      burntOutCellKeys: new Set(),
    });
    this.buffs.splice(buffIdx, 1);
    return true;
  }

  private tickFireBombEffectAt(index: number, dt: number): void {
    const effect = this.fireBombEffects[index];
    if (!effect) return;
    effect.elapsed += dt;

    for (const schedule of effect.schedules) {
      const key = vecKey(schedule.cell);
      if (effect.burntOutCellKeys.has(key)) continue;
      if (effect.elapsed >= schedule.igniteAt + FIRE_CELL_BURN_DURATION) {
        effect.burntOutCellKeys.add(key);
        this.recordClearedTraceCells([schedule.cell]);
      }
    }

    const totalDuration = fireBombEffectTotalDuration(effect.schedules);
    if (effect.elapsed >= totalDuration) {
      this.commitFireBombEffectAt(index);
    }
  }

  private commitFireBombEffectAt(index: number): void {
    const effect = this.fireBombEffects[index];
    if (!effect) return;
    this.fireBombEffects.splice(index, 1);

    const removed = this.arrows.filter((a) =>
      effect.affectedArrowIds.has(a.instanceId),
    );
    if (removed.length > 0) {
      this.onArrowEliminationBatch(removed);
    }
    for (const id of effect.affectedArrowIds) {
      this.removeAnimatingArrow(id);
    }
    this.arrows = this.arrows.filter(
      (a) => !effect.affectedArrowIds.has(a.instanceId),
    );
    this.rebuildCellMap();
    if (this.checkWinCondition()) {
      this.phase = "won";
    }
  }

  private startAreaBombEffect(buffIdx: number, buff: BuffItem): boolean {
    const region = regionForBuff(buff);
    const damageArrows = this.arrowsForBuffDamage();
    const hit = collectArrowCellsInRegion(damageArrows, region);
    const center = buff.occupiedPositions[0];
    if (!center) return false;

    this.areaBombEffects.push({
      center: [center[0], center[1]],
      bombRadius: buff.kind === 17 && buff.bombRadius === 2 ? 2 : 1,
      regionCells: region.map(([x, y]) => [x, y] as Vec2),
      debris: buildAreaBombDebris(damageArrows, hit, center),
      elapsed: 0,
      pendingCommit: { hit },
    });
    this.buffs.splice(buffIdx, 1);
    return true;
  }

  private commitAreaBombEffectAt(index: number): void {
    const effect = this.areaBombEffects[index];
    if (!effect) return;
    this.areaBombEffects.splice(index, 1);
    this.applyPartialBuffHit(effect.pendingCommit.hit);
    if (this.checkWinCondition()) {
      this.phase = "won";
    }
  }

  private applyPartialBuffHit(hit: Map<number, Set<string>>): void {
    this.applyPartialBuffHitForCells(hitCellKeys(hit));
  }

  private applyPartialBuffHitForCells(cellKeys: Set<string>): void {
    if (cellKeys.size === 0) return;
    const snapshotBefore = [...this.arrows];
    const hit = new Map<number, Set<string>>();
    for (const arrow of this.arrowsForBuffDamage()) {
      for (const p of arrow.occupiedPositions) {
        const k = vecKey(p);
        if (!cellKeys.has(k)) continue;
        let set = hit.get(arrow.instanceId);
        if (!set) {
          set = new Set();
          hit.set(arrow.instanceId, set);
        }
        set.add(k);
      }
    }
    if (hit.size === 0) {
      this.recordClearedTraceCells(
        [...cellKeys].map((k) => {
          const [x, y] = k.split(",").map(Number);
          return [x!, y!] as Vec2;
        }),
      );
      return;
    }

    const before = new Map(this.arrowsForBuffDamage().map((a) => [a.instanceId, a]));
    const outcome = applyPartialArrowDestruction(
      this.arrowsForBuffDamage(),
      hit,
      () => this.nextInstanceId(),
    );
    for (const id of outcome.removedIds) {
      const arrow = before.get(id);
      if (arrow) this.goalTracker.onEliminationCredit(arrow.colorId, 1);
    }
    for (const [arrowId] of hit) {
      if (!outcome.removedIds.includes(arrowId)) {
        const arrow = before.get(arrowId);
        if (arrow) this.goalTracker.onEliminationCredit(arrow.colorId, 1);
      }
    }
    const fullyRemoved = [...before.values()].filter((a) =>
      outcome.removedIds.includes(a.instanceId),
    );
    if (fullyRemoved.length > 0) {
      this.onArrowEliminationBatch(fullyRemoved);
    }
    this.recordClearedTraceCells(
      [...cellKeys].map((k) => {
        const [x, y] = k.split(",").map(Number);
        return [x!, y!] as Vec2;
      }),
    );
    this.applyBuffHitOutcome(outcome, hit, snapshotBefore);
    this.rebuildCellMap();
  }

  private startCrossBombEffect(buffIdx: number, buff: BuffItem): boolean {
    const center = buff.occupiedPositions[0];
    if (!center || buff.kind !== 18) return false;
    const crossArm = buff.crossArm === 5 ? 5 : 2;
    const rings = crossCellsByRing(
      center,
      crossArm,
      this.level.width,
      this.level.height,
    );

    const effect: CrossBombEffectState = {
      center: [center[0], center[1]],
      crossArm: crossArm as 2 | 5,
      rings,
      elapsed: 0,
      activatedCellKeys: new Set(),
      cellBlasts: [],
      nextRingIndex: 0,
    };
    this.crossBombEffects.push(effect);
    this.buffs.splice(buffIdx, 1);
    this.activateCrossBombRing(effect, 0);
    return true;
  }

  private activateCrossBombRing(
    effect: CrossBombEffectState,
    ringIndex: number,
  ): void {
    const ring = effect.rings[ringIndex];
    if (!ring || ring.length === 0) return;

    const blasts = buildCrossBombCellBlasts(
      ring,
      this.arrowsForBuffDamage(),
      effect.center,
      effect.elapsed,
    );
    effect.cellBlasts.push(...blasts);

    const keys = new Set(ring.map(vecKey));
    for (const k of keys) effect.activatedCellKeys.add(k);
    this.applyPartialBuffHitForCells(keys);

    effect.nextRingIndex = ringIndex + 1;
  }

  private tickCrossBombEffectAt(index: number, dt: number): void {
    const effect = this.crossBombEffects[index];
    if (!effect) return;
    effect.elapsed += dt;

    while (effect.nextRingIndex < effect.rings.length) {
      const triggerAt = crossBombWaveStartTime(effect.nextRingIndex);
      if (effect.elapsed < triggerAt) break;
      this.activateCrossBombRing(effect, effect.nextRingIndex);
    }

    const totalDuration = crossBombEffectTotalDuration(effect.rings.length);
    if (effect.elapsed >= totalDuration) {
      this.crossBombEffects.splice(index, 1);
      if (this.checkWinCondition()) {
        this.phase = "won";
      }
    }
  }

  private getBuffEffectHiddenCells(): Set<string> {
    const hidden = new Set<string>();
    for (const effect of this.areaBombEffects) {
      for (const k of hitCellKeys(effect.pendingCommit.hit)) {
        hidden.add(k);
      }
    }
    for (const effect of this.crossBombEffects) {
      for (const k of effect.activatedCellKeys) {
        hidden.add(k);
      }
    }
    for (const effect of this.fireBombEffects) {
      for (const schedule of effect.schedules) {
        if (shouldHideArrowCellFromFire(effect.elapsed, schedule.igniteAt)) {
          hidden.add(vecKey(schedule.cell));
        }
      }
    }
    return hidden;
  }

  private maskArrowsForActiveEffect(arrows: ArrowItem[]): ArrowItem[] {
    const hidden = this.getBuffEffectHiddenCells();
    if (hidden.size === 0) return arrows;
    return maskArrowsForDestroyedCells(arrows, hidden);
  }

  private hasActiveExplosiveBuffEffect(): boolean {
    return (
      this.areaBombEffects.length > 0 ||
      this.crossBombEffects.length > 0 ||
      this.fireBombEffects.length > 0
    );
  }

  /** 道具/ buff 视觉或结算效果进行中（阻塞 rush 刷新倒计时） */
  private hasActivePropEffect(): boolean {
    if (this.hasActiveExplosiveBuffEffect()) return true;
    if (this.balloonEffects.length > 0) return true;
    if (this.pendingBalloonTriggers.length > 0) return true;
    if (this.pendingCandyMachineTriggers.length > 0) return true;
    if (this.candyMachineEffects.length > 0) return true;
    if (this.autoRefreshEffect) return true;
    if (this.pendingChainTriggers.length > 0) return true;
    return this.hasActiveBlackHoleEffect();
  }

  private hasActiveBlackHoleEffect(): boolean {
    for (const runtime of this.blackHoleRuntime.values()) {
      if (runtime.phase === "swallow-spin" || runtime.phase === "expiring") {
        return true;
      }
    }
    return false;
  }

  getFireBombEffectsForRender(): {
    center: Vec2;
    regionCells: Vec2[];
    burstProgress: number;
    showBurst: boolean;
    burningCells: {
      cell: Vec2;
      progress: number;
      charProgress: number;
      seed: number;
      arrowColorId?: number;
    }[];
  }[] {
    return this.fireBombEffects.map((effect) => {
      const burstProgress = Math.min(1, effect.elapsed / FIRE_BURST_DURATION);
      const burningCells = effect.schedules
        .filter((s) => {
          const key = vecKey(s.cell);
          if (effect.burntOutCellKeys.has(key)) return false;
          return effect.elapsed >= s.igniteAt;
        })
        .map((s) => {
          const key = vecKey(s.cell);
          let seed = 0;
          for (let i = 0; i < key.length; i++) {
            seed = (seed * 31 + key.charCodeAt(i)) | 0;
          }
          const progress = fireCellBurnProgress(effect.elapsed, s.igniteAt);
          let arrowColorId: number | undefined;
          if (s.arrowId != null) {
            arrowColorId = this.arrows.find((a) => a.instanceId === s.arrowId)
              ?.colorId;
          }
          return {
            cell: s.cell,
            progress,
            charProgress: fireCellCharProgress(progress),
            seed: Math.abs(seed) / 0x7fffffff,
            arrowColorId,
          };
        });

      return {
        center: effect.center,
        regionCells: effect.regionCells,
        burstProgress,
        showBurst: effect.elapsed < FIRE_BURST_DURATION + 0.2,
        burningCells,
      };
    });
  }

  getCrossBombEffectsForRender(): {
    center: Vec2;
    primedProgress: number;
    showPrimed: boolean;
    cellBlasts: {
      cell: Vec2;
      progress: number;
      debris: AreaBombEffectState["debris"][number] | null;
    }[];
  }[] {
    return this.crossBombEffects.map((effect) => {
      const primedProgress = Math.min(
        1,
        effect.elapsed / CROSS_BOMB_PRIMED_DURATION,
      );
      const showPrimed = effect.elapsed < CROSS_BOMB_PRIMED_DURATION + 0.08;

      const cellBlasts = effect.cellBlasts.map((blast) => ({
        cell: blast.cell,
        progress: Math.min(
          1,
          (effect.elapsed - blast.startElapsed) / CROSS_CELL_BLAST_DURATION,
        ),
        debris: blast.debris,
      }));

      return {
        center: effect.center,
        primedProgress,
        showPrimed,
        cellBlasts,
      };
    });
  }

  getAreaBombEffectsForRender(): {
    progress: number;
    center: Vec2;
    bombRadius: 1 | 2;
    regionCells: Vec2[];
    debris: AreaBombEffectState["debris"];
  }[] {
    return this.areaBombEffects.map((effect) => ({
      progress: Math.min(1, effect.elapsed / AREA_BOMB_EFFECT_DURATION),
      center: effect.center,
      bombRadius: effect.bombRadius,
      regionCells: effect.regionCells,
      debris: effect.debris,
    }));
  }

  private balloonArrowFilter(balloon: BuffItem, arrow: ArrowItem): boolean {
    if (!this.isMechanicDrawable(arrow.zoneId)) return false;
    if (balloon.zoneId != null) return arrow.zoneId === balloon.zoneId;
    return arrow.zoneId == null;
  }

  private isBalloonPendingTrigger(buffId: number): boolean {
    return this.pendingBalloonTriggers.some((p) => p.buffId === buffId);
  }

  private enqueueBalloonsInRegion(regionKeys: Set<string>, bombCenter: Vec2): void {
    const balloons = this.buffs.filter(
      (b) =>
        b.kind === 20 &&
        this.isMechanicDrawable(b.zoneId) &&
        !this.isBalloonPendingTrigger(b.instanceId) &&
        b.occupiedPositions.some((p) => regionKeys.has(vecKey(p))),
    );
    if (balloons.length === 0) return;

    balloons.sort((a, b) => {
      const cellA = a.occupiedPositions[0]!;
      const cellB = b.occupiedPositions[0]!;
      return manhattanDistance(cellA, bombCenter) - manhattanDistance(cellB, bombCenter);
    });

    const colorRank = rankArrowColorIds(this.arrows, (arrow) =>
      this.isMechanicDrawable(arrow.zoneId),
    );

    const queueOffset = this.pendingBalloonTriggers.length;
    for (let i = 0; i < balloons.length; i++) {
      const buff = balloons[i]!;
      const colorId = colorRank[i] ?? 0;
      const opts = {
        requireArrowReturn: false,
        hitArrowInstanceId: -1,
        anim: null as LaunchAnimation | null,
      };
      const delaySec = (queueOffset + i) * CHAIN_TRIGGER_DELAY_SEC;
      if (delaySec <= 0) {
        this.startBalloonEffect(buff, colorId, opts);
      } else {
        this.pendingBalloonTriggers.push({
          buffId: buff.instanceId,
          colorId,
          requireArrowReturn: false,
          hitArrowInstanceId: -1,
          remainingSec: delaySec,
        });
      }
    }
  }

  private enqueueCandyMachinesInRegion(
    regionKeys: Set<string>,
    bombCenter: Vec2,
  ): void {
    const machines = this.buffs.filter(
      (b) =>
        b.kind === 23 &&
        this.isMechanicDrawable(b.zoneId) &&
        !this.isCandyMachinePendingTrigger(b.instanceId) &&
        b.occupiedPositions.some((p) => regionKeys.has(vecKey(p))),
    );
    if (machines.length === 0) return;

    machines.sort((a, b) => {
      const cellA = a.occupiedPositions[0]!;
      const cellB = b.occupiedPositions[0]!;
      return manhattanDistance(cellA, bombCenter) - manhattanDistance(cellB, bombCenter);
    });

    const queueOffset = this.pendingCandyMachineTriggers.length;
    for (let i = 0; i < machines.length; i++) {
      const buff = machines[i]!;
      const idx = this.buffs.findIndex((b) => b.instanceId === buff.instanceId);
      if (idx === -1) continue;
      const delaySec = (queueOffset + i) * CHAIN_TRIGGER_DELAY_SEC;
      if (delaySec <= 0) {
        this.startCandyMachineEffect(idx, buff);
      } else {
        this.pendingCandyMachineTriggers.push({
          buffId: buff.instanceId,
          remainingSec: delaySec,
        });
      }
    }
  }

  private isCandyMachinePendingTrigger(buffId: number): boolean {
    return this.pendingCandyMachineTriggers.some((p) => p.buffId === buffId);
  }

  private tickPendingCandyMachineTriggers(dt: number): void {
    if (this.pendingCandyMachineTriggers.length === 0) return;
    const ready: number[] = [];
    for (const pending of this.pendingCandyMachineTriggers) {
      pending.remainingSec -= dt;
      if (pending.remainingSec <= 0) ready.push(pending.buffId);
    }
    if (ready.length === 0) return;
    this.pendingCandyMachineTriggers = this.pendingCandyMachineTriggers.filter(
      (p) => p.remainingSec > 0,
    );
    for (const buffId of ready) {
      const idx = this.buffs.findIndex((b) => b.instanceId === buffId);
      if (idx === -1) continue;
      const buff = this.buffs[idx]!;
      if (buff.kind !== 23) continue;
      this.startCandyMachineEffect(idx, buff);
    }
  }

  private tickPendingBalloonTriggers(dt: number): void {
    if (this.pendingBalloonTriggers.length === 0) return;
    const ready: typeof this.pendingBalloonTriggers = [];
    for (const pending of this.pendingBalloonTriggers) {
      pending.remainingSec -= dt;
      if (pending.remainingSec <= 0) ready.push(pending);
    }
    if (ready.length === 0) return;
    this.pendingBalloonTriggers = this.pendingBalloonTriggers.filter(
      (p) => p.remainingSec > 0,
    );
    for (const pending of ready) {
      const buff = this.buffs.find((b) => b.instanceId === pending.buffId);
      if (!buff || buff.kind !== 20) continue;
      this.startBalloonEffect(buff, pending.colorId, {
        requireArrowReturn: pending.requireArrowReturn,
        hitArrowInstanceId: pending.hitArrowInstanceId,
        anim: null,
      });
    }
  }

  private collectBalloonAffectedArrows(
    balloon: BuffItem,
    colorId: number,
  ): ArrowItem[] {
    if (colorId === 0) return [];
    return this.arrows.filter(
      (a) => a.colorId === colorId && this.balloonArrowFilter(balloon, a),
    );
  }

  private startBalloonEffect(
    buff: BuffItem,
    colorId: number,
    opts: {
      requireArrowReturn: boolean;
      hitArrowInstanceId: number;
      anim: LaunchAnimation | null;
    },
  ): void {
    const affected = this.collectBalloonAffectedArrows(buff, colorId);
    if (
      opts.requireArrowReturn &&
      opts.anim &&
      !opts.anim.reversing
    ) {
      this.clearPipeAnimState(opts.anim);
      opts.anim.reversing = true;
    }
    const idx = this.buffs.indexOf(buff);
    if (idx !== -1) this.buffs.splice(idx, 1);
    this.balloonEffects.push({
      cell: [buff.occupiedPositions[0]![0], buff.occupiedPositions[0]![1]],
      colorId,
      elapsed: 0,
      affectedArrowIds: new Set(affected.map((a) => a.instanceId)),
      requireArrowReturn: opts.requireArrowReturn,
      arrowReturnElapsed: opts.requireArrowReturn ? null : 0,
      hitArrowInstanceId: opts.hitArrowInstanceId,
    });
    this.rebuildCellMap();
  }

  private tryTriggerBalloonForStep(
    prevPositions: Vec2[],
    newPositions: Vec2[],
    hitArrow: ArrowItem,
    anim: LaunchAnimation | null,
  ): void {
    const prevKeys = new Set(prevPositions.map(vecKey));
    const newKeys = new Set(newPositions.map(vecKey));
    const balloonIdx = this.buffs.findIndex(
      (b) =>
        b.kind === 20 &&
        this.isMechanicDrawable(b.zoneId) &&
        b.occupiedPositions.some((p) => {
          const k = vecKey(p);
          return newKeys.has(k) && !prevKeys.has(k);
        }),
    );
    if (balloonIdx === -1) return;
    const buff = this.buffs[balloonIdx]!;
    const requireReturn = anim?.mode === "bump";
    this.startBalloonEffect(buff, hitArrow.colorId, {
      requireArrowReturn: requireReturn,
      hitArrowInstanceId: hitArrow.instanceId,
      anim,
    });
  }

  private tryTriggerFlipButtonForStep(
    anim: LaunchAnimation,
    prevPositions: Vec2[],
    newPositions: Vec2[],
  ): void {
    this.recordFlipButtonCrossingForAnim(anim, prevPositions, newPositions);
  }

  private triggerFlipButton(
    buff: BuffItem,
    opts?: { excludeArrowIds?: Set<number> },
  ): boolean {
    if (buff.kind !== 22) return false;
    const idx = this.buffs.findIndex((b) => b.instanceId === buff.instanceId);
    if (idx === -1) return false;
    this.buffs.splice(idx, 1);
    const pickIds = pickAutoRefreshArrowIds(
      this.arrows,
      (a) =>
        this.isMechanicDrawable(a.zoneId) &&
        !opts?.excludeArrowIds?.has(a.instanceId),
    );
    if (pickIds.size > 0) {
      this.applyPartialArrowFlip(pickIds, opts?.excludeArrowIds);
    }
    return true;
  }

  private candyMachineArrowFilter(
    machine: BuffItem,
    arrow: ArrowItem,
  ): boolean {
    if (!this.isMechanicDrawable(arrow.zoneId)) return false;
    if (machine.zoneId != null) return arrow.zoneId === machine.zoneId;
    return arrow.zoneId == null;
  }

  private buildCandyMachineShots(
    machine: BuffItem,
    machineCell: Vec2,
  ): CandyMachineEffectState["shots"] {
    const eligible = this.arrows.filter((a) =>
      this.candyMachineArrowFilter(machine, a),
    );
    const shuffled = [...eligible];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    const picks = shuffled.slice(0, CANDY_MACHINE_SHOT_COUNT);
    const shots = picks.map((arrow) => {
      const pos = arrow.occupiedPositions;
      const cell = pos[Math.floor(Math.random() * pos.length)]!;
      const colorId =
        CANDY_MACHINE_CANDY_COLOR_IDS[
          Math.floor(Math.random() * CANDY_MACHINE_CANDY_COLOR_IDS.length)
        ]!;
      return {
        targetCell: [cell[0], cell[1]] as Vec2,
        targetArrowId: arrow.instanceId,
        colorId,
        flightDuration: candyFlightDuration(machineCell, cell),
        launchAt: 0,
        arrivedAt: null,
      };
    });
    assignCandyShotLaunchDelays(shots);
    return shots;
  }

  private startCandyMachineEffect(idx: number, buff: BuffItem): boolean {
    if (buff.kind !== 23) return false;
    if (!this.isMechanicDrawable(buff.zoneId)) return false;
    const machineCell = buff.occupiedPositions[0];
    if (!machineCell) return false;
    this.buffs.splice(idx, 1);
    const cell: Vec2 = [machineCell[0], machineCell[1]];
    this.candyMachineEffects.push({
      machineCell: cell,
      elapsed: 0,
      shots: this.buildCandyMachineShots(buff, cell),
    });
    this.rebuildCellMap();
    return true;
  }

  private tryTriggerCandyMachineForStep(
    prevPositions: Vec2[],
    newPositions: Vec2[],
  ): void {
    const prevKeys = new Set(prevPositions.map(vecKey));
    const newKeys = new Set(newPositions.map(vecKey));
    const idx = this.buffs.findIndex(
      (b) =>
        b.kind === 23 &&
        this.isMechanicDrawable(b.zoneId) &&
        b.occupiedPositions.some((p) => {
          const k = vecKey(p);
          return newKeys.has(k) && !prevKeys.has(k);
        }),
    );
    if (idx === -1) return;
    this.startCandyMachineEffect(idx, this.buffs[idx]!);
  }

  /** 僵局自动刷新（仅爽快版）：先播放魔法杖特效，结束后再翻转箭头 */
  checkAndAutoRefreshBoard(): boolean {
    if (!this.isRushLevel()) return false;
    if (this.autoRefreshEffect) return false;
    if (!this.isBoardStableForStalemateCheck()) return false;
    if (!isBoardStalemate(this.buildStalemateContext())) return false;
    this.startBoardAutoRefresh();
    return true;
  }

  private tickAutoRefreshEffect(dt: number): void {
    if (!this.autoRefreshEffect) return;
    this.autoRefreshEffect.elapsed += dt;
    if (this.autoRefreshEffect.elapsed >= AUTO_REFRESH_EFFECT_DURATION) {
      this.commitBoardAutoRefresh();
    }
  }

  getAutoRefreshEffectForRender(): {
    progress: number;
    boardWidth: number;
    boardHeight: number;
    seed: number;
  } | null {
    if (!this.autoRefreshEffect) return null;
    return {
      progress: autoRefreshEffectProgress(this.autoRefreshEffect.elapsed),
      boardWidth: this.level.width,
      boardHeight: this.level.height,
      seed: this.autoRefreshEffect.seed,
    };
  }

  private startBoardAutoRefresh(): void {
    const activeIds = new Set(this.getActiveArrows().map((a) => a.instanceId));
    const pickIds = pickAutoRefreshArrowIds(this.arrows, (a) =>
      activeIds.has(a.instanceId) && this.isMechanicDrawable(a.zoneId),
    );
    if (pickIds.size === 0) return;
    this.autoRefreshEffect = {
      elapsed: 0,
      pendingFlipIds: [...pickIds],
      seed: Math.random() * 1000,
    };
  }

  private commitBoardAutoRefresh(): void {
    if (!this.autoRefreshEffect) return;
    const ids = new Set(this.autoRefreshEffect.pendingFlipIds);
    this.autoRefreshEffect = null;
    this.applyPartialArrowFlip(ids);
  }

  private isBoardStableForStalemateCheck(): boolean {
    if (this.phase !== "playing") return false;
    if (this.animations.length > 0) return false;
    if (this.spawnManager.spawnPhase) return false;
    if (this.hasActiveExplosiveBuffEffect()) return false;
    if (this.balloonEffects.length > 0 || this.pendingBalloonTriggers.length > 0) {
      return false;
    }
    if (this.candyMachineEffects.length > 0) return false;
    if (this.pendingCandyMachineTriggers.length > 0) return false;
    if (this.autoRefreshEffect) return false;
    if (this.hasVanishAnimation()) return false;
    if (this.getActiveArrows().length === 0) return false;
    return true;
  }

  private buildStalemateContext(): BoardStalemateContext {
    const animating = this.getAnimatingMemberIds();
    const activeArrows = this.getActiveArrows().filter(
      (a) => !animating.has(a.instanceId),
    );
    return {
      board: this.level,
      arrows: this.arrows,
      buffs: this.buffs.filter((b) => this.isMechanicDrawable(b.zoneId)),
      launchableIds: this.getLaunchableIds(),
      launchUnits: buildLaunchUnits(activeArrows, this.bundleManager),
      blockingArrows: this.getBlockingArrowsForPathCheck(),
      activeCorners: this.getActiveCorners(),
      pipes: this.getActivePipes(),
      curtainCells: this.getCurtainCells(),
      wallCells: this.getWallBlockerCells(),
      canClickBuffs: this.canAcceptLaunchClick(),
      activeBlackHoleIds: new Set(
        this.buffs
          .filter(
            (b) => b.kind === 21 && this.isBlackHoleActive(b.instanceId),
          )
          .map((b) => b.instanceId),
      ),
      blackHoleCells: this.level.blackHoleCells,
      balloonArrowFilter: (balloon, arrow) =>
        this.balloonArrowFilter(balloon, arrow),
    };
  }

  private applyPartialArrowFlip(
    ids: Set<number>,
    excludeArrowIds?: Set<number>,
  ): void {
    const arrowPosBefore = new Map(
      this.arrows.map((a) => [a.instanceId, clonePositions(a.occupiedPositions)]),
    );
    this.arrows = this.arrows.map((a) =>
      ids.has(a.instanceId) && this.isMechanicDrawable(a.zoneId)
        ? flipBoardArrow(a)
        : a,
    );
    this.syncArrowsAfterFlip(arrowPosBefore, excludeArrowIds);
  }

  private syncArrowsAfterFlip(
    arrowPosBefore: Map<number, Vec2[]>,
    excludeArrowIds?: Set<number>,
  ): void {
    for (const arrow of this.arrows) {
      const oldPos = arrowPosBefore.get(arrow.instanceId);
      if (!oldPos) continue;
      if (
        oldPos.length !== arrow.occupiedPositions.length ||
        oldPos.some(
          (p, i) =>
            p[0] !== arrow.occupiedPositions[i]![0] ||
            p[1] !== arrow.occupiedPositions[i]![1],
        )
      ) {
        this.syncControllersForHostMove(
          arrow.instanceId,
          oldPos,
          arrow.occupiedPositions,
        );
      }
    }
    this.syncAnimationsAfterBoardFlip(excludeArrowIds);
    this.bombManager.syncWithArrows(this.arrows);
    this.rebuildCellMap();
  }

  private syncAnimationsAfterBoardFlip(excludeArrowIds?: Set<number>): void {
    const reversePosList = (positions: Vec2[]): Vec2[] =>
      [...positions].reverse().map(([x, y]) => [x, y] as Vec2);

    for (const anim of this.animations) {
      for (const id of anim.memberIds) {
        if (excludeArrowIds?.has(id)) continue;
        const arrow = this.arrows.find((a) => a.instanceId === id);
        if (!arrow) continue;
        anim.currentDirectionById[id] = arrow.direction;
        if (anim.originalPositionsById[id]) {
          anim.originalPositionsById[id] = reversePosList(
            anim.originalPositionsById[id],
          );
        }
        const history = anim.bumpHistoryById[id];
        if (history?.length) {
          anim.bumpHistoryById[id] = history.map(reversePosList);
        }
      }
    }
  }

  private findAllExplosiveBuffsEntered(
    prevPositions: Vec2[],
    newPositions: Vec2[],
  ): BuffItem[] {
    const prevKeys = new Set(prevPositions.map(vecKey));
    const newKeys = new Set(newPositions.map(vecKey));
    const entered: BuffItem[] = [];
    for (const buff of this.buffs) {
      if (buff.kind !== 17 && buff.kind !== 18 && buff.kind !== 19) continue;
      if (!this.isMechanicDrawable(buff.zoneId)) continue;
      for (const p of buff.occupiedPositions) {
        const k = vecKey(p);
        if (newKeys.has(k) && !prevKeys.has(k)) {
          entered.push(buff);
          break;
        }
      }
    }
    return entered;
  }

  /** 箭身 newly 进入 17/18/19 格时触发爆炸（不阻挡移动，多个同时引爆）。 */
  private tryTriggerExplosiveBuffForStep(
    prevPositions: Vec2[],
    newPositions: Vec2[],
  ): void {
    if (this.spawnManager.spawnPhase) return;
    const buffs = this.findAllExplosiveBuffsEntered(prevPositions, newPositions);
    for (const buff of buffs) {
      this.triggerBuff(buff.instanceId);
    }
  }

  private findBlackHoleEntered(
    prevPositions: Vec2[],
    newPositions: Vec2[],
  ): BuffItem | null {
    const prevKeys = new Set(prevPositions.map(vecKey));
    const newKeys = new Set(newPositions.map(vecKey));
    for (const buff of this.buffs) {
      if (buff.kind !== 21 || !this.isMechanicDrawable(buff.zoneId)) continue;
      if (!this.isBlackHoleActive(buff.instanceId)) continue;
      for (const p of buff.occupiedPositions) {
        const k = vecKey(p);
        if (newKeys.has(k) && !prevKeys.has(k)) return buff;
      }
    }
    return null;
  }

  private registerBlackHole(instanceId: number): void {
    this.blackHoleRuntime.set(instanceId, {
      age: 0,
      phase: "active",
      effectElapsed: 0,
    });
  }

  private removeBlackHoleRuntime(instanceId: number): void {
    this.blackHoleRuntime.delete(instanceId);
  }

  private isBlackHoleActive(instanceId: number): boolean {
    const runtime = this.blackHoleRuntime.get(instanceId);
    return runtime?.phase === "active" && runtime.age < BLACK_HOLE_LIFETIME_SEC;
  }

  private tickBlackHoles(dt: number): void {
    const expiringDone: number[] = [];

    for (const buff of this.buffs) {
      if (buff.kind !== 21) continue;
      let runtime = this.blackHoleRuntime.get(buff.instanceId);
      if (!runtime) {
        this.registerBlackHole(buff.instanceId);
        runtime = this.blackHoleRuntime.get(buff.instanceId)!;
      }

      if (runtime.phase === "active") {
        runtime.age += dt;
        if (runtime.age >= BLACK_HOLE_LIFETIME_SEC) {
          runtime.phase = "expiring";
          runtime.effectElapsed = 0;
        }
      } else if (runtime.phase === "swallow-spin") {
        runtime.age += dt;
        runtime.effectElapsed += dt;
        if (runtime.effectElapsed >= BLACK_HOLE_SPIN_DURATION) {
          runtime.phase = "active";
          runtime.effectElapsed = 0;
          if (runtime.age >= BLACK_HOLE_LIFETIME_SEC) {
            runtime.phase = "expiring";
            runtime.effectElapsed = 0;
          }
        }
      } else {
        runtime.effectElapsed += dt;
        if (runtime.effectElapsed >= BLACK_HOLE_VANISH_DURATION) {
          expiringDone.push(buff.instanceId);
        }
      }
    }

    if (expiringDone.length > 0) {
      const removeIds = new Set(expiringDone);
      this.buffs = this.buffs.filter((b) => !removeIds.has(b.instanceId));
      for (const id of expiringDone) this.removeBlackHoleRuntime(id);
      this.rebuildCellMap();
    }
  }

  getBlackHoleFxForRender(): ReadonlyMap<number, BlackHoleRenderFx> {
    const map = new Map<number, BlackHoleRenderFx>();
    for (const [id, runtime] of this.blackHoleRuntime) {
      let rotation = 0;
      let vanishProgress = 0;
      if (runtime.phase === "swallow-spin") {
        const t = Math.min(1, runtime.effectElapsed / BLACK_HOLE_SPIN_DURATION);
        rotation = t * Math.PI * 2;
      } else if (runtime.phase === "expiring") {
        vanishProgress = Math.min(
          1,
          runtime.effectElapsed / BLACK_HOLE_VANISH_DURATION,
        );
      }
      map.set(id, { rotation, vanishProgress });
    }
    return map;
  }

  private triggerBlackHoleSwallowSpin(buff: BuffItem): void {
    const runtime = this.blackHoleRuntime.get(buff.instanceId);
    if (!runtime || runtime.phase === "expiring") return;
    runtime.phase = "swallow-spin";
    runtime.effectElapsed = 0;
  }

  private finalizeBlackHoleRegionSwallow(
    arrow: ArrowItem,
    anim: LaunchAnimation,
  ): void {
    const id = arrow.instanceId;
    if (!anim.memberIds.includes(id)) return;
    const removed = this.arrows.find((a) => a.instanceId === id);
    if (!removed) return;

    if (anim.mode === "exit") {
      for (const pipeId of anim.pipesCrossedById[id] ?? []) {
        decrementPipeHealth(this.pipes, pipeId);
      }
      this.pipes = pruneDeadPipes(this.pipes);
      this.applyKeyRewards([removed], anim);
    }

    const orig = anim.originalPositionsById[id];
    this.onArrowEliminationBatch(
      [removed],
      orig ? { [id]: orig } : undefined,
    );
    this.recordClearedTraceCells(orig ?? removed.occupiedPositions);

    this.arrows = this.arrows.filter((a) => a.instanceId !== id);
    anim.memberIds = anim.memberIds.filter((mid) => mid !== id);
    delete anim.bumpHistoryById[id];
    delete anim.currentDirectionById[id];
    delete anim.originalDirectionById[id];
    delete anim.originalPositionsById[id];
    delete anim.pipeTransitById[id];
    delete anim.pipesCrossedById[id];

    this.rebuildCellMap();
    this.bombManager.updateActivation((bomb) => this.isBombCoveredForActivation(bomb));

    if (anim.memberIds.length === 0) {
      if (anim.stripIds.length > 0) {
        this.bundleManager.resetGroupStrips(anim.stripIds, this.bundles);
      }
      this.removeAnimation(anim);
      if (this.animations.length === 0) {
        this.resolveWinOrPlaying();
      }
    }
  }

  private consumeBlackHoleRegionSegments(
    arrow: ArrowItem,
    anim: LaunchAnimation,
  ): boolean {
    if (this.level.blackHoleCells.size === 0) return false;

    const { remaining, consumed } = trimArrowSuffixInBlackHole(
      arrow.occupiedPositions,
      this.level.blackHoleCells,
    );
    if (consumed.length === 0) return false;

    this.recordClearedTraceCells(consumed);

    if (remaining.length === 0) {
      this.finalizeBlackHoleRegionSwallow(arrow, anim);
      return true;
    }

    const trimmed = withPositions(arrow, remaining);
    const idx = this.arrows.findIndex((a) => a.instanceId === arrow.instanceId);
    if (idx !== -1) this.arrows[idx] = trimmed;
    return false;
  }

  private swallowArrowInBlackHole(
    arrow: ArrowItem,
    blackHole: BuffItem,
    anim: LaunchAnimation,
  ): void {
    const id = arrow.instanceId;
    if (!anim.memberIds.includes(id)) return;
    const removed = this.arrows.find((a) => a.instanceId === id);
    if (!removed) return;

    this.triggerBlackHoleSwallowSpin(blackHole);

    if (anim.mode === "exit") {
      for (const pipeId of anim.pipesCrossedById[id] ?? []) {
        decrementPipeHealth(this.pipes, pipeId);
      }
      this.pipes = pruneDeadPipes(this.pipes);
      this.applyKeyRewards([removed], anim);
    }

    const orig = anim.originalPositionsById[id];
    this.onArrowEliminationBatch(
      [removed],
      orig ? { [id]: orig } : undefined,
    );
    this.recordClearedTraceCells(orig ?? removed.occupiedPositions);

    this.arrows = this.arrows.filter((a) => a.instanceId !== id);
    anim.memberIds = anim.memberIds.filter((mid) => mid !== id);
    delete anim.bumpHistoryById[id];
    delete anim.currentDirectionById[id];
    delete anim.originalDirectionById[id];
    delete anim.originalPositionsById[id];
    delete anim.pipeTransitById[id];
    delete anim.pipesCrossedById[id];

    this.rebuildCellMap();
    this.bombManager.updateActivation((bomb) => this.isBombCoveredForActivation(bomb));

    if (anim.memberIds.length === 0) {
      if (anim.stripIds.length > 0) {
        this.bundleManager.resetGroupStrips(anim.stripIds, this.bundles);
      }
      this.removeAnimation(anim);
      if (this.animations.length === 0) {
        this.resolveWinOrPlaying();
      }
    }
  }

  private trySwallowByBlackHoleForStep(
    _prevPositions: Vec2[],
    _newPositions: Vec2[],
    arrow: ArrowItem,
    anim: LaunchAnimation,
  ): boolean {
    const hole = this.findBlackHoleEntered(_prevPositions, _newPositions);
    if (hole) {
      this.swallowArrowInBlackHole(arrow, hole, anim);
      return true;
    }
    return this.consumeBlackHoleRegionSegments(arrow, anim);
  }

  getBlackHoleRegionSwallowProgressForRender(): ReadonlyMap<number, number> {
    return new Map();
  }

  private notifyBalloonArrowReturned(anim: LaunchAnimation): void {
    for (const effect of this.balloonEffects) {
      if (!effect.requireArrowReturn || effect.arrowReturnElapsed != null) {
        continue;
      }
      if (!anim.memberIds.includes(effect.hitArrowInstanceId)) continue;
      effect.arrowReturnElapsed = effect.elapsed;
    }
  }

  private tickBalloonEffects(dt: number): void {
    for (let i = this.balloonEffects.length - 1; i >= 0; i--) {
      const effect = this.balloonEffects[i]!;
      effect.elapsed += dt;
      if (isBalloonEffectComplete(effect)) {
        this.commitBalloonEffectAt(i);
      }
    }
  }

  private commitBalloonEffectAt(index: number): void {
    const effect = this.balloonEffects[index];
    if (!effect) return;
    this.balloonEffects.splice(index, 1);

    const removed = this.arrows.filter((a) =>
      effect.affectedArrowIds.has(a.instanceId),
    );
    if (removed.length > 0) {
      this.onArrowEliminationBatch(removed);
      this.recordClearedTraceCellsFromArrows(removed);
    }
    this.arrows = this.arrows.filter(
      (a) => !effect.affectedArrowIds.has(a.instanceId),
    );
    this.rebuildCellMap();
    if (this.checkWinCondition()) {
      this.phase = "won";
    }
  }

  getBalloonEffectsForRender(): {
    cell: Vec2;
    colorId: number;
    colorProgress: number;
    inflateProgress: number;
    popProgress: number;
  }[] {
    return this.balloonEffects.map((effect) => {
      const timing = computeBalloonEffectTiming(effect);
      return {
        cell: effect.cell,
        colorId: effect.colorId,
        ...timing,
      };
    });
  }

  /** @deprecated 使用 getBalloonEffectsForRender */
  getBalloonEffectForRender(): {
    cell: Vec2;
    colorId: number;
    colorProgress: number;
    inflateProgress: number;
    popProgress: number;
  } | null {
    const all = this.getBalloonEffectsForRender();
    return all[0] ?? null;
  }

  getBalloonArrowFxForRender(): ReadonlyMap<
    number,
    { inflate: number; pop: number }
  > {
    const map = new Map<number, { inflate: number; pop: number }>();
    for (const effect of this.balloonEffects) {
      const timing = computeBalloonEffectTiming(effect);
      if (timing.inflateProgress <= 0 && timing.popProgress <= 0) continue;
      for (const id of effect.affectedArrowIds) {
        map.set(id, {
          inflate: timing.inflateProgress,
          pop: timing.popProgress,
        });
      }
    }
    for (const effect of this.candyMachineEffects) {
      for (const shot of effect.shots) {
        const timing = computeCandyShotArrowTiming(shot, effect.elapsed);
        if (!timing || (timing.inflate <= 0 && timing.pop <= 0)) continue;
        const prev = map.get(shot.targetArrowId);
        if (!prev || timing.pop >= prev.pop) {
          map.set(shot.targetArrowId, timing);
        }
      }
    }
    return map;
  }

  private tickCandyMachineEffects(dt: number): void {
    for (let i = this.candyMachineEffects.length - 1; i >= 0; i--) {
      const effect = this.candyMachineEffects[i]!;
      effect.elapsed += dt;
      tickCandyMachineArrivals(effect);
      if (isCandyMachineEffectComplete(effect)) {
        this.commitCandyMachineEffectAt(i);
      }
    }
  }

  private commitCandyMachineEffectAt(index: number): void {
    const effect = this.candyMachineEffects[index];
    if (!effect) return;
    this.candyMachineEffects.splice(index, 1);

    const targetIds = new Set(effect.shots.map((s) => s.targetArrowId));
    const removed = this.arrows.filter((a) => targetIds.has(a.instanceId));
    if (removed.length > 0) {
      this.onArrowEliminationBatch(removed);
      this.recordClearedTraceCellsFromArrows(removed);
    }
    this.arrows = this.arrows.filter((a) => !targetIds.has(a.instanceId));
    this.rebuildCellMap();
    if (this.checkWinCondition()) {
      this.phase = "won";
    }
  }

  getCandyMachineEffectsForRender(): {
    machineCell: Vec2;
    elapsed: number;
    shots: {
      targetCell: Vec2;
      colorId: number;
      flightProgress: number;
      arrived: boolean;
    }[];
  }[] {
    return this.candyMachineEffects.map((effect) => ({
      machineCell: effect.machineCell,
      elapsed: effect.elapsed,
      shots: effect.shots.map((shot) => {
        const arrived = shot.arrivedAt != null;
        const flightProgress = candyShotFlightProgress(shot, effect.elapsed);
        return {
          targetCell: shot.targetCell,
          colorId: shot.colorId,
          flightProgress,
          arrived,
        };
      }),
    }));
  }

  private restoreBumpMemberLaunchState(anim: LaunchAnimation | null): void {
    if (!anim || anim.mode !== "bump") return;
    for (const id of anim.memberIds) {
      const origPos = anim.originalPositionsById[id];
      const origDir = anim.originalDirectionById[id];
      if (!origPos || !origDir) continue;
      const idx = this.arrows.findIndex((a) => a.instanceId === id);
      if (idx === -1) continue;
      const oldPos = clonePositions(this.arrows[idx]!.occupiedPositions);
      this.arrows[idx] = {
        ...this.arrows[idx]!,
        occupiedPositions: clonePositions(origPos),
        direction: origDir,
      };
      this.syncControllersIfHostMoved(id, oldPos, origPos);
    }
  }

  private finishAnimationOrPlaying(anim: LaunchAnimation): void {
    if (anim.stripIds.length) {
      this.bundleManager.resetGroupStrips(anim.stripIds, this.bundles);
    }
    this.restoreBumpMemberLaunchState(anim);
    this.removeAnimation(anim);
    if (this.animations.length === 0) {
      this.phase = "playing";
    }
    this.rebuildCellMap();
  }

  advanceOneAnimation(anim: LaunchAnimation): void {
    anim.stepCount += 1;
    if (anim.stepCount > this.maxAnimationSteps(anim)) {
      if (anim.mode === "exit" || anim.mode === "vanish") {
        this.completeLaunchAnimation(anim);
      } else {
        this.finishAnimationOrPlaying(anim);
      }
      return;
    }

    if (anim.mode === "vanish") return;

    if (anim.mode === "exit") {
      this.advanceExitAnimation(anim);
    } else {
      this.advanceBumpAnimation(anim);
    }
  }

  advanceAnimation(): boolean {
    if (this.phase === "animating" && this.animations.length === 0) {
      this.phase = "playing";
      this.rebuildCellMap();
      return true;
    }
    if (this.animations.length === 0) return true;
    if (this.phase !== "animating" && this.phase !== "playing") return true;

    for (const anim of [...this.animations]) {
      if (!this.animations.includes(anim)) continue;
      this.advanceOneAnimation(anim);
    }
    return false;
  }

  /** @deprecated 多箭并发请用各 anim 的 stepAccumMs；保留供单步测试 */
  getAnimStepIntervalMs(): number {
    const launchAnims = this.animations.filter((a) => a.mode !== "vanish");
    if (launchAnims.length === 0) {
      if (this.animations.some((a) => a.mode === "vanish")) {
        return computeAnimStepIntervalMs(0, "vanish", false);
      }
      return computeAnimStepIntervalMs(0, "exit", false);
    }
    return Math.min(
      ...launchAnims.map((anim) =>
        computeAnimStepIntervalMs(anim.flightStepCount, anim.mode, anim.reversing),
      ),
    );
  }

  private recordFlightStep(anim: LaunchAnimation): void {
    if (anim.mode === "exit" || (anim.mode === "bump" && !anim.reversing)) {
      anim.flightStepCount += 1;
    }
  }

  private tickFlightVisualFx(dt: number): void {
    for (let i = this.launchClickEffects.length - 1; i >= 0; i--) {
      const fx = this.launchClickEffects[i]!;
      fx.elapsed += dt;
      if (fx.elapsed >= LAUNCH_CLICK_FX_DURATION) {
        this.launchClickEffects.splice(i, 1);
      }
    }

    for (let i = this.dotPulseEffects.length - 1; i >= 0; i--) {
      const fx = this.dotPulseEffects[i]!;
      fx.elapsed += dt;
      if (fx.elapsed >= DOT_PULSE_FX_DURATION) {
        this.dotPulseEffects.splice(i, 1);
      }
    }
  }

  private recordVacatedCellsForPulse(prev: Vec2[], next: Vec2[]): void {
    const newKeys = new Set(next.map(vecKey));
    for (const pos of prev) {
      const key = vecKey(pos);
      if (newKeys.has(key)) continue;
      const existing = this.dotPulseEffects.find((fx) => vecKey(fx.cell) === key);
      if (existing) {
        existing.elapsed = 0;
      } else {
        this.dotPulseEffects.push({ cell: [pos[0], pos[1]], elapsed: 0 });
      }
    }
  }

  getLaunchClickEffectsForRender(): readonly LaunchClickFxState[] {
    return this.launchClickEffects;
  }

  getDotPulseEffectsForRender(): readonly DotPulseFxState[] {
    return this.dotPulseEffects;
  }

  private getAnimMembers(anim: LaunchAnimation): ArrowItem[] {
    return anim.memberIds
      .map((id) => this.arrows.find((a) => a.instanceId === id))
      .filter((a): a is ArrowItem => a != null);
  }

  private syncAnimationStrips(anim: LaunchAnimation, stepped: boolean): void {
    if (!stepped) return;
    const stripIds =
      anim.stripIds.length > 0
        ? anim.stripIds
        : this.bundleManager.getStripIdsForArrowIds(anim.memberIds, this.bundles);
    if (stripIds.length === 0) return;
    this.bundleManager.syncGroupStrips(stripIds, this.bundles, this.arrows, true);
  }

  private advanceExitAnimation(anim: LaunchAnimation): boolean {
    const members = this.getAnimMembers(anim);
    if (members.length === 0 || this.allMembersOffBoard(anim.memberIds)) {
      this.completeLaunchAnimation(anim);
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
        this.getBlockingArrowsForPathCheck(),
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
      const prev =
        members.find((m) => m.instanceId === arrow.instanceId)?.occupiedPositions ??
        arrow.occupiedPositions;
      const idx = this.arrows.findIndex((a) => a.instanceId === arrow.instanceId);
      if (idx === -1) continue;

      this.arrows[idx] = arrow;
      if (
        this.trySwallowByBlackHoleForStep(
          prev,
          arrow.occupiedPositions,
          arrow,
          anim,
        )
      ) {
        continue;
      }

      const current = this.arrows[idx]!;
      this.syncControllersIfHostMoved(
        arrow.instanceId,
        prev,
        current.occupiedPositions,
      );
      this.recordToggleCrossingForAnim(anim, prev, current.occupiedPositions);
      this.tryTriggerExplosiveBuffForStep(prev, current.occupiedPositions);
      this.tryTriggerBalloonForStep(prev, current.occupiedPositions, current, anim);
      this.tryTriggerCandyMachineForStep(prev, current.occupiedPositions);
      this.tryTriggerFlipButtonForStep(anim, prev, current.occupiedPositions);
      this.recordVacatedCellsForPulse(prev, current.occupiedPositions);
    }

    this.syncAnimationStrips(anim, stepped.length > 0);

    if (
      stepped.length > 0 &&
      (stepped.every((a) => arrowFullyOffBoard(a, this.level)) ||
        this.allMembersOffBoard(anim.memberIds))
    ) {
      this.recordFlightStep(anim);
      this.completeLaunchAnimation(anim);
      return true;
    }

    for (const arrow of stepped) {
      if (!anim.memberIds.includes(arrow.instanceId)) continue;
      const current = this.arrows.find((a) => a.instanceId === arrow.instanceId);
      if (current) this.cellMap.addArrow(current);
    }
    if (stepped.length > 0) this.recordFlightStep(anim);
    return false;
  }

  private advanceBumpAnimation(anim: LaunchAnimation): boolean {
    const memberSet = new Set(anim.memberIds);
    const members = this.getAnimMembers(anim);
    if (members.length === 0 || this.allMembersOffBoard(anim.memberIds)) {
      if (this.allMembersOffBoard(anim.memberIds)) {
        this.completeLaunchAnimation(anim);
      } else {
        this.finishAnimationOrPlaying(anim);
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
          const oldPos = clonePositions(this.arrows[idx]!.occupiedPositions);
          this.arrows[idx] = withPositions(arrow, target);
          this.syncControllersIfHostMoved(arrow.instanceId, oldPos, target);
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
        this.notifyBalloonArrowReturned(anim);
        this.commitPendingFlipButtons(anim);
        this.bundleManager.resetGroupStrips(anim.stripIds, this.bundles);
        this.restoreBumpMemberLaunchState(anim);
        this.finishAnimationOrPlaying(anim);
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
        this.getBlockingArrowsForPathCheck(),
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
      const member = members.find((m) => m.instanceId === arrow.instanceId);
      const prev = member?.occupiedPositions ?? arrow.occupiedPositions;
      const idx = this.arrows.findIndex((a) => a.instanceId === arrow.instanceId);
      if (idx === -1) continue;

      this.arrows[idx] = arrow;
      if (
        this.trySwallowByBlackHoleForStep(
          prev,
          arrow.occupiedPositions,
          arrow,
          anim,
        )
      ) {
        continue;
      }

      const current = this.arrows[idx]!;
      this.syncControllersIfHostMoved(
        arrow.instanceId,
        prev,
        current.occupiedPositions,
      );
      this.recordToggleCrossingForAnim(anim, prev, current.occupiedPositions);
      this.tryTriggerExplosiveBuffForStep(prev, current.occupiedPositions);
      this.tryTriggerBalloonForStep(prev, current.occupiedPositions, current, anim);
      this.tryTriggerCandyMachineForStep(prev, current.occupiedPositions);
      this.tryTriggerFlipButtonForStep(anim, prev, current.occupiedPositions);
      this.recordVacatedCellsForPulse(prev, current.occupiedPositions);
      this.cellMap.addArrow(current);
    }

    this.syncAnimationStrips(anim, stepped.length > 0);

    if (
      stepped.length > 0 &&
      (stepped.every((a) => arrowFullyOffBoard(a, this.level)) ||
        this.allMembersOffBoard(anim.memberIds))
    ) {
      this.recordFlightStep(anim);
      this.completeLaunchAnimation(anim);
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
          return this.isBundleHeadOnBlocker(arrow, memberSet, anim);
        }));
    if (blocked) {
      this.clearPipeAnimState(anim);
      anim.reversing = true;
    } else if (stepped.length > 0) {
      this.recordFlightStep(anim);
    }
    return false;
  }

  private isBundleHeadOnBlocker(
    arrow: ArrowItem,
    memberIds: Set<number>,
    anim: LaunchAnimation,
  ): boolean {
    const wallCells = this.getWallBlockerCells();
    const head = arrow.occupiedPositions.at(-1);
    if (!head) return false;
    const dir =
      anim.currentDirectionById[arrow.instanceId] ?? arrow.direction;
    if (wallCells.size > 0 && wouldStepIntoWall(head, dir, wallCells)) {
      return true;
    }
    const passThrough = new Set(memberIds);
    for (const id of this.getExitingMemberIds()) passThrough.add(id);
    if (this.cellMap.isBlockedExcept(head, passThrough)) return true;
    if (this.getCurtainCells().has(vecKey(head))) return true;
    if (isHeadBlockedByPipe(head, dir, this.getActivePipes())) return true;
    return getCornerAt(head, this.getActiveCorners()) != null;
  }

  private finishAnimation(): void {
    this.animations = [];
    this.syncPhaseAfterAnimations();
  }

  getTopLevelArrows(): ArrowItem[] {
    return this.arrows.filter((a) => a.zoneId == null);
  }

  getRevealedZoneArrows(): ArrowItem[] {
    return this.arrows.filter(
      (a) =>
        a.zoneId != null &&
        this.isZoneContentRevealed(a.zoneId),
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
        this.isZoneContentRevealed(c.zoneId),
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
        this.isZoneContentRevealed(b.zoneId),
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
        this.isZoneContentRevealed(p.zoneId),
    );
  }

  getLaunchableIds(): Set<number> {
    const ids = new Set<number>();
    const animating = this.getAnimatingMemberIds();
    const activeArrows = this.getActiveArrows().filter(
      (a) => !animating.has(a.instanceId),
    );
    const blockingArrows = this.getBlockingArrowsForPathCheck();
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
          this.level.blackHoleCells,
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
    if (!this.canAcceptLaunchClick()) return false;

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
    if (!this.isArrowZoneActive(arrow)) {
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
    this.animations.push({
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
      stepAccumMs: 0,
      pipeTransitById: Object.fromEntries(memberIds.map((id) => [id, null])),
      pipesCrossedById: Object.fromEntries(memberIds.map((id) => [id, []])),
      togglesCrossedIds: [],
      flipButtonsCrossedIds: [],
    });
    return true;
  }

  getVanishAnimProgress(anim?: LaunchAnimation): number {
    const target =
      anim ?? this.animations.find((a) => a.mode === "vanish") ?? null;
    if (!target || target.mode !== "vanish") return 0;
    return Math.min(1, target.stepCount / VANISH_ANIM_STEPS);
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
    const animating = this.getAnimatingMemberIds();
    const active = this.getActiveArrows();
    for (let i = active.length - 1; i >= 0; i--) {
      const arrow = active[i]!;
      if (animating.has(arrow.instanceId)) continue;
      for (const p of arrow.occupiedPositions) {
        if (p[0] === pos[0] && p[1] === pos[1]) return arrow;
      }
    }
    return null;
  }

  getDrawableTopLevelArrows(): ArrowItem[] {
    return this.maskArrowsForActiveEffect(
      this.getTopLevelArrows().filter((a) => !this.curtainManager.isArrowHidden(a)),
    );
  }

  getDrawableRevealedZoneArrows(): ArrowItem[] {
    return this.maskArrowsForActiveEffect(
      this.getRevealedZoneArrows().filter((a) => !this.curtainManager.isArrowHidden(a)),
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

  private recordClearedTraceCells(positions: Vec2[]): void {
    for (const pos of positions) {
      this.clearedTraceCells.add(vecKey(pos));
    }
  }

  private recordClearedTraceCellsFromArrows(arrows: ArrowItem[]): void {
    for (const arrow of arrows) {
      this.recordClearedTraceCells(arrow.occupiedPositions);
    }
  }

  getBoardOccupiedCellKeys(): Set<string> {
    return this.collectBoardOccupiedCellKeys();
  }

  /** @deprecated 使用 getBoardOccupiedCellKeys */
  getOccupiedArrowCellKeys(): Set<string> {
    return this.getBoardOccupiedCellKeys();
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
    return this.isZoneContentRevealed(zoneId);
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

  getDrawableShrinkPipes(): ShrinkPipeItem[] {
    return this.shrinkPipes.filter((s) => this.isMechanicDrawable(s.zoneId));
  }

  getDrawableToggles(): ToggleItem[] {
    return this.toggles.filter((t) => this.isMechanicDrawable(t.zoneId));
  }

  getDrawableControllers(): ControllerItem[] {
    syncControllersWithArrowHosts(this.controllers, this.arrows);
    syncControllersWithShrinkHosts(this.controllers, this.shrinkPipes);
    const vanishingHostIds = new Set<number>();
    for (const anim of this.animations) {
      if (anim.mode !== "vanish") continue;
      for (const id of anim.memberIds) {
        vanishingHostIds.add(id);
      }
    }
    return this.controllers.filter(
      (c) =>
        this.isMechanicDrawable(c.zoneId) &&
        !vanishingHostIds.has(c.bindInstanceId),
    );
  }

  getToggleFlashGroupIds(): Set<number> {
    return this.toggleManager.getFlashGroupIds();
  }

  getDrawableBuffs(): BuffItem[] {
    return this.buffs.filter((b) => this.isMechanicDrawable(b.zoneId));
  }

  /** 排队等待引爆的定向气球 id（用于 buff 层跳过绘制，改在炸弹层之上显示） */
  getPendingBalloonBuffIds(): ReadonlySet<number> {
    return new Set(this.pendingBalloonTriggers.map((p) => p.buffId));
  }

  /** 排队等待引爆的定向气球：保持原位白色显示，在炸弹特效层之上绘制 */
  getWaitingBalloonsForRender(): {
    cell: Vec2;
    colorId: number;
    colorProgress: number;
    inflateProgress: number;
    popProgress: number;
  }[] {
    const waiting: {
      cell: Vec2;
      colorId: number;
      colorProgress: number;
      inflateProgress: number;
      popProgress: number;
    }[] = [];
    for (const pending of this.pendingBalloonTriggers) {
      const buff = this.buffs.find((b) => b.instanceId === pending.buffId);
      if (!buff || buff.kind !== 20) continue;
      const cell = buff.occupiedPositions[0];
      if (!cell) continue;
      waiting.push({
        cell: [cell[0], cell[1]],
        colorId: 0,
        colorProgress: 0,
        inflateProgress: 0,
        popProgress: 0,
      });
    }
    return waiting;
  }

  getGoalProgress() {
    return this.goalTracker.getProgress();
  }

  getSpawnCountdownSec(): number {
    return this.spawnManager.spawnCountdownSec;
  }

  isSpawnPhase(): boolean {
    return this.spawnManager.spawnPhase;
  }

  getSpawnAlpha(instanceId: number): number {
    return this.spawnManager.getSpawnAlpha(instanceId);
  }

  getSpawnEmergence(instanceId: number) {
    return this.spawnManager.getSpawnEmergence(instanceId);
  }

  isRushLevel(): boolean {
    return this.isRushMode();
  }
}
