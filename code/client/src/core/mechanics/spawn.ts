import {
  adjustSpawnPoolWeights,
  defaultSpawnWeightAdjustTiers,
} from "@arrowjaw/shared";
import type {
  ArrowItem,
  BuffItem,
  CornerItem,
  Direction,
  GameLevel,
  SpawnPoolEntry,
  Vec2,
} from "../types.ts";
import { DIR_VEC, inBounds, vecKey } from "../types.ts";
import {
  CELEBRATION_BUFF_KINDS,
  CELEBRATION_MAX_BUFFS,
} from "./win-celebration.ts";

export const SPAWN_FADE_MS = 400;

export interface SpawnEmergence {
  alpha: number;
  scale: number;
}

/** 生成浮现：ease-out 透明 + 轻微放大 */
export function computeSpawnEmergence(progress: number): SpawnEmergence {
  const t = Math.min(1, Math.max(0, progress));
  const ease = 1 - (1 - t) ** 2;
  return {
    alpha: ease,
    scale: 0.82 + 0.18 * ease,
  };
}

export const DIFFICULTY_FILL_RANGES: Record<number, [number, number]> = {
  1: [0.7, 0.8],
  2: [0.8, 0.9],
  3: [0.9, 1.0],
};

export interface SpawnBlockContext {
  width: number;
  height: number;
  occupied: Set<string>;
  curtainCells: Set<string>;
  spawnableZoneCells: Set<string> | null;
  blackHoleCells?: Set<string>;
  /** 棋盘上已有的箭头（用于 kind1 相对方向互锁检测） */
  existingArrows?: ArrowItem[];
}

export interface SpawnWaveResult {
  arrows: ArrowItem[];
  corners: CornerItem[];
  buffs: BuffItem[];
  instanceIds: number[];
}

export type Rng = () => number;

function defaultRng(): number {
  return Math.random();
}

function randomInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function randomUniform(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function adjustSpawnWeights(
  pool: SpawnPoolEntry[],
  cycleElimCells: number,
  adjustTiers = defaultSpawnWeightAdjustTiers(),
): SpawnPoolEntry[] {
  return adjustSpawnPoolWeights(pool, cycleElimCells, adjustTiers);
}

function weightedPick(pool: SpawnPoolEntry[], rng: Rng): SpawnPoolEntry {
  const total = pool.reduce((s, e) => s + e.weight, 0);
  let r = rng() * total;
  for (const e of pool) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return pool[pool.length - 1]!;
}

/** 生成池「通用色」(colorId 0) 可随机到的箭头颜色，与编辑器色板一致 */
export const SPAWN_ARROW_COLOR_IDS = [1, 2, 3, 4, 6, 7, 8] as const;

export function resolveSpawnColorId(
  entry: SpawnPoolEntry,
  _pool: SpawnPoolEntry[],
  rng: Rng,
): number {
  if (entry.colorId != null && entry.colorId !== 0) return entry.colorId;
  const ids = SPAWN_ARROW_COLOR_IDS;
  return ids[Math.floor(rng() * ids.length)]!;
}

function resolveColorId(entry: SpawnPoolEntry, pool: SpawnPoolEntry[], rng: Rng): number {
  return resolveSpawnColorId(entry, pool, rng);
}

function isSpawnableCell(ctx: SpawnBlockContext, cell: Vec2): boolean {
  const key = vecKey(cell);
  if (!inBounds(cell, ctx.width, ctx.height)) return false;
  if (ctx.occupied.has(key)) return false;
  if (ctx.curtainCells.has(key)) return false;
  if (ctx.spawnableZoneCells && !ctx.spawnableZoneCells.has(key)) return false;
  if (ctx.blackHoleCells?.has(key)) return false;
  return true;
}

function getEmptyCells(ctx: SpawnBlockContext): Vec2[] {
  const out: Vec2[] = [];
  for (let y = 0; y < ctx.height; y++) {
    for (let x = 0; x < ctx.width; x++) {
      const cell: Vec2 = [x, y];
      if (isSpawnableCell(ctx, cell)) out.push(cell);
    }
  }
  return out;
}

interface RunSegment {
  cells: Vec2[];
  direction: Direction;
}

function findRuns(ctx: SpawnBlockContext, minLen: number, _rng: Rng): RunSegment[] {
  const empty = getEmptyCells(ctx);
  const emptySet = new Set(empty.map(vecKey));
  const seen = new Set<string>();
  const runs: RunSegment[] = [];

  for (const start of empty) {
    const sk = vecKey(start);
    if (seen.has(sk)) continue;
    for (const dir of [1, 2, 3, 4] as Direction[]) {
      const vec = DIR_VEC[dir];
      const cells: Vec2[] = [start];
      let cur: Vec2 = start;
      while (true) {
        const next: Vec2 = [cur[0] + vec[0], cur[1] + vec[1]];
        if (!emptySet.has(vecKey(next))) break;
        cells.push(next);
        cur = next;
      }
      if (cells.length < minLen) continue;
      const key = cells.map(vecKey).join("|");
      if (seen.has(key)) continue;
      for (const c of cells) seen.add(vecKey(c));
      runs.push({ cells, direction: dir });
    }
  }
  if (runs.length === 0) return [];
  return runs;
}

function pickRandomRun(ctx: SpawnBlockContext, minLen: number, rng: Rng): RunSegment | null {
  const runs = findRuns(ctx, minLen, rng).filter((r) => r.cells.length >= minLen);
  if (runs.length === 0) return null;
  return runs[Math.floor(rng() * runs.length)]!;
}

function pickRandomCell(ctx: SpawnBlockContext, rng: Rng): Vec2 | null {
  const empty = getEmptyCells(ctx);
  if (empty.length === 0) return null;
  return empty[Math.floor(rng() * empty.length)]!;
}

const ORTH_DIRS: Vec2[] = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
];

