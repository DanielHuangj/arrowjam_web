import type {
  ArrowItem,
  BoardSize,
  CornerItem,
  Direction,
  PipeItem,
  PipeTransitState,
  Vec2,
} from "../types.ts";
import { DIR_VEC, inBounds, vecKey } from "../types.ts";
import { snakeStepArrow } from "../board/cell-map.ts";
import {
  getCornerAt,
  getReflectedDirection,
  isValidCornerEntry,
} from "./corner.ts";
import { wouldStepIntoWall } from "./moving-wall.ts";

export interface PipePass {
  position: Vec2;
  directions: Vec2[];
}

export function isDirAllowedAtPass(dir: Direction, pass: PipePass): boolean {
  const [dx, dy] = DIR_VEC[dir];
  return pass.directions.some(([vx, vy]) => vx === dx && vy === dy);
}

export function getPipeBodyKeys(pipe: PipeItem): Set<string> {
  return new Set(pipe.occupiedPositions.map((p) => vecKey(p)));
}

function segmentDirsAt(positions: Vec2[], index: number): Vec2[] {
  const dirs: Vec2[] = [];
  const add = (from: Vec2, to: Vec2): void => {
    const dx = Math.sign(to[0] - from[0]);
    const dy = Math.sign(to[1] - from[1]);
    if (dx !== 0 || dy !== 0) dirs.push([dx, dy]);
  };
  if (index > 0) add(positions[index - 1]!, positions[index]!);
  if (index < positions.length - 1) add(positions[index], positions[index + 1]!);
  return dirs;
}

/** 管道身段两侧相邻格（不含管身本身） */
export function getPipeSideKeys(pipe: PipeItem): Set<string> {
  const body = getPipeBodyKeys(pipe);
  const sides = new Set<string>();
  for (let i = 0; i < pipe.occupiedPositions.length; i++) {
    const cell = pipe.occupiedPositions[i]!;
    for (const [dx, dy] of segmentDirsAt(pipe.occupiedPositions, i)) {
      for (const [px, py] of [
        [-dy, dx],
        [dy, -dx],
      ] as Vec2[]) {
        const neighbor: Vec2 = [cell[0] + px, cell[1] + py];
        const key = vecKey(neighbor);
        if (!body.has(key)) sides.add(key);
      }
    }
  }
  return sides;
}

export function findPassIndex(pipe: PipeItem, pos: Vec2): number {
  return pipe.passes.findIndex(
    (p) => p.position[0] === pos[0] && p.position[1] === pos[1],
  );
}

export function findPipeAtPass(
  pos: Vec2,
  pipes: PipeItem[],
): { pipe: PipeItem; passIndex: number } | null {
  for (const pipe of pipes) {
    if (pipe.health <= 0) continue;
    const idx = findPassIndex(pipe, pos);
    if (idx !== -1) return { pipe, passIndex: idx };
  }
  return null;
}

/** 从入口端点沿 occupiedPositions 走到出口端点的格子序列 */
export function getPipeTraversalPath(
  pipe: PipeItem,
  entryPassIndex: number,
): Vec2[] {
  const positions = pipe.occupiedPositions;
  const entryPos = pipe.passes[entryPassIndex]!.position;
  const exitPos = pipe.passes[entryPassIndex === 0 ? 1 : 0]!.position;
  const startIdx = positions.findIndex(
    (p) => p[0] === entryPos[0] && p[1] === entryPos[1],
  );
  const endIdx = positions.findIndex(
    (p) => p[0] === exitPos[0] && p[1] === exitPos[1],
  );
  if (startIdx === -1 || endIdx === -1) {
    return [
      [entryPos[0], entryPos[1]],
      [exitPos[0], exitPos[1]],
    ];
  }
  if (startIdx <= endIdx) {
    return positions
      .slice(startIdx, endIdx + 1)
      .map(([x, y]) => [x, y] as Vec2);
  }
  return positions
    .slice(endIdx, startIdx + 1)
    .reverse()
    .map(([x, y]) => [x, y] as Vec2);
}

export function tryStartPipeTransit(
  head: Vec2,
  dir: Direction,
  pipes: PipeItem[],
): PipeTransitState | null {
  const hit = findPipeAtPass(head, pipes);
  if (!hit) return null;
  const { pipe, passIndex } = hit;
  // 仅校验当前入口端方向；L 形管两端朝向可不同（如 L48 竖入横出）
  if (!isDirAllowedAtPass(dir, pipe.passes[passIndex]!)) {
    return null;
  }
  return {
    pipeId: pipe.instanceId,
    path: getPipeTraversalPath(pipe, passIndex),
    pathIndex: 0,
  };
}

