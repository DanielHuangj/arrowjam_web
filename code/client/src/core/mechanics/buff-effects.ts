import type { ArrowItem, Direction, Vec2 } from "../types.ts";
import { inBounds, vecKey } from "../types.ts";
import { splitIntoContiguousSegments } from "./arrow-split.ts";

export const AREA_BOMB_EFFECT_DURATION = 1.15;

/** 十字炸弹本体引信爆炸视觉时长 */
export const CROSS_BOMB_PRIMED_DURATION = 0.22;
/** 本体爆炸后至十字波第一环开始的间隔 */
export const CROSS_WAVE_START_DELAY = 0.08;
export const CROSS_WAVE_RING_INTERVAL = 0.11;
export const CROSS_CELL_BLAST_DURATION = 0.85;

export function crossBombWaveStartTime(ringIndex: number): number {
  if (ringIndex <= 0) return 0;
  return CROSS_WAVE_START_DELAY + (ringIndex - 1) * CROSS_WAVE_RING_INTERVAL;
}

export function crossBombEffectTotalDuration(ringCount: number): number {
  const waveRings = Math.max(0, ringCount - 1);
  const lastWaveStart =
    waveRings <= 0 ? 0 : crossBombWaveStartTime(waveRings);
  return (
    Math.max(CROSS_BOMB_PRIMED_DURATION, lastWaveStart) + CROSS_CELL_BLAST_DURATION
  );
}

export interface ArrowDebrisPiece {
  cell: Vec2;
  colorId: number;
  isHead: boolean;
  direction: Direction;
  flyAngle: number;
  flySpeed: number;
  spin: number;
  seed: number;
}

export interface AreaBombPendingCommit {
  hit: Map<number, Set<string>>;
}

export interface AreaBombEffectState {
  center: Vec2;
  bombRadius: 1 | 2;
  regionCells: Vec2[];
  debris: ArrowDebrisPiece[];
  elapsed: number;
  pendingCommit: AreaBombPendingCommit;
}

export interface CrossBombCellBlast {
  cell: Vec2;
  startElapsed: number;
  debris: ArrowDebrisPiece | null;
}

export interface CrossBombEffectState {
  center: Vec2;
  crossArm: 2 | 5;
  /** 按环序：0=中心，1..arm=四向各一格 */
  rings: Vec2[][];
  elapsed: number;
  activatedCellKeys: Set<string>;
  cellBlasts: CrossBombCellBlast[];
  /** 下一待触发环索引（0 在开始时立即触发） */
  nextRingIndex: number;
}

export const FIRE_BURST_DURATION = 0.34;
/** 火星爆炸结束后，首格引燃前的缓冲 */
export const FIRE_IGNITE_BASE = FIRE_BURST_DURATION * 0.72;
/** 沿箭身逐格蔓延间隔 */
export const FIRE_SPREAD_INTERVAL = 0.12;
export const FIRE_CELL_BURN_DURATION = 0.4;
/** 单格燃尽进度达到此值后隐藏该格箭身，改由碳化特效层绘制 */
export const FIRE_CELL_ARROW_HIDE_PROGRESS = 0.58;

export function fireCellBurnProgress(
  elapsed: number,
  igniteAt: number,
): number {
  if (elapsed < igniteAt) return 0;
  return Math.min(1, (elapsed - igniteAt) / FIRE_CELL_BURN_DURATION);
}

export function shouldHideArrowCellFromFire(
  elapsed: number,
  igniteAt: number,
): boolean {
  return fireCellBurnProgress(elapsed, igniteAt) >= FIRE_CELL_ARROW_HIDE_PROGRESS;
}

export function fireCellCharProgress(burnProgress: number): number {
  if (burnProgress <= FIRE_CELL_ARROW_HIDE_PROGRESS) return 0;
  return Math.min(
    1,
    (burnProgress - FIRE_CELL_ARROW_HIDE_PROGRESS) /
      (1 - FIRE_CELL_ARROW_HIDE_PROGRESS),
  );
}