function isOrthogonallyConnected(path: Vec2[]): boolean {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) !== 1) return false;
  }
  return path.length > 0;
}

/** 在空格上随机游走生成 2–6 格折线箭路径（仅使用当前空格，不拼接旧箭占格）。 */
export function pickRandomPolyline(
  ctx: SpawnBlockContext,
  minLen: number,
  maxLen: number,
  rng: Rng,
): Vec2[] | null {
  const targetLen = randomInt(rng, minLen, Math.min(maxLen, 6));
  for (let attempt = 0; attempt < 48; attempt++) {
    const start = pickRandomCell(ctx, rng);
    if (!start) return null;
    const path: Vec2[] = [start];
    const used = new Set([vecKey(start)]);

    while (path.length < targetLen) {
      const cur = path[path.length - 1]!;
      const neighbors: Vec2[] = [];
      for (const [dx, dy] of ORTH_DIRS) {
        const next: Vec2 = [cur[0] + dx, cur[1] + dy];
        if (isSpawnableCell(ctx, next) && !used.has(vecKey(next))) {
          neighbors.push(next);
        }
      }
      if (neighbors.length === 0) break;

      let next: Vec2;
      if (path.length >= 2) {
        const prev = path[path.length - 2]!;
        const dx = cur[0] - prev[0];
        const dy = cur[1] - prev[1];
        const straight = neighbors.find((c) => c[0] - cur[0] === dx && c[1] - cur[1] === dy);
        const turns = neighbors.filter((c) => c[0] - cur[0] !== dx || c[1] - cur[1] !== dy);
        if (rng() < 0.45 && turns.length > 0) {
          next = turns[Math.floor(rng() * turns.length)]!;
        } else if (straight) {
          next = straight;
        } else {
          next = neighbors[Math.floor(rng() * neighbors.length)]!;
        }
      } else {
        next = neighbors[Math.floor(rng() * neighbors.length)]!;
      }

      path.push(next);
      used.add(vecKey(next));
    }

    if (path.length >= minLen && isOrthogonallyConnected(path)) {
      return path;
    }
  }
  return null;
}

