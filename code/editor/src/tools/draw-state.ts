import type { Direction, RawItem, Vec2 } from "@arrowjaw/shared";
import { DIR_VEC } from "@arrowjaw/shared";
import { isPolylineContinuous } from "@arrowjaw/shared";

export type EditorTool =
  | "select"
  | "arrow"
  | "pipe"
  | "corner"
  | "curtain"
  | "bundle"
  | "key"
  | "zone";

export interface DrawState {
  tool: EditorTool;
  polyline: Vec2[];
  rectStart: Vec2 | null;
  bundleSourceArrowId: number | null;
  colorId: number;
  direction: Direction;
  cornerD1: Vec2;
  cornerD2: Vec2;
}

export function createDrawState(): DrawState {
  return {
    tool: "select",
    polyline: [],
    rectStart: null,
    bundleSourceArrowId: null,
    colorId: 6,
    direction: 1,
    cornerD1: [1, 0],
    cornerD2: [0, -1],
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
  return tool === "arrow" || tool === "pipe";
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
