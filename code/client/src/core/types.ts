export type {
  Vec2,
  Direction,
  BoardSize,
  BaseItem,
  ArrowItem,
  BombItem,
  MovingWallItem,
  FrozenOverlayItem,
  ShrinkPipeItem,
  ToggleItem,
  ControllerItem,
  CornerItem,
  ZoneItem,
  BundleItem,
  PipePassConfig,
  PipeItem,
  CurtainItem,
  KeyArrowItem,
  LevelData,
  RawItem,
  GameLevel,
  GameMode,
  SpawnPoolEntry,
  SpawnWeightAdjustTier,
  LevelGoal,
  BuffItem,
  AreaBombItem,
  CrossBombItem,
  FireBombItem,
  BalloonItem,
  BlackHoleItem,
  FlipButtonItem,
  CandyMachineItem,
  ValidationIssue,
  ValidationSeverity,
  EditorMeta,
  EditorDocument,
  BoardShape,
  MaskRows,
} from "@arrowjaw/shared";

export {
  DIR_VEC,
  DIR_NAME,
  vecKey,
  addVec,
  inBounds,
} from "@arrowjaw/shared";

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
  /** 关卡包含的物件 kind（含子区域内），升序 */
  kinds: number[];
  pureKind1: boolean;
  p1Playable: boolean;
  p2Playable: boolean;
  p3Playable: boolean;
  p4Playable: boolean;
  gameMode?: GameMode;
  spawnIntervalSec?: number;
}

export interface LevelManifest {
  levels: LevelManifestEntry[];
  devTests?: LevelManifestEntry[];
  rushTests?: LevelManifestEntry[];
}

export type GamePhase =
  | "levelSelect"
  | "loading"
  | "playing"
  | "animating"
  | "exploding"
  | "celebrating"
  | "won"
  | "lost";

export type LostReason = "time" | "bomb";

export type LaunchMode = "exit" | "bump" | "vanish";

export interface PipeTransitState {
  pipeId: number;
  path: Vec2[];
  pathIndex: number;
}

export interface LaunchAnimation {
  instanceId: number;
  memberIds: number[];
  stripIds: number[];
  mode: LaunchMode;
  originalPositionsById: Record<number, Vec2[]>;
  originalDirectionById: Record<number, Direction>;
  originalStripPositionsById: Record<number, Vec2[]>;
  bumpHistoryById: Record<number, Vec2[][]>;
  stripBumpHistoryById: Record<number, Vec2[][]>;
  reversing: boolean;
  currentDirectionById: Record<number, Direction>;
  stepCount: number;
  /** 已完成的前向飞行格数，用于加速计时 */
  flightStepCount: number;
  /** 本箭动画步进时间累积（毫秒），用于多箭并发时独立加速 */
  stepAccumMs: number;
  pipeTransitById: Record<number, PipeTransitState | null>;
  pipesCrossedById: Record<number, number[]>;
  /** 飞出消除动画中穿过、待箭消除后结算的拨动杆 instanceId */
  togglesCrossedIds: number[];
  /** 飞行途中穿过、待箭消除或反弹回原位后结算的翻转按钮 buff instanceId */
  flipButtonsCrossedIds: number[];
  /** 永久黑洞区域吞噬进度 0~1（箭头继续飞行同时渐隐） */
  blackHoleRegionSwallowById?: Record<number, number>;
}

export interface GameSnapshot {
  phase: GamePhase;
  level: GameLevel | null;
  remainingSeconds: number;
  arrows: ArrowItem[];
  mistakeCount: number;
  animation: LaunchAnimation | null;
}

import type {
  ArrowItem,
  Direction,
  GameLevel,
  Vec2,
  GameMode,
} from "@arrowjaw/shared";