function directionFromRun(cells: Vec2[]): Direction {
  if (cells.length < 2) return 1;
  const a = cells[cells.length - 2]!;
  const b = cells[cells.length - 1]!;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 1) return 1;
  if (dx === 0 && dy === -1) return 2;
  if (dx === 1 && dy === 0) return 3;
  return 4;
}

/** 翻转后头部朝向：折线反转后的末段方向（首段反向）。 */
export function flipArrowDirection2(cells: Vec2[]): Direction {
  return directionFromRun([...cells].reverse());
}

export function oppositeDirection(d: Direction): Direction {
  if (d === 1) return 2;
  if (d === 2) return 1;
  if (d === 3) return 4;
  return 3;
}

function headRayHitsArrow(
  head: Vec2,
  dir: Direction,
  target: ArrowItem,
  width: number,
  height: number,
): boolean {
  const [dx, dy] = DIR_VEC[dir]!;
  let x = head[0] + dx;
  let y = head[1] + dy;
  while (inBounds([x, y], width, height)) {
    if (target.occupiedPositions.some((p) => p[0] === x && p[1] === y)) {
      return true;
    }
    x += dx;
    y += dy;
  }
  return false;
}

/** 两箭同线对头、方向相反且互相阻挡时视为互锁。 */
export function areArrowsFacingOpposite(
  a: ArrowItem,
  b: ArrowItem,
  width: number,
  height: number,
): boolean {
  if (a.direction !== oppositeDirection(b.direction)) return false;
  const headA = a.occupiedPositions.at(-1);
  const headB = b.occupiedPositions.at(-1);
  if (!headA || !headB) return false;
  return (
    headRayHitsArrow(headA, a.direction, b, width, height) &&
    headRayHitsArrow(headB, b.direction, a, width, height)
  );
}

function wouldKind1OppositeLock(
  candidate: ArrowItem,
  existingKind1: ArrowItem[],
  width: number,
  height: number,
): boolean {
  return existingKind1.some((e) =>
    areArrowsFacingOpposite(candidate, e, width, height),
  );
}

function randomReflectDirs(rng: Rng): { d1: Vec2; d2: Vec2 } {
  const faces: [Vec2, Vec2][] = [
    [[0, 1], [1, 0]],
    [[0, -1], [1, 0]],
    [[0, 1], [-1, 0]],
    [[0, -1], [-1, 0]],
  ];
  const pick = faces[Math.floor(rng() * faces.length)]!;
  return { d1: pick[0], d2: pick[1] };
}

function baseSpawnPool(pool: SpawnPoolEntry[]): SpawnPoolEntry[] {
  return pool.map((e) => ({ ...e }));
}

/** 本轮单次抽取使用的生成池；首个增益道具落地后恢复关卡原配置。 */
export function spawnPoolForPick(
  basePool: SpawnPoolEntry[],
  cycleElimCells: number,
  buffSpawnedInWave: boolean,
  adjustTiers = defaultSpawnWeightAdjustTiers(),
): SpawnPoolEntry[] {
  if (buffSpawnedInWave) return basePool;
  return adjustSpawnWeights(basePool, cycleElimCells, adjustTiers);
}

