import type { Direction, RawItem, Vec2 } from "@arrowjaw/shared";
import { bombAnchorCell, DIR_VEC, isAdjacentCells, vecKey } from "@arrowjaw/shared";
import { isPolylineContinuous } from "@arrowjaw/shared";

export type EditorTool =
  | "select"
  | "arrow"
  | "flipArrow"
  | "pipe"
  | "corner"
  | "curtain"
  | "bundle"
  | "key"
  | "bomb"
  | "frozen"
  | "movingWall"
  | "wallPath"
  | "zone"
  | "shrinkPipe"
  | "toggle"
  | "controller";

export interface DrawState {
  tool: EditorTool;
  polyline: Vec2[];
  rectStart: Vec2 | null;
  bundleSourceArrowId: number | null;
  wallPathEditId: number | null;
  wallPathDraft: Vec2[];
  colorId: number;
  direction: Direction;
  direction2: Direction;
  cornerD1: Vec2;
  cornerD2: Vec2;
  shrinkPipeBindCoord: Vec2 | null;
  shrinkPipeId: number | null;
  toggleGroupId: number;
}

export function createDrawState(): DrawState {
  return {
    tool: "select",
    polyline: [],
    rectStart: null,
    bundleSourceArrowId: null,
    wallPathEditId: null,
    wallPathDraft: [],
    colorId: 6,
    direction: 1,
    direction2: 3,
    cornerD1: [1, 0],
    cornerD2: [0, -1],
    shrinkPipeBindCoord: null,
    shrinkPipeId: null,
    toggleGroupId: 1,
  };
}

export function directionFromLastSegment(polyline: Vec2[]): Direction {
  if (polyline.length < 2) return 1;
  const a = polyline.at(-2)!;
  const b = polyline.at(-1)!;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 1) return 1;
  if (dx === 0 && dy === -1) return 2;
  if (dx === 1 && dy === 0) return 3;
  return 4;
}

export function appendPolylinePoint(polyline: Vec2[], cell: Vec2): Vec2[] {
  if (polyline.length === 0) return [cell];
  const last = polyline.at(-1)!;
  if (last[0] === cell[0] && last[1] === cell[1]) return polyline;
  if (polyline.some(([x, y]) => x === cell[0] && y === cell[1])) return polyline;
  const dx = Math.abs(cell[0] - last[0]);
  const dy = Math.abs(cell[1] - last[1]);
  if (dx + dy !== 1) return polyline;
  return [...polyline, cell];
}

/** 从折线末端沿曼哈顿路径延伸到 target（用于按住拖拽连续画格） */
export function extendPolylineToCell(polyline: Vec2[], target: Vec2): Vec2[] {
  if (polyline.length === 0) return [target];
  let result = polyline;
  let last = result.at(-1)!;
  if (last[0] === target[0] && last[1] === target[1]) return result;

  while (last[0] !== target[0] || last[1] !== target[1]) {
    let nx = last[0];
    let ny = last[1];
    if (nx !== target[0]) nx += Math.sign(target[0] - nx);
    else ny += Math.sign(target[1] - ny);
    const next: Vec2 = [nx, ny];
    const extended = appendPolylinePoint(result, next);
    if (extended.length === result.length) break;
    result = extended;
    last = next;
  }
  return result;
}

export function isPolylineTool(tool: EditorTool): boolean {
  return tool === "arrow" || tool === "pipe" || tool === "flipArrow" || tool === "shrinkPipe";
}

export function appendShrinkPipePoint(
  polyline: Vec2[],
  cell: Vec2,
  pipeCells: Set<string>,
  bindCoord: Vec2,
): Vec2[] {
  if (pipeCells.has(vecKey(cell))) return polyline;
  if (polyline.length === 0) {
    if (!isAdjacentCells(cell, bindCoord)) return polyline;
    return [cell];
  }
  return appendPolylinePoint(polyline, cell);
}

export function extendShrinkPipeToCell(
  polyline: Vec2[],
  target: Vec2,
  pipeCells: Set<string>,
  bindCoord: Vec2,
): Vec2[] {
  if (polyline.length === 0) return appendShrinkPipePoint(polyline, target, pipeCells, bindCoord);
  let result = polyline;
  let last = result.at(-1)!;
  if (last[0] === target[0] && last[1] === target[1]) return result;
  while (last[0] !== target[0] || last[1] !== target[1]) {
    let nx = last[0];
    let ny = last[1];
    if (nx !== target[0]) nx += Math.sign(target[0] - nx);
    else ny += Math.sign(target[1] - ny);
    const next: Vec2 = [nx, ny];
    const extended = appendShrinkPipePoint(result, next, pipeCells, bindCoord);
    if (extended.length === result.length) break;
    result = extended;
    last = next;
  }
  return result;
}

export function buildArrowItem(polyline: Vec2[], colorId: number, direction: Direction, layer = 2): Omit<RawItem, "instanceId"> {
  return {
    kind: 1,
    occupiedPositions: polyline,
    layer,
    direction,
    colorId,
  };
}

export function buildFlipArrowItem(
  polyline: Vec2[],
  direction1: Direction,
  direction2: Direction,
  colorId: number,
): Omit<RawItem, "instanceId"> {
  return {
    kind: 2,
    occupiedPositions: polyline,
    layer: 2,
    direction1,
    direction2,
    colorId,
  };
}