export interface FireCellSchedule {
  cell: Vec2;
  arrowId: number | null;
  igniteAt: number;
}

export interface FireBombEffectState {
  center: Vec2;
  regionCells: Vec2[];
  elapsed: number;
  schedules: FireCellSchedule[];
  affectedArrowIds: Set<number>;
  /** 已完成整格燃烧周期（停止绘制火焰） */
  burntOutCellKeys: Set<string>;
}

export function isFireArrowFullyBurned(
  arrowId: number,
  schedules: FireCellSchedule[],
  elapsed: number,
): boolean {
  const cells = schedules.filter((s) => s.arrowId === arrowId);
  if (cells.length === 0) return false;
  return cells.every((s) => elapsed >= s.igniteAt + FIRE_CELL_BURN_DURATION);
}

export function isFireArrowAllIgnited(
  arrowId: number,
  schedules: FireCellSchedule[],
  elapsed: number,
): boolean {
  const cells = schedules.filter((s) => s.arrowId === arrowId);
  if (cells.length === 0) return false;
  return cells.every((s) => elapsed >= s.igniteAt);
}

export function fireBombEffectTotalDuration(schedules: FireCellSchedule[]): number {
  const lastIgnite = schedules.reduce((m, s) => Math.max(m, s.igniteAt), 0);
  return lastIgnite + FIRE_CELL_BURN_DURATION + 0.04;
}

export function buildFireSpreadSchedule(
  arrows: ArrowItem[],
  regionCells: Vec2[],
  center: Vec2,
  excludeArrowIds: ReadonlySet<number> = new Set(),
): { schedules: FireCellSchedule[]; affectedArrowIds: Set<number> } {
  const regionSet = new Set(regionCells.map(vecKey));
  const schedules: FireCellSchedule[] = [];
  const scheduled = new Set<string>();
  const affectedArrowIds = new Set<number>();

  const affectedArrows = arrows.filter(
    (a) =>
      !excludeArrowIds.has(a.instanceId) &&
      a.occupiedPositions.some((p) => regionSet.has(vecKey(p))),
  );
  for (const a of affectedArrows) affectedArrowIds.add(a.instanceId);

  for (const cell of regionCells) {
    const key = vecKey(cell);
    const onArrow = affectedArrows.some((a) =>
      a.occupiedPositions.some((p) => vecKey(p) === key),
    );
    if (!onArrow && !scheduled.has(key)) {
      const [bx, by] = cell;
      const ringDist = Math.abs(bx - center[0]) + Math.abs(by - center[1]);
      schedules.push({
        cell: [cell[0], cell[1]],
        arrowId: null,
        igniteAt: FIRE_IGNITE_BASE + ringDist * 0.035,
      });
      scheduled.add(key);
    }
  }

  for (const arrow of affectedArrows) {
    const pos = arrow.occupiedPositions;
    let entryIndex = -1;
    let entryDist = Infinity;
    for (let i = 0; i < pos.length; i++) {
      if (!regionSet.has(vecKey(pos[i]!))) continue;
      const p = pos[i]!;
      const d =
        Math.abs(p[0] - center[0]) + Math.abs(p[1] - center[1]);
      if (d < entryDist) {
        entryDist = d;
        entryIndex = i;
      }
    }
    if (entryIndex < 0) continue;

    const dist = new Map<number, number>();
    const queue: number[] = [entryIndex];
    dist.set(entryIndex, 0);
    let head = 0;
    while (head < queue.length) {
      const i = queue[head++]!;
      for (const ni of [i - 1, i + 1]) {
        if (ni < 0 || ni >= pos.length || dist.has(ni)) continue;
        dist.set(ni, dist.get(i)! + 1);
        queue.push(ni);
      }
    }
    for (const [i, d] of dist) {
      const cell = pos[i]!;
      const key = vecKey(cell);
      if (scheduled.has(key)) continue;
      schedules.push({
        cell: [cell[0], cell[1]],
        arrowId: arrow.instanceId,
        igniteAt: FIRE_IGNITE_BASE + d * FIRE_SPREAD_INTERVAL,
      });
      scheduled.add(key);
    }
  }

  schedules.sort((a, b) => a.igniteAt - b.igniteAt);
  return { schedules, affectedArrowIds };
}