export function runSpawnWave(
  level: GameLevel,
  ctx: SpawnBlockContext,
  cycleElimCells: number,
  nextInstanceId: () => number,
  rng: Rng = defaultRng,
): SpawnWaveResult {
  const basePool = baseSpawnPool(level.spawnPool ?? []);
  const adjustTiers = level.spawnWeightAdjust ?? defaultSpawnWeightAdjustTiers();
  let activePool = spawnPoolForPick(basePool, cycleElimCells, false, adjustTiers);
  let buffSpawnedInWave = false;
  const fillRange = DIFFICULTY_FILL_RANGES[level.difficulty] ?? DIFFICULTY_FILL_RANGES[1]!;
  const emptyCount = getEmptyCells(ctx).length;
  const targetFillCells = Math.floor(
    emptyCount * randomUniform(rng, fillRange[0], fillRange[1]),
  );

  const result: SpawnWaveResult = {
    arrows: [],
    corners: [],
    buffs: [],
    instanceIds: [],
  };

  const workCtx: SpawnBlockContext = {
    ...ctx,
    occupied: new Set(ctx.occupied),
  };

  let filledCells = 0;
  let failStreak = 0;
  let attempts = 0;

  while (attempts < 200) {
    attempts++;
    const empty = getEmptyCells(workCtx);
    if (empty.length === 0) break;

    const runs = findRuns(workCtx, 2, rng);
    const allSingle =
      empty.length > 0 &&
      runs.length === 0;
    if (empty.length < 5 && failStreak >= 3) break;
    if (allSingle && failStreak >= 3) break;
    if (filledCells >= targetFillCells && failStreak >= 1) break;

    const entry = weightedPick(activePool, rng);
    let placed = false;

    if (entry.kind === 1 || entry.kind === 2) {
      let positions = pickRandomPolyline(workCtx, 2, 6, rng);
      if (!positions) {
        const run = pickRandomRun(workCtx, 2, rng);
        if (!run) {
          failStreak++;
          continue;
        }
        const len =
          run.cells.length >= 6
            ? randomInt(rng, 2, 6)
            : Math.min(run.cells.length, Math.max(2, run.cells.length));
        positions = run.cells.slice(0, len);
      }
      if (!positions || positions.length < 2 || !isOrthogonallyConnected(positions)) {
        failStreak++;
        continue;
      }
      const direction = directionFromRun(positions);
      const colorId = resolveColorId(entry, activePool, rng);
      const id = nextInstanceId();
      if (entry.kind === 2) {
        const arrow: ArrowItem = {
          kind: 2,
          instanceId: id,
          layer: 2,
          occupiedPositions: positions.map(([x, y]) => [x, y]),
          direction,
          direction1: direction,
          direction2: flipArrowDirection2(positions),
          colorId,
          zoneId: null,
        };
        result.arrows.push(arrow);
        result.instanceIds.push(id);
      } else {
        const arrow: ArrowItem = {
          kind: 1,
          instanceId: id,
          layer: 2,
          occupiedPositions: positions.map(([x, y]) => [x, y]),
          direction,
          colorId,
          zoneId: null,
        };
        const existingKind1 = [
          ...(ctx.existingArrows ?? []).filter((a) => a.kind === 1),
          ...result.arrows.filter((a) => a.kind === 1),
        ];
        if (
          wouldKind1OppositeLock(
            arrow,
            existingKind1,
            workCtx.width,
            workCtx.height,
          )
        ) {
          failStreak++;
          continue;
        }
        result.arrows.push(arrow);
        result.instanceIds.push(id);
      }
      for (const p of positions) workCtx.occupied.add(vecKey(p));
      filledCells += positions.length;
      placed = true;
    } else if (entry.kind === 4) {
      const cell = pickRandomCell(workCtx, rng);
      if (!cell) {
        failStreak++;
        continue;
      }
      const { d1, d2 } = randomReflectDirs(rng);
      const id = nextInstanceId();
      const corner: CornerItem = {
        kind: 4,
        instanceId: id,
        layer: 2,
        occupiedPositions: [cell],
        direction1: d1,
        direction2: d2,
        zoneId: null,
      };
      result.corners.push(corner);
      result.instanceIds.push(id);
      workCtx.occupied.add(vecKey(cell));
      filledCells += 1;
      placed = true;
    } else {
      const cell = pickRandomCell(workCtx, rng);
      if (!cell) {
        failStreak++;
        continue;
      }
      const id = nextInstanceId();
      let buff: BuffItem;
      if (entry.kind === 17) {
        buff = {
          kind: 17,
          instanceId: id,
          layer: 2,
          occupiedPositions: [cell],
          bombRadius: entry.bombRadius === 2 ? 2 : 1,
          zoneId: null,
        };
      } else if (entry.kind === 18) {
        buff = {
          kind: 18,
          instanceId: id,
          layer: 2,
          occupiedPositions: [cell],
          crossArm: entry.crossArm === 5 ? 5 : 2,
          zoneId: null,
        };
      } else if (entry.kind === 19) {
        buff = {
          kind: 19,
          instanceId: id,
          layer: 2,
          occupiedPositions: [cell],
          zoneId: null,
        };
      } else if (entry.kind === 21) {
        buff = {
          kind: 21,
          instanceId: id,
          layer: 2,
          occupiedPositions: [cell],
          zoneId: null,
        };
      } else if (entry.kind === 22) {
        buff = {
          kind: 22,
          instanceId: id,
          layer: 2,
          occupiedPositions: [cell],
          zoneId: null,
        };
      } else if (entry.kind === 23) {
        buff = {
          kind: 23,
          instanceId: id,
          layer: 2,
          occupiedPositions: [cell],
          zoneId: null,
        };
      } else {
        buff = {
          kind: 20,
          instanceId: id,
          layer: 2,
          occupiedPositions: [cell],
          zoneId: null,
        };
      }
      result.buffs.push(buff);
      result.instanceIds.push(id);
      workCtx.occupied.add(vecKey(cell));
      filledCells += 1;
      placed = true;
      if (!buffSpawnedInWave) {
        buffSpawnedInWave = true;
        activePool = basePool;
      }
    }

    if (placed) failStreak = 0;
    else failStreak++;
  }

  return result;
}

