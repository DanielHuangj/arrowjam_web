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
  kind: 1 | 2;
  direction: Direction;
  colorId: number;
  zoneId: number | null;
  /** kind 2：默认朝向 */
  direction1?: Direction;
  /** kind 2：翻转后朝向 */
  direction2?: Direction;
}

export interface BombItem extends BaseItem {
  kind: 5;
  time: number;
  zoneId: number | null;
  /** 解析期绑定：宿主箭 instanceId */
  hostArrowId: number;
}

export interface MovingWallItem extends BaseItem {
  kind: 7;
  movingPath: Vec2[];
  movingDistance: number;
  movingType: 1 | 2;
  zoneId: null;
}

export interface FrozenOverlayItem extends BaseItem {
  kind: 13;
  health: number;
  zoneId: number | null;
  /** 解析期绑定：宿主箭 instanceId */
  hostArrowId: number;
}

export interface CornerItem extends BaseItem {
  kind: 4;
  direction1: Vec2;
  direction2: Vec2;
  zoneId: number | null;
  spin?: 0 | 90 | 180 | 270;
  spinDirection?: 0 | 1;
}

export interface ShrinkPipeItem extends BaseItem {
  kind: 14;
  bindCoordinate: Vec2;
  shorten: number;
  zoneId: number | null;
  /** 解析期：绑定管道 instanceId */
  bindPipeId: number;
}

export type ToggleDirection = 1 | 2;

export interface ToggleItem extends BaseItem {
  kind: 15;
  groupID: number;
  direction: ToggleDirection;
  zoneId: number | null;
}