function vecToDir(dx: number, dy: number): Direction | null {
  for (const d of [1, 2, 3, 4] as Direction[]) {
    const [vx, vy] = DIR_VEC[d];
    if (vx === dx && vy === dy) return d;
  }
  return null;
}

function snakeStepAlongPath(positions: Vec2[], nextHead: Vec2): Vec2[] {
  if (positions.length === 0) return [[nextHead[0], nextHead[1]]];
  const next = positions.slice(1).map(([x, y]) => [x, y] as Vec2);
  next.push([nextHead[0], nextHead[1]]);
  return next;
}

/**
 * 头部下一步是否被管道阻挡。
 * 侧面格仅阻挡「朝管身方向」的移动；管道内穿行时不调用。
 */
export function isHeadBlockedByPipe(
  head: Vec2,
  dir: Direction,
  pipes: PipeItem[],
): boolean {
  const key = vecKey(head);
  const toward: Vec2 = [
    head[0] + DIR_VEC[dir][0],
    head[1] + DIR_VEC[dir][1],
  ];
  const towardKey = vecKey(toward);

  for (const pipe of pipes) {
    if (pipe.health <= 0) continue;
    const body = getPipeBodyKeys(pipe);
    const sides = getPipeSideKeys(pipe);

    if (sides.has(key)) {
      if (body.has(towardKey)) return true;
      continue;
    }

    if (!body.has(key)) continue;

    const passIdx = findPassIndex(pipe, head);
    if (passIdx === -1) return true;
    if (isDirAllowedAtPass(dir, pipe.passes[passIdx]!)) {
      continue;
    }
    return true;
  }
  return false;
}

export interface ArrowStepResult {
  arrow: ArrowItem;
  dir: Direction;
  transit: PipeTransitState | null;
  blocked: boolean;
  /** 刚穿出管道出口时返回管道 id */
  pipeExitedId: number | null;
  /** 刚在反射角上发生折射时返回角块 id */
  cornerReflectedId: number | null;
}

/** 单步移动：管道内沿路径蛇行，或普通格移动并在入口进入管道 */
export function advanceArrowStep(
  arrow: ArrowItem,
  dir: Direction,
  transit: PipeTransitState | null,
  corners: CornerItem[],
  pipes: PipeItem[],
  curtainCells: Set<string> = new Set(),
  extraBlockerCells: Set<string> = new Set(),
): ArrowStepResult {
  if (transit && transit.pathIndex < transit.path.length - 1) {
    const nextIdx = transit.pathIndex + 1;
    const from = transit.path[transit.pathIndex]!;
    const to = transit.path[nextIdx]!;
    const stepDir =
      vecToDir(to[0] - from[0], to[1] - from[1]) ?? dir;
    const newPos = snakeStepAlongPath(arrow.occupiedPositions, to);
    const atExit = nextIdx === transit.path.length - 1;
    return {
      arrow: {
        ...arrow,
        occupiedPositions: newPos,
        direction: stepDir,
      },
      dir: stepDir,
      transit: atExit ? null : { ...transit, pathIndex: nextIdx },
      blocked: false,
      pipeExitedId: atExit ? transit.pipeId : null,
      cornerReflectedId: null,
    };
  }

  let newDir = dir;
  const head = arrow.occupiedPositions.at(-1)!;

  if (extraBlockerCells.size > 0 && wouldStepIntoWall(head, dir, extraBlockerCells)) {
    return {
      arrow,
      dir: newDir,
      transit: null,
      blocked: true,
      pipeExitedId: null,
      cornerReflectedId: null,
    };
  }

  const next = snakeStepArrow(arrow, dir);
  const nextHead = next.occupiedPositions.at(-1)!;

  if (curtainCells.has(vecKey(nextHead))) {
    return {
      arrow: next,
      dir: newDir,
      transit: null,
      blocked: true,
      pipeExitedId: null,
      cornerReflectedId: null,
    };
  }

  const corner = getCornerAt(nextHead, corners);
  let cornerReflectedId: number | null = null;
  if (corner && isValidCornerEntry(newDir, corner)) {
    newDir = getReflectedDirection(newDir, corner);
    next.direction = newDir;
    cornerReflectedId = corner.instanceId;
  }

  if (isHeadBlockedByPipe(nextHead, newDir, pipes)) {
    return {
      arrow: next,
      dir: newDir,
      transit: null,
      blocked: true,
      pipeExitedId: null,
      cornerReflectedId: null,
    };
  }

  const newTransit = tryStartPipeTransit(nextHead, newDir, pipes);
  return {
    arrow: next,
    dir: newDir,
    transit: newTransit,
    blocked: false,
    pipeExitedId: null,
    cornerReflectedId,
  };
}