/** 通关庆祝：在空格上生成最多 N 个 17/18/23 道具 */
export function spawnCelebrationBuffs(
  ctx: SpawnBlockContext,
  nextInstanceId: () => number,
  maxCount: number = CELEBRATION_MAX_BUFFS,
  rng: Rng = Math.random,
): BuffItem[] {
  const result: BuffItem[] = [];
  const workOccupied = new Set(ctx.occupied);
  const workCtx: SpawnBlockContext = { ...ctx, occupied: workOccupied };
  const n = Math.max(0, Math.min(maxCount, CELEBRATION_MAX_BUFFS));
  for (let i = 0; i < n; i++) {
    const cell = pickRandomCell(workCtx, rng);
    if (!cell) break;
    workOccupied.add(vecKey(cell));
    const kind =
      CELEBRATION_BUFF_KINDS[Math.floor(rng() * CELEBRATION_BUFF_KINDS.length)]!;
    const id = nextInstanceId();
    if (kind === 17) {
      result.push({
        kind: 17,
        instanceId: id,
        layer: 2,
        occupiedPositions: [cell],
        bombRadius: 1,
        zoneId: null,
      });
    } else if (kind === 18) {
      result.push({
        kind: 18,
        instanceId: id,
        layer: 2,
        occupiedPositions: [cell],
        crossArm: 2,
        zoneId: null,
      });
    } else {
      result.push({
        kind: 23,
        instanceId: id,
        layer: 2,
        occupiedPositions: [cell],
        zoneId: null,
      });
    }
  }
  return result;
}