export function crossCellsByRing(
  center: Vec2,
  arm: number,
  width: number,
  height: number,
): Vec2[][] {
  const [cx, cy] = center;
  const rings: Vec2[][] = [];
  for (let d = 0; d <= arm; d++) {
    let cells: Vec2[];
    if (d === 0) {
      cells = [[cx, cy]];
    } else {
      cells = [
        [cx, cy - d],
        [cx + d, cy],
        [cx, cy + d],
        [cx - d, cy],
      ];
    }
    const inBoard = cells.filter((c) => inBounds(c, width, height));
    if (inBoard.length > 0) rings.push(inBoard);
  }
  return rings;
}

export function collectHitForCellKeys(
  arrows: ArrowItem[],
  cellKeys: Set<string>,
): Map<number, Set<string>> {
  const hit = new Map<number, Set<string>>();
  for (const arrow of arrows) {
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
  return hit;
}

export function debrisForCellKeys(
  arrows: ArrowItem[],
  cellKeys: Set<string>,
  center: Vec2,
): ArrowDebrisPiece[] {
  return buildAreaBombDebris(arrows, collectHitForCellKeys(arrows, cellKeys), center);
}

function singleCellDebris(
  pieces: ArrowDebrisPiece[],
  cell: Vec2,
): ArrowDebrisPiece | null {
  const key = vecKey(cell);
  return pieces.find((p) => vecKey(p.cell) === key) ?? null;
}

export function buildCrossBombCellBlasts(
  cells: Vec2[],
  arrows: ArrowItem[],
  center: Vec2,
  startElapsed: number,
): CrossBombCellBlast[] {
  const keys = new Set(cells.map(vecKey));
  const debrisList = debrisForCellKeys(arrows, keys, center);
  return cells.map((cell) => ({
    cell,
    startElapsed,
    debris: singleCellDebris(debrisList, cell),
  }));
}

function debrisSeed(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function buildAreaBombDebris(
  arrows: ArrowItem[],
  hit: Map<number, Set<string>>,
  center: Vec2,
): ArrowDebrisPiece[] {
  const pieces: ArrowDebrisPiece[] = [];
  const [cx, cy] = center;
  for (const [arrowId, keys] of hit) {
    const arrow = arrows.find((a) => a.instanceId === arrowId);
    if (!arrow) continue;
    const head = arrow.occupiedPositions.at(-1);
    const headKey = head ? vecKey(head) : "";
    for (const key of keys) {
      const parts = key.split(",");
      const x = Number(parts[0]);
      const y = Number(parts[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const dx = x - cx;
      const dy = y - cy;
      const seed = debrisSeed(key);
      const r0 = (seed % 1000) / 1000;
      const r1 = ((seed * 7) % 1000) / 1000;
      const r2 = ((seed * 13) % 1000) / 1000;
      pieces.push({
        cell: [x, y],
        colorId: arrow.colorId,
        isHead: key === headKey,
        direction: arrow.direction,
        flyAngle: Math.atan2(dy, dx || 0.001) + (r0 - 0.5) * 0.65,
        flySpeed: 0.75 + r1 * 1.15 + Math.hypot(dx, dy) * 0.14,
        spin: (r2 - 0.5) * Math.PI * 3,
        seed: r0,
      });
    }
  }
  return pieces;
}

export function hitCellKeys(hit: Map<number, Set<string>>): Set<string> {
  const keys = new Set<string>();
  for (const set of hit.values()) {
    for (const k of set) keys.add(k);
  }
  return keys;
}

function directionFromPolylineTail(pos: Vec2[]): Direction {
  if (pos.length < 2) return 1;
  const a = pos[pos.length - 2]!;
  const b = pos[pos.length - 1]!;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 1) return 1;
  if (dx === 0 && dy === -1) return 2;
  if (dx === 1 && dy === 0) return 3;
  return 4;
}

/** 隐藏已炸格，剩余部分按连续段分别绘制（不重连）。 */
export function maskArrowsForDestroyedCells(
  arrows: ArrowItem[],
  hidden: Set<string>,
): ArrowItem[] {
  if (hidden.size === 0) return arrows;
  const out: ArrowItem[] = [];
  for (const arrow of arrows) {
    const pos = arrow.occupiedPositions.filter((p) => !hidden.has(vecKey(p)));
    if (pos.length < 2) continue;
    if (pos.length === arrow.occupiedPositions.length) {
      out.push(arrow);
      continue;
    }
    for (const segment of splitIntoContiguousSegments(pos)) {
      if (segment.length < 2) continue;
      out.push({
        ...arrow,
        occupiedPositions: segment.map(([x, y]) => [x, y] as Vec2),
        direction: directionFromPolylineTail(segment),
      });
    }
  }
  return out;
}

export const BALLOON_COLOR_DURATION = 0.32;
export const BALLOON_INFLATE_DURATION = 0.48;
export const BALLOON_POP_DURATION = 0.26;

export const CANDY_MACHINE_SHOT_COUNT = 8;
export const CANDY_FLIGHT_CELL_SEC = 0.048;
export const CANDY_FLIGHT_MIN_SEC = 0.24;
/** 相邻糖果发射的最小/最大间隔（秒） */
export const CANDY_LAUNCH_STAGGER_MIN_SEC = 0.05;
export const CANDY_LAUNCH_STAGGER_MAX_SEC = 0.11;
export const CANDY_MACHINE_CANDY_COLOR_IDS = [1, 2, 3, 4, 6, 7, 8] as const;

export const BLACK_HOLE_SPIN_DURATION = 0.52;
export const BLACK_HOLE_LIFETIME_SEC = 10;
export const BLACK_HOLE_VANISH_DURATION = 0.55;
/** 永久黑洞区域：箭身完全没入后的收尾渐隐（步进累积） */
export const BLACK_HOLE_REGION_SWALLOW_STEP = 0.06;

/** 区域/十字/燃烧弹连爆：被连锁触发的道具延迟此时间后再开始效果 */
export const CHAIN_TRIGGER_DELAY_SEC = 0.5;

/** 僵局自动刷新：魔法杖施法特效时长（秒），结束后才翻转箭头 */
export const AUTO_REFRESH_EFFECT_DURATION = 2;

export interface AutoRefreshEffectState {
  elapsed: number;
  pendingFlipIds: number[];
  seed: number;
}

export function autoRefreshEffectProgress(elapsed: number): number {
  return Math.min(1, elapsed / AUTO_REFRESH_EFFECT_DURATION);
}

export function isChainTriggerBuffKind(kind: number): boolean {
  return kind === 17 || kind === 18 || kind === 19;
}

export interface BlackHoleRenderFx {
  rotation: number;
  vanishProgress: number;
}

export interface BalloonEffectState {
  cell: Vec2;
  colorId: number;
  elapsed: number;
  affectedArrowIds: Set<number>;
  /** bump 撞击后需等箭回到原位再膨胀 */
  requireArrowReturn: boolean;
  arrowReturnElapsed: number | null;
  hitArrowInstanceId: number;
}

export interface BalloonEffectTiming {
  colorProgress: number;
  inflateProgress: number;
  popProgress: number;
}

export function computeBalloonEffectTiming(
  state: BalloonEffectState,
): BalloonEffectTiming {
  const colorProgress = Math.min(1, state.elapsed / BALLOON_COLOR_DURATION);
  const colorDone = state.elapsed >= BALLOON_COLOR_DURATION;
  const returnReady =
    !state.requireArrowReturn || state.arrowReturnElapsed != null;

  let inflateProgress = 0;
  let popProgress = 0;

  if (colorDone && returnReady) {
    const inflateStart = state.requireArrowReturn
      ? Math.max(
          BALLOON_COLOR_DURATION,
          state.arrowReturnElapsed ?? BALLOON_COLOR_DURATION,
        )
      : BALLOON_COLOR_DURATION;
    const inflateEnd = inflateStart + BALLOON_INFLATE_DURATION;
    if (state.elapsed >= inflateStart) {
      inflateProgress = Math.min(
        1,
        (state.elapsed - inflateStart) / BALLOON_INFLATE_DURATION,
      );
    }
    if (state.elapsed >= inflateEnd) {
      popProgress = Math.min(
        1,
        (state.elapsed - inflateEnd) / BALLOON_POP_DURATION,
      );
    }
  }

  return { colorProgress, inflateProgress, popProgress };
}

export function isBalloonEffectComplete(state: BalloonEffectState): boolean {
  return computeBalloonEffectTiming(state).popProgress >= 1;
}

export interface CandyShotState {
  targetCell: Vec2;
  targetArrowId: number;
  colorId: number;
  flightDuration: number;
  /** 本颗糖果开始发射的时刻（相对效果 elapsed） */
  launchAt: number;
  arrivedAt: number | null;
}

export interface CandyMachineEffectState {
  machineCell: Vec2;
  elapsed: number;
  shots: CandyShotState[];
}

export function candyFlightDuration(
  machineCell: Vec2,
  targetCell: Vec2,
): number {
  const dist =
    Math.abs(machineCell[0] - targetCell[0]) +
    Math.abs(machineCell[1] - targetCell[1]);
  return Math.max(CANDY_FLIGHT_MIN_SEC, dist * CANDY_FLIGHT_CELL_SEC);
}

export function assignCandyShotLaunchDelays(shots: CandyShotState[]): void {
  let nextLaunch = 0;
  for (const shot of shots) {
    shot.launchAt = nextLaunch;
    const gap =
      CANDY_LAUNCH_STAGGER_MIN_SEC +
      Math.random() * (CANDY_LAUNCH_STAGGER_MAX_SEC - CANDY_LAUNCH_STAGGER_MIN_SEC);
    nextLaunch += gap;
  }
}

export function candyShotFlightProgress(
  shot: CandyShotState,
  elapsed: number,
): number {
  if (elapsed < shot.launchAt) return 0;
  if (shot.arrivedAt != null) return 1;
  return Math.min(1, (elapsed - shot.launchAt) / shot.flightDuration);
}

export function tickCandyMachineArrivals(effect: CandyMachineEffectState): void {
  for (const shot of effect.shots) {
    if (shot.arrivedAt != null) continue;
    const flyElapsed = effect.elapsed - shot.launchAt;
    if (flyElapsed >= shot.flightDuration) {
      shot.arrivedAt = effect.elapsed;
    }
  }
}

export function computeCandyShotArrowTiming(
  shot: CandyShotState,
  elapsed: number,
): { inflate: number; pop: number } | null {
  if (shot.arrivedAt == null) return null;
  const t = elapsed - shot.arrivedAt;
  if (t < 0) return null;
  if (t < BALLOON_INFLATE_DURATION) {
    return { inflate: t / BALLOON_INFLATE_DURATION, pop: 0 };
  }
  const pop = Math.min(
    1,
    (t - BALLOON_INFLATE_DURATION) / BALLOON_POP_DURATION,
  );
  return { inflate: 1, pop };
}

export function isCandyMachineEffectComplete(
  effect: CandyMachineEffectState,
): boolean {
  if (effect.shots.length === 0) return effect.elapsed >= 0.05;
  for (const shot of effect.shots) {
    const timing = computeCandyShotArrowTiming(shot, effect.elapsed);
    if (!timing || timing.pop < 1) return false;
  }
  return true;
}