function isCellOnOtherArrow(
  pos: Vec2,
  selfId: number,
  arrows: ArrowItem[],
): boolean {
  for (const other of arrows) {
    if (other.instanceId === selfId) continue;
    for (const p of other.occupiedPositions) {
      if (p[0] === pos[0] && p[1] === pos[1]) return true;
    }
  }
  return false;
}

function positionsFullyOffBoard(
  positions: Vec2[],
  board: BoardSize,
): boolean {
  return positions.every(
    ([x, y]) => x < 0 || x >= board.width || y < 0 || y >= board.height,
  );
}

function activePipes(pipes: PipeItem[]): PipeItem[] {
  return pipes.filter((p) => p.health > 0);
}

function cloneTransit(t: PipeTransitState | null): PipeTransitState | null {
  if (!t) return null;
  return {
    pipeId: t.pipeId,
    path: t.path.map(([x, y]) => [x, y]),
    pathIndex: t.pathIndex,
  };
}

function clonePipesForSim(pipes: PipeItem[]): PipeItem[] {
  return pipes.map((p) => ({
    ...p,
    occupiedPositions: p.occupiedPositions.map(([x, y]) => [x, y] as Vec2),
    passes: p.passes.map((pass) => ({
      position: [pass.position[0], pass.position[1]] as Vec2,
      directions: pass.directions.map(([x, y]) => [x, y] as Vec2),
    })),
    health: p.health,
  }));
}

interface ArrowFlightResult {
  offBoard: boolean;
  pipesCrossed: number[];
  cornersCrossed: number[];
}

export interface ArrowFlightStep {
  head: Vec2;
  /** 进入 head 格时的移动方向 */
  incidentDir: Direction;
}

function simulateArrowFlight(
  arrow: ArrowItem,
  allArrows: ArrowItem[],
  corners: CornerItem[],
  board: BoardSize,
  pipes: PipeItem[],
  curtainCells: Set<string> = new Set(),
  extraBlockerCells: Set<string> = new Set(),
): ArrowFlightResult {
  const simPipes = clonePipesForSim(pipes);
  let positions = arrow.occupiedPositions.map(([x, y]) => [x, y] as Vec2);
  let dir = arrow.direction;
  let transit: PipeTransitState | null = null;
  const pipesCrossed: number[] = [];
  const cornersCrossed: number[] = [];
  const maxSteps = (board.width + board.height) * positions.length * 8;

  for (let step = 0; step < maxSteps; step++) {
    const fakeArrow: ArrowItem = {
      ...arrow,
      occupiedPositions: positions,
      direction: dir,
    };
    const result = advanceArrowStep(
      fakeArrow,
      dir,
      cloneTransit(transit),
      corners,
      activePipes(simPipes),
      curtainCells,
      extraBlockerCells,
    );

    if (result.blocked) {
      return { offBoard: false, pipesCrossed, cornersCrossed };
    }

    if (result.pipeExitedId != null) {
      pipesCrossed.push(result.pipeExitedId);
    }

    if (result.cornerReflectedId != null) {
      cornersCrossed.push(result.cornerReflectedId);
    }

    positions = result.arrow.occupiedPositions;
    dir = result.dir;
    transit = result.transit;

    if (positionsFullyOffBoard(positions, board)) {
      return { offBoard: true, pipesCrossed, cornersCrossed };
    }

    const head = positions[positions.length - 1]!;
    if (!inBounds(head, board.width, board.height)) continue;

    if (curtainCells.has(vecKey(head))) {
      return { offBoard: false, pipesCrossed, cornersCrossed };
    }

    if (extraBlockerCells.has(vecKey(head))) {
      return { offBoard: false, pipesCrossed, cornersCrossed };
    }

    if (!transit && isCellOnOtherArrow(head, arrow.instanceId, allArrows)) {
      return { offBoard: false, pipesCrossed, cornersCrossed };
    }
  }

  return { offBoard: false, pipesCrossed, cornersCrossed };
}