export interface ControllerItem extends BaseItem {
  kind: 16;
  groupID: number;
  bindInstanceId: number;
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

export type GameMode = "classic" | "rush";

export type SpawnPoolKind = 1 | 2 | 4 | 17 | 18 | 19 | 20 | 21 | 22 | 23;

export interface SpawnPoolEntry {
  kind: SpawnPoolKind;
  /** 整数权重，1000 分制：1 = 0.1%，1000 = 100% */
  weight: number;
  colorId?: number;
  bombRadius?: 1 | 2;
  crossArm?: 2 | 5;
}

/** 按本周期消除格数选用的生成池动态权重调整段（1000 分制总量，均分给同类条目） */
export interface SpawnWeightAdjustTier {
  /** 达到该消除格数（含）起启用本段；多段按升序配置，取满足条件的最高段 */
  minElimCells: number;
  /** 增益道具权重总增量（均分给 spawnPool 中各增益条目） */
  buffDelta: number;
  /** 箭头条目权重总减量（均分） */
  arrowDelta: number;
  /** 机制物件（反射角等）权重总减量（均分） */
  mechDelta: number;
}

export type LevelGoal =
  | { type: "clearArrowCount"; count: number }
  | {
      type: "clearColorArrows";
      targets: { colorId: number; count: number }[];
    };

export interface AreaBombItem extends BaseItem {
  kind: 17;
  bombRadius: 1 | 2;
  zoneId: number | null;
}

export interface CrossBombItem extends BaseItem {
  kind: 18;
  crossArm: 2 | 5;
  zoneId: number | null;
}

export interface FireBombItem extends BaseItem {
  kind: 19;
  zoneId: number | null;
}

export interface BalloonItem extends BaseItem {
  kind: 20;
  zoneId: number | null;
}

export interface BlackHoleItem extends BaseItem {
  kind: 21;
  zoneId: number | null;
}

export interface FlipButtonItem extends BaseItem {
  kind: 22;
  zoneId: number | null;
}

export interface CandyMachineItem extends BaseItem {
  kind: 23;
  zoneId: number | null;
}

export type BuffItem =
  | AreaBombItem
  | CrossBombItem
  | FireBombItem
  | BalloonItem
  | BlackHoleItem
  | FlipButtonItem
  | CandyMachineItem;

export interface MaskRows {
  rows: [number, number, number][];
}

export type BoardShape = "full" | "custom";

/** 无效格着色：0=白(默认不存)，1-8=箭色，9=黑，10=浅灰 */
export type InvalidCellColorId = 0 | 1 | 2 | 3 | 4 | 6 | 7 | 8 | 9 | 10;

export interface ColoredMaskEntry {
  color: InvalidCellColorId;
  rows: [number, number, number][];
}

export interface LevelData {
  width: number;
  height: number;
  name: string;
  durationInSec: number;
  difficulty: number;
  levelKind?: number;
  boardShape?: BoardShape;
  playableMask?: MaskRows;
  blackHoleRegions?: MaskRows[];
  /** 异形棋盘无效格着色（仅非白色） */
  invalidCellColors?: ColoredMaskEntry[];
  gameMode?: GameMode;
  spawnIntervalSec?: number;
  spawnPool?: SpawnPoolEntry[];
  spawnWeightAdjust?: SpawnWeightAdjustTier[];
  levelGoals?: LevelGoal[];
  /** 爽快版连消；缺省视为开启 */
  comboEnabled?: boolean;
  itemModels: RawItem[];
}

export interface RawItem {
  kind: number;
  occupiedPositions: Vec2[];
  instanceId: number;
  layer: number;
  direction?: Direction;
  direction1?: Direction | Vec2;
  direction2?: Direction | Vec2;
  colorId?: number;
  health?: number;
  order?: number;
  time?: number;
  passes?: unknown;
  healthViewPathIndex?: number;
  movingPath?: Vec2[];
  movingDistance?: number;
  movingType?: 1 | 2;
  bindCoordinate?: Vec2;
  shorten?: number;
  groupID?: number;
  bindInstanceId?: number;
  spin?: 0 | 90 | 180 | 270;
  spinDirection?: 0 | 1;
  bombRadius?: 1 | 2;
  crossArm?: 2 | 5;
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
  gameMode: GameMode;
  spawnIntervalSec?: number;
  spawnPool?: SpawnPoolEntry[];
  spawnWeightAdjust?: SpawnWeightAdjustTier[];
  levelGoals?: LevelGoal[];
  /** 爽快版连消；缺省视为开启 */
  comboEnabled?: boolean;
  boardShape: BoardShape;
  playableCells: Set<string>;
  blackHoleCells: Set<string>;
  /** 无效格着色 key→colorId（不含默认白） */
  invalidCellColors: Map<string, InvalidCellColorId>;
  arrows: ArrowItem[];
  corners: CornerItem[];
  zones: ZoneItem[];
  bundles: BundleItem[];
  pipes: PipeItem[];
  curtains: CurtainItem[];
  keys: KeyArrowItem[];
  bombs: BombItem[];
  movingWalls: MovingWallItem[];
  frozenOverlays: FrozenOverlayItem[];
  shrinkPipes: ShrinkPipeItem[];
  toggles: ToggleItem[];
  controllers: ControllerItem[];
  buffs: BuffItem[];
}

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  id: string;
  severity: ValidationSeverity;
  message: string;
  instanceId?: number;
}

export interface EditorMeta {
  width: number;
  height: number;
  name: string;
  durationInSec: number;
  difficulty: number;
  levelKind?: number;
  gameMode?: GameMode;
  spawnIntervalSec?: number;
  spawnPool?: SpawnPoolEntry[];
  spawnWeightAdjust?: SpawnWeightAdjustTier[];
  levelGoals?: LevelGoal[];
  /** 爽快版连消；缺省视为开启 */
  comboEnabled?: boolean;
  boardShape?: BoardShape;
  playableMask?: MaskRows;
  blackHoleRegions?: MaskRows[];
  invalidCellColors?: ColoredMaskEntry[];
}

export interface EditorBackgroundImage {
  dataUrl: string;
  name: string;
}

export interface EditorDocument {
  meta: EditorMeta;
  itemModels: RawItem[];
  source: {
    name: string;
    handle?: FileSystemFileHandle;
  };
  dirty: boolean;
  selectedInstanceIds: number[];
  editContext: {
    zoneInstanceId: number | null;
    regionEditMode: null | "playable" | "blackHole" | "invalidColor";
  };
  editorOnly?: {
    backgroundImage?: EditorBackgroundImage;
  };
}
