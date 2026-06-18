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
  bombs: BombItem[];
  movingWalls: MovingWallItem[];
  frozenOverlays: FrozenOverlayItem[];
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
  };
}
