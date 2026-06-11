export type Vec2 = [number, number];
export type Direction = 1 | 2 | 3 | 4;

export const DIR_VEC: Record<Direction, Vec2> = {
  1: [0, 1],
  2: [0, -1],
  3: [1, 0],
  4: [-1, 0],
};

export const DIR_NAME: Record<Direction, string> = {
  1: "down",
  2: "up",
  3: "right",
  4: "left",
};

export function vecKey(v: Vec2): string {
  return `${v[0]},${v[1]}`;
}

export function addVec(a: Vec2, b: Vec2): Vec2 {
  return [a[0] + b[0], a[1] + b[1]];
}

export function inBounds(v: Vec2, width: number, height: number): boolean {
  return v[0] >= 0 && v[0] < width && v[1] >= 0 && v[1] < height;
}

export interface BoardSize {
  width: number;
  height: number;
}

export interface BaseItem {
  kind: number;
  occupiedPositions: Vec2[];
  instanceId: number;
  layer: number;
}

export interface ArrowItem extends BaseItem {
  kind: 1;
  direction: Direction;
  colorId: number;
  /** null = 顶层箭头；否则为 kind12 区域 instanceId */
  zoneId: number | null;
}

export interface CornerItem extends BaseItem {
  kind: 4;
  direction1: Vec2;
  direction2: Vec2;
  zoneId: number | null;
}

export interface ZoneItem extends BaseItem {
  kind: 12;
  cells: Set<string>;
  arrowIds: number[];
  cornerIds: number[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface BundleItem extends BaseItem {
  kind: 8;
  zoneId: number | null;
}

export interface PipePassConfig {
  position: Vec2;
  directions: Vec2[];
}

export interface PipeItem extends BaseItem {
  kind: 3;
  health: number;
  passes: PipePassConfig[];
  healthViewPathIndex: number;
  zoneId: number | null;
}

export interface CurtainItem extends BaseItem {
  kind: 6;
  health: number;
  order: number;
}

export interface KeyArrowItem extends BaseItem {
  kind: 11;
}

export interface BundleGroup {
  id: number;
  stripIds: number[];
  arrowIds: number[];
}

export interface LevelManifestEntry {
  id: number;
  file: string;
  name: string;
  difficulty: number;
  width: number;
  height: number;
  durationInSec: number;
  pureKind1: boolean;
  p1Playable: boolean;
  p2Playable: boolean;
  p3Playable: boolean;
  p4Playable: boolean;
}

export interface LevelManifest {
  levels: LevelManifestEntry[];
}

export interface LevelData {
  width: number;
  height: number;
  name: string;
  durationInSec: number;
  difficulty: number;
  levelKind?: number;
  itemModels: RawItem[];
}

export interface RawItem {
  kind: number;
  occupiedPositions: Vec2[];
  instanceId: number;
  layer: number;
  direction?: Direction;
  colorId?: number;
  items?: RawItem[];
  [key: string]: unknown;
}

export interface GameLevel {
  id: number;
  width: number;
  height: number;
  name: string;
  durationInSec: number;
  difficulty: number;
  arrows: ArrowItem[];
  corners: CornerItem[];
  zones: ZoneItem[];
  bundles: BundleItem[];
  pipes: PipeItem[];
  curtains: CurtainItem[];
  keys: KeyArrowItem[];
}

export type GamePhase =
  | "levelSelect"
  | "loading"
  | "playing"
  | "animating"
  | "won"
  | "lost";

export type LaunchMode = "exit" | "bump";

/** 箭头在管道内穿行时的路径状态 */
export interface PipeTransitState {
  pipeId: number;
  path: Vec2[];
  pathIndex: number;
}

export interface LaunchAnimation {
  instanceId: number;
  /** 同步移动的箭头（含 instanceId） */
  memberIds: number[];
  /** 同步移动的捆绑条带 */
  stripIds: number[];
  mode: LaunchMode;
  originalPositionsById: Record<number, Vec2[]>;
  /** 发射前朝向；管道穿行会改 direction，bump 回退后需还原 */
  originalDirectionById: Record<number, Direction>;
  originalStripPositionsById: Record<number, Vec2[]>;
  bumpHistoryById: Record<number, Vec2[][]>;
  stripBumpHistoryById: Record<number, Vec2[][]>;
  reversing: boolean;
  currentDirectionById: Record<number, Direction>;
  /** 动画步数，用于防止卡死 */
  stepCount: number;
  /** 各成员是否在管道内穿行（非 null 时箭头隐藏于管道层下） */
  pipeTransitById: Record<number, PipeTransitState | null>;
  /** 已成功穿出管道出口的成员 → 管道 id 列表（飞出棋盘后扣血） */
  pipesCrossedById: Record<number, number[]>;
}

export interface GameSnapshot {
  phase: GamePhase;
  level: GameLevel | null;
  remainingSeconds: number;
  arrows: ArrowItem[];
  mistakeCount: number;
  animation: LaunchAnimation | null;
}