export function buildBombItem(hostPositions: Vec2[], time = 10): Omit<RawItem, "instanceId"> {
  const cell = bombAnchorCell(hostPositions);
  return {
    kind: 5,
    layer: 3,
    occupiedPositions: [[cell[0], cell[1]]],
    time,
  };
}

export function buildFrozenItem(hostPositions: Vec2[], health = 1): Omit<RawItem, "instanceId"> {
  return {
    kind: 13,
    layer: 8,
    occupiedPositions: hostPositions.map(([x, y]) => [x, y] as Vec2),
    health,
  };
}

export function buildMovingWallItem(
  bodyCells: Vec2[],
  movingPath: Vec2[],
  movingDistance = 1,
  movingType: 1 | 2 = 1,
): Omit<RawItem, "instanceId"> {
  return {
    kind: 7,
    layer: 2,
    occupiedPositions: bodyCells,
    movingPath,
    movingDistance,
    movingType,
  };
}

export function buildPipeItem(polyline: Vec2[], health = 1): Omit<RawItem, "instanceId"> {
  const start = polyline[0]!;
  const end = polyline.at(-1)!;
  const startDir = polyline.length >= 2 ? directionVecFromSegment(polyline[0]!, polyline[1]!) : [1, 0];
  const endDir = polyline.length >= 2 ? directionVecFromSegment(polyline.at(-2)!, end) : [1, 0];
  return {
    kind: 3,
    layer: 2,
    occupiedPositions: polyline,
    health,
    healthViewPathIndex: Math.floor(polyline.length / 2),
    passes: [
      { position: start, directions: [negateVec(startDir as Vec2), startDir as Vec2] },
      { position: end, directions: [negateVec(endDir as Vec2), endDir as Vec2] },
    ],
  };
}

function directionVecFromSegment(a: Vec2, b: Vec2): Vec2 {
  return [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])];
}

function negateVec(v: Vec2): Vec2 {
  return [-v[0], -v[1]];
}

export function buildCornerItem(cell: Vec2, d1: Vec2, d2: Vec2): Omit<RawItem, "instanceId"> {
  return {
    kind: 4,
    layer: 2,
    occupiedPositions: [cell],
    direction1: d1,
    direction2: d2,
  };
}

export function buildKeyItem(cell: Vec2): Omit<RawItem, "instanceId"> {
  return { kind: 11, layer: 3, occupiedPositions: [cell] };
}

export function buildCurtainItem(cells: Vec2[], health = 1, order = 0): Omit<RawItem, "instanceId"> {
  return { kind: 6, layer: 8, occupiedPositions: cells, health, order };
}

export function buildZoneItem(cells: Vec2[]): Omit<RawItem, "instanceId"> {
  return { kind: 12, layer: 1, occupiedPositions: cells, items: [] };
}

export function buildBundleItem(cells: Vec2[]): Omit<RawItem, "instanceId"> {
  return { kind: 8, layer: 3, occupiedPositions: cells };
}

export function buildShrinkPipeItem(
  strip: Vec2[],
  bindCoordinate: Vec2,
  shorten = 1,
): Omit<RawItem, "instanceId"> {
  return {
    kind: 14,
    layer: 2,
    occupiedPositions: strip.map(([x, y]) => [x, y] as Vec2),
    bindCoordinate: [bindCoordinate[0], bindCoordinate[1]],
    shorten,
  };
}

export function buildToggleItem(
  cell: Vec2,
  groupID = 1,
  direction: Direction = 1,
): Omit<RawItem, "instanceId"> {
  return {
    kind: 15,
    layer: 3,
    groupID,
    direction,
    occupiedPositions: [[cell[0], cell[1]]],
  };
}

export function buildControllerItem(
  cell: Vec2,
  groupID: number,
  bindInstanceId: number,
): Omit<RawItem, "instanceId"> {
  return {
    kind: 16,
    layer: 3,
    groupID,
    bindInstanceId,
    occupiedPositions: [[cell[0], cell[1]]],
  };
}

export function isValidPolyline(polyline: Vec2[]): boolean {
  if (polyline.length < 2) return false;
  if (!isPolylineContinuous(polyline)) return false;
  const keys = new Set(polyline.map(([x, y]) => `${x},${y}`));
  return keys.size === polyline.length;
}

export function headMatchesDirection(polyline: Vec2[], direction: Direction): boolean {
  if (polyline.length < 2) return true;
  const vec = DIR_VEC[direction];
  const tail = polyline.at(-2)!;
  const head = polyline.at(-1)!;
  return head[0] - tail[0] === vec[0] && head[1] - tail[1] === vec[1];
}

export function tailMatchesDirection(polyline: Vec2[], direction: Direction): boolean {
  if (polyline.length < 2) return true;
  const vec = DIR_VEC[direction];
  const head = polyline[0]!;
  const next = polyline[1]!;
  return next[0] - head[0] === -vec[0] && next[1] - head[1] === -vec[1];
}

export function directionFromFirstSegment(polyline: Vec2[]): Direction {
  if (polyline.length < 2) return 3;
  const a = polyline[0]!;
  const b = polyline[1]!;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 1) return 1;
  if (dx === 0 && dy === -1) return 2;
  if (dx === 1 && dy === 0) return 3;
  return 4;
}

/** 翻转后箭头朝向：折线反转后的末段方向 */
export function flipArrowDirection2(polyline: Vec2[]): Direction {
  return directionFromLastSegment([...polyline].reverse());
}