/** 模拟飞出轨迹（每步头部落点与入射方向） */
export function traceArrowFlight(
  arrow: ArrowItem,
  allArrows: ArrowItem[],
  corners: CornerItem[],
  board: BoardSize,
  pipes: PipeItem[],
  curtainCells: Set<string> = new Set(),
  extraBlockerCells: Set<string> = new Set(),
): ArrowFlightStep[] {
  const simPipes = clonePipesForSim(pipes);
  let positions = arrow.occupiedPositions.map(([x, y]) => [x, y] as Vec2);
  let dir = arrow.direction;
  let transit: PipeTransitState | null = null;
  const steps: ArrowFlightStep[] = [];
  const maxSteps = (board.width + board.height) * positions.length * 8;

  for (let step = 0; step < maxSteps; step++) {
    const inc = dir;
    const fakeArrow: ArrowItem = {
      ...arrow,
      occupiedPositions: positions,
      direction: dir,
    };
    const result = advanceArrowStep(
      fakeArrow,
      dir,
      cloneTransit(transit),
      corners,
      activePipes(simPipes),
      curtainCells,
      extraBlockerCells,
    );

    if (result.blocked) break;

    positions = result.arrow.occupiedPositions;
    dir = result.dir;
    transit = result.transit;
    const head = positions[positions.length - 1]!;
    steps.push({ head: [head[0], head[1]], incidentDir: inc });

    if (positionsFullyOffBoard(positions, board)) break;

    if (!inBounds(head, board.width, board.height)) continue;

    if (curtainCells.has(vecKey(head))) break;
    if (extraBlockerCells.has(vecKey(head))) break;
    if (!transit && isCellOnOtherArrow(head, arrow.instanceId, allArrows)) break;
  }

  return steps;
}

/** 模拟飞出过程中发生折射的反射角 id 列表 */
export function getArrowCornerCrossings(
  arrow: ArrowItem,
  allArrows: ArrowItem[],
  corners: CornerItem[],
  board: BoardSize,
  pipes: PipeItem[],
  curtainCells: Set<string> = new Set(),
  extraBlockerCells: Set<string> = new Set(),
): number[] {
  return simulateArrowFlight(
    arrow,
    allArrows,
    corners,
    board,
    pipes,
    curtainCells,
    extraBlockerCells,
  ).cornersCrossed;
}

/** 模拟飞出过程中从管道出口穿出的 pipe id 列表（每穿出一次计 1 次） */
export function getArrowPipeCrossings(
  arrow: ArrowItem,
  allArrows: ArrowItem[],
  corners: CornerItem[],
  board: BoardSize,
  pipes: PipeItem[],
  curtainCells: Set<string> = new Set(),
  extraBlockerCells: Set<string> = new Set(),
): number[] {
  return simulateArrowFlight(
    arrow,
    allArrows,
    corners,
    board,
    pipes,
    curtainCells,
    extraBlockerCells,
  ).pipesCrossed;
}

export function arrowTraversesPipe(
  arrow: ArrowItem,
  pipeId: number,
  allArrows: ArrowItem[],
  corners: CornerItem[],
  board: BoardSize,
  pipes: PipeItem[],
  curtainCells: Set<string> = new Set(),
  extraBlockerCells: Set<string> = new Set(),
): boolean {
  return getArrowPipeCrossings(
    arrow,
    allArrows,
    corners,
    board,
    pipes,
    curtainCells,
    extraBlockerCells,
  ).includes(pipeId);
}

/** 模拟蛇形飞出（含角块、管道穿行），用于路径判定 */
export function simulateCanExitWithPipes(
  arrow: ArrowItem,
  allArrows: ArrowItem[],
  corners: CornerItem[],
  board: BoardSize,
  pipes: PipeItem[],
  curtainCells: Set<string> = new Set(),
  extraBlockerCells: Set<string> = new Set(),
): boolean {
  return simulateArrowFlight(
    arrow,
    allArrows,
    corners,
    board,
    pipes,
    curtainCells,
    extraBlockerCells,
  ).offBoard;
}

export function decrementPipeHealth(pipes: PipeItem[], pipeId: number): void {
  const pipe = pipes.find((p) => p.instanceId === pipeId);
  if (!pipe || pipe.health <= 0) return;
  pipe.health -= 1;
}

export function pruneDeadPipes(pipes: PipeItem[]): PipeItem[] {
  return pipes.filter((p) => p.health > 0);
}

export function isArrowHiddenInPipe(
  transit: PipeTransitState | null | undefined,
): boolean {
  return transit != null;
}