/** 从生成池增益条目中均分抽取，并投放到随机空格（combo 奖励） */
export function trySpawnComboRewardBuff(
  pool: readonly SpawnPoolEntry[] | undefined,
  ctx: SpawnBlockContext,
  nextInstanceId: () => number,
  rng: Rng = Math.random,
): BuffItem | null {
  const buffEntries = (pool ?? []).filter((e) => e.kind >= 17);
  if (buffEntries.length === 0) return null;
  const cell = pickRandomCell(ctx, rng);
  if (!cell) return null;
  const entry = buffEntries[Math.floor(rng() * buffEntries.length)]!;
  const id = nextInstanceId();
  if (entry.kind === 17) {
    return {
      kind: 17,
      instanceId: id,
      layer: 2,
      occupiedPositions: [cell],
      bombRadius: entry.bombRadius === 2 ? 2 : 1,
      zoneId: null,
    };
  }
  if (entry.kind === 18) {
    return {
      kind: 18,
      instanceId: id,
      layer: 2,
      occupiedPositions: [cell],
      crossArm: entry.crossArm === 5 ? 5 : 2,
      zoneId: null,
    };
  }
  if (entry.kind === 19) {
    return {
      kind: 19,
      instanceId: id,
      layer: 2,
      occupiedPositions: [cell],
      zoneId: null,
    };
  }
  if (entry.kind === 21) {
    return {
      kind: 21,
      instanceId: id,
      layer: 2,
      occupiedPositions: [cell],
      zoneId: null,
    };
  }
  if (entry.kind === 22) {
    return {
      kind: 22,
      instanceId: id,
      layer: 2,
      occupiedPositions: [cell],
      zoneId: null,
    };
  }
  if (entry.kind === 23) {
    return {
      kind: 23,
      instanceId: id,
      layer: 2,
      occupiedPositions: [cell],
      zoneId: null,
    };
  }
  return {
    kind: 20,
    instanceId: id,
    layer: 2,
    occupiedPositions: [cell],
    zoneId: null,
  };
}

export class SpawnManager {
  spawnCountdownSec: number;
  cycleElimCells = 0;
  spawnPhase = false;
  /** 倒计时已到 0 但因阻塞未刷新，待解除阻塞后立即执行 */
  spawnDuePending = false;
  spawnFadeProgress = 1;
  pendingSpawnInstanceIds: number[] = [];
  private fadeElapsedMs = 0;

  constructor(
    private readonly intervalSec: number,
    private readonly enabled: boolean,
  ) {
    this.spawnCountdownSec = intervalSec;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  onEliminationCells(cellCount: number): void {
    if (!this.enabled) return;
    this.cycleElimCells += cellCount;
  }

  canTickCountdown(hasBlockingAnimation: boolean): boolean {
    return this.enabled && !this.spawnPhase && !hasBlockingAnimation;
  }

  /** 倒计时已到期、等待执行刷盘 */
  isSpawnDue(): boolean {
    return this.enabled && (this.spawnDuePending || this.spawnCountdownSec <= 0);
  }

  tickCountdown(deltaSec: number, hasBlockingAnimation: boolean): boolean {
    if (!this.enabled || this.spawnPhase) return false;
    if (hasBlockingAnimation) {
      if (this.spawnCountdownSec <= 0) {
        this.spawnCountdownSec = 0;
        this.spawnDuePending = true;
      }
      // 已到期时即便动画阻塞也报告 due，由调用方在合适时机刷盘
      return this.spawnDuePending;
    }
    this.spawnCountdownSec -= deltaSec;
    if (this.spawnCountdownSec <= 0) {
      this.spawnCountdownSec = 0;
      this.spawnDuePending = true;
    }
    return this.spawnDuePending;
  }

  resetCountdown(): void {
    this.spawnCountdownSec = this.intervalSec;
    this.cycleElimCells = 0;
    this.spawnDuePending = false;
  }

  beginSpawnPhase(instanceIds: number[]): void {
    this.spawnPhase = true;
    this.spawnFadeProgress = 0;
    this.fadeElapsedMs = 0;
    this.pendingSpawnInstanceIds = instanceIds;
  }

  tickSpawnFade(deltaMs: number): boolean {
    if (!this.spawnPhase) return false;
    this.fadeElapsedMs += deltaMs;
    this.spawnFadeProgress = Math.min(1, this.fadeElapsedMs / SPAWN_FADE_MS);
    if (this.spawnFadeProgress >= 1) {
      this.spawnPhase = false;
      this.pendingSpawnInstanceIds = [];
      return true;
    }
    return false;
  }

  getSpawnEmergence(instanceId: number): SpawnEmergence | null {
    if (!this.pendingSpawnInstanceIds.includes(instanceId)) return null;
    return computeSpawnEmergence(this.spawnFadeProgress);
  }

  getSpawnAlpha(instanceId: number): number {
    return this.getSpawnEmergence(instanceId)?.alpha ?? 1;
  }
}
