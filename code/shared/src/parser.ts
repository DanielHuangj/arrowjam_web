import type {
  ArrowItem,
  BombItem,
  BuffItem,
  BundleItem,
  ControllerItem,
  CornerItem,
  CurtainItem,
  FrozenOverlayItem,
  GameLevel,
  KeyArrowItem,
  LevelData,
  LevelGoal,
  MovingWallItem,
  PipeItem,
  RawItem,
  ShrinkPipeItem,
  SpawnPoolEntry,
  ToggleItem,
  Vec2,
  ZoneItem,
} from "./types.ts";
import type { Direction } from "./types.ts";
import { buildZoneItem } from "./zone-builder.ts";
import { buildBoardMaskFromLevel } from "./board-mask.ts";
import { buildInvalidCellColorMap } from "./invalid-cell-colors.ts";
import { vecKey } from "./types.ts";

function clonePositions(positions: Vec2[]): Vec2[] {
  return positions.map(([x, y]) => [x, y]);
}

function positionsEqual(a: Vec2[], b: Vec2[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((p, i) => p[0] === b[i]![0] && p[1] === b[i]![1]);
}

function findArrowOnCell(arrows: ArrowItem[], cell: Vec2): ArrowItem | null {
  const key = vecKey(cell);
  for (const arrow of arrows) {
    if (arrow.occupiedPositions.some((p) => vecKey(p) === key)) return arrow;
  }
  return null;
}

function topLevelArrows(arrows: ArrowItem[]): ArrowItem[] {
  return arrows.filter((a) => a.zoneId == null);
}

function findArrowByPositions(
  arrows: ArrowItem[],
  positions: Vec2[],
): ArrowItem | null {
  for (const arrow of arrows) {
    if (positionsEqual(arrow.occupiedPositions, positions)) return arrow;
  }
  return null;
}

function parseCorner(item: RawItem, zoneId: number | null): CornerItem {
  const d1 = item.direction1 as [number, number] | undefined;
  const d2 = item.direction2 as [number, number] | undefined;
  if (!d1 || !d2) {
    throw new Error(`Corner #${item.instanceId} missing direction1/2`);
  }
  const spin = item.spin as 0 | 90 | 180 | 270 | undefined;
  const spinDirection = item.spinDirection as 0 | 1 | undefined;
  return {
    kind: 4,
    instanceId: item.instanceId,
    layer: item.layer,
    occupiedPositions: clonePositions(item.occupiedPositions),
    direction1: d1,
    direction2: d2,
    zoneId,
    spin: spin ?? 0,
    spinDirection: spinDirection ?? 0,
  };
}

function parseBundle(item: RawItem, zoneId: number | null): BundleItem {
  return {
    kind: 8,
    instanceId: item.instanceId,
    layer: item.layer,
    occupiedPositions: clonePositions(item.occupiedPositions),
    zoneId,
  };
}

function parseCurtain(item: RawItem): CurtainItem {
  const health = item.health as number | undefined;
  if (health == null) {
    throw new Error(`Curtain #${item.instanceId} missing health`);
  }
  return {
    kind: 6,
    instanceId: item.instanceId,
    layer: item.layer,
    occupiedPositions: clonePositions(item.occupiedPositions),
    health,
    order: (item.order as number) ?? 0,
  };
}

function parseKey(item: RawItem): KeyArrowItem {
  return {
    kind: 11,
    instanceId: item.instanceId,
    layer: item.layer,
    occupiedPositions: clonePositions(item.occupiedPositions),
  };
}

function parsePipe(item: RawItem, zoneId: number | null): PipeItem {
  const passes = item.passes as
    | { position: [number, number]; directions: [number, number][] }[]
    | undefined;
  if (!passes || passes.length < 2) {
    throw new Error(`Pipe #${item.instanceId} missing passes`);
  }
  const health = item.health as number | undefined;
  if (health == null) {
    throw new Error(`Pipe #${item.instanceId} missing health`);
  }
  return {
    kind: 3,
    instanceId: item.instanceId,
    layer: item.layer,
    occupiedPositions: clonePositions(item.occupiedPositions),
    health,
    passes: passes.map((p) => ({
      position: [p.position[0], p.position[1]] as Vec2,
      directions: p.directions.map(([x, y]) => [x, y] as Vec2),
    })),
    healthViewPathIndex: (item.healthViewPathIndex as number) ?? 0,
    zoneId,
  };
}

function parseArrow(item: RawItem, zoneId: number | null): ArrowItem {
  if (item.kind === 2) {
    const d1 = item.direction1 as Direction | undefined;
    const d2 = item.direction2 as Direction | undefined;
    if (d1 == null || d2 == null || item.colorId == null) {
      throw new Error(`Flip arrow #${item.instanceId} missing direction1/2/colorId`);
    }
    return {
      kind: 2,
      instanceId: item.instanceId,
      layer: item.layer,
      occupiedPositions: clonePositions(item.occupiedPositions),
      direction: d1,
      direction1: d1,
      direction2: d2,
      colorId: item.colorId,
      zoneId,
    };
  }
  if (item.direction == null || item.colorId == null) {
    throw new Error(`Arrow #${item.instanceId} missing direction/colorId`);
  }
  return {
    kind: 1,
    instanceId: item.instanceId,
    layer: item.layer,
    occupiedPositions: clonePositions(item.occupiedPositions),
    direction: item.direction,
    colorId: item.colorId,
    zoneId,
  };
}

function parseMovingWall(item: RawItem): MovingWallItem {
  const movingPath = item.movingPath as Vec2[] | undefined;
  const movingDistance = item.movingDistance as number | undefined;
  const movingType = item.movingType as 1 | 2 | undefined;
  if (!movingPath || movingPath.length < 2) {
    throw new Error(`Moving wall #${item.instanceId} missing movingPath`);
  }
  if (movingDistance == null || movingDistance < 1) {
    throw new Error(`Moving wall #${item.instanceId} invalid movingDistance`);
  }
  if (movingType !== 1 && movingType !== 2) {
    throw new Error(`Moving wall #${item.instanceId} invalid movingType`);
  }
  return {
    kind: 7,
    instanceId: item.instanceId,
    layer: item.layer,
    occupiedPositions: clonePositions(item.occupiedPositions),
    movingPath: clonePositions(movingPath),
    movingDistance,
    movingType,
    zoneId: null,
  };
}

function parseMovingWallForEditor(item: RawItem): MovingWallItem {
  const movingPath = (item.movingPath as Vec2[] | undefined) ?? [];
  const movingDistance = item.movingDistance as number | undefined;
  const movingType = item.movingType as 1 | 2 | undefined;
  return {
    kind: 7,
    instanceId: item.instanceId,
    layer: item.layer,
    occupiedPositions: clonePositions(item.occupiedPositions),
    movingPath: clonePositions(movingPath),
    movingDistance: movingDistance == null || movingDistance < 1 ? 1 : movingDistance,
    movingType: movingType === 2 ? 2 : 1,
    zoneId: null,
  };
}

function findPipeOnCell(pipes: PipeItem[], cell: Vec2): PipeItem | null {
  const key = vecKey(cell);
  for (const pipe of pipes) {
    if (pipe.occupiedPositions.some((p) => vecKey(p) === key)) return pipe;
  }
  return null;
}

function parseShrinkPipe(
  item: RawItem,
  zoneId: number | null,
  pipes: PipeItem[],
): ShrinkPipeItem {
  const bind = item.bindCoordinate as Vec2 | undefined;
  const shorten = item.shorten as number | undefined;
  if (!bind || bind.length !== 2) {
    throw new Error(`Shrink pipe #${item.instanceId} missing bindCoordinate`);
  }
  if (shorten == null || shorten < 1) {
    throw new Error(`Shrink pipe #${item.instanceId} invalid shorten`);
  }
  const pipe = findPipeOnCell(pipes, bind);
  if (!pipe) {
    throw new Error(`Shrink pipe #${item.instanceId} bindCoordinate not on pipe`);
  }
  return {
    kind: 14,
    instanceId: item.instanceId,
    layer: item.layer,
    occupiedPositions: clonePositions(item.occupiedPositions),
    bindCoordinate: [bind[0], bind[1]],
    shorten,
    zoneId,
    bindPipeId: pipe.instanceId,
  };
}

function parseToggle(item: RawItem, zoneId: number | null): ToggleItem {
  const groupID = item.groupID as number | undefined;
  if (groupID == null || groupID < 1) {
    throw new Error(`Toggle #${item.instanceId} invalid groupID`);
  }
  if (item.occupiedPositions.length !== 1) {
    throw new Error(`Toggle #${item.instanceId} must occupy one cell`);
  }
  const direction = (item.direction as 1 | 2 | undefined) ?? 1;
  return {
    kind: 15,
    instanceId: item.instanceId,
    layer: item.layer,
    occupiedPositions: clonePositions(item.occupiedPositions),
    groupID,
    direction: direction === 2 ? 2 : 1,
    zoneId,
  };
}

type HostKind = 2 | 4 | 7 | 14;

function findHostKind(
  id: number,
  ctx: CollectCtx,
): HostKind | null {
  if (ctx.arrows.some((a) => a.instanceId === id && a.kind === 2)) return 2;
  if (ctx.corners.some((c) => c.instanceId === id)) return 4;
  if (ctx.movingWalls.some((w) => w.instanceId === id)) return 7;
  if (ctx.shrinkPipes.some((s) => s.instanceId === id)) return 14;
  return null;
}

function parseController(item: RawItem, zoneId: number | null, ctx: CollectCtx): ControllerItem {
  const groupID = item.groupID as number | undefined;
  const bindInstanceId = item.bindInstanceId as number | undefined;
  if (groupID == null || groupID < 1) {
    throw new Error(`Controller #${item.instanceId} invalid groupID`);
  }
  if (bindInstanceId == null) {
    throw new Error(`Controller #${item.instanceId} missing bindInstanceId`);
  }
  if (item.occupiedPositions.length !== 1) {
    throw new Error(`Controller #${item.instanceId} must occupy one cell`);
  }
  const hostKind = findHostKind(bindInstanceId, ctx);
  if (!hostKind) {
    throw new Error(`Controller #${item.instanceId} invalid bindInstanceId`);
  }
  const hostPositions = getHostPositions(bindInstanceId, hostKind, ctx);
  const cell = item.occupiedPositions[0]!;
  if (!hostPositions.some((p) => p[0] === cell[0] && p[1] === cell[1])) {
    throw new Error(`Controller #${item.instanceId} not on host cell`);
  }
  return {
    kind: 16,
    instanceId: item.instanceId,
    layer: item.layer,
    occupiedPositions: clonePositions(item.occupiedPositions),
    groupID,
    bindInstanceId,
    zoneId,
  };
}

function getHostPositions(
  id: number,
  kind: HostKind,
  ctx: CollectCtx,
): Vec2[] {
  if (kind === 2) {
    return ctx.arrows.find((a) => a.instanceId === id)?.occupiedPositions ?? [];
  }
  if (kind === 4) {
    return ctx.corners.find((c) => c.instanceId === id)?.occupiedPositions ?? [];
  }
  if (kind === 7) {
    return ctx.movingWalls.find((w) => w.instanceId === id)?.occupiedPositions ?? [];
  }
  return ctx.shrinkPipes.find((s) => s.instanceId === id)?.occupiedPositions ?? [];
}

function parseBuff(item: RawItem, zoneId: number | null): BuffItem {
  if (item.occupiedPositions.length !== 1) {
    throw new Error(`Buff #${item.instanceId} must occupy one cell`);
  }
  const base = {
    instanceId: item.instanceId,
    layer: item.layer,
    occupiedPositions: clonePositions(item.occupiedPositions),
    zoneId,
  };
  if (item.kind === 17) {
    const bombRadius = item.bombRadius as 1 | 2 | undefined;
    if (bombRadius !== 1 && bombRadius !== 2) {
      throw new Error(`Area bomb #${item.instanceId} missing bombRadius`);
    }
    return { kind: 17, bombRadius, ...base };
  }
  if (item.kind === 18) {
    const crossArm = item.crossArm as 2 | 5 | undefined;
    if (crossArm !== 2 && crossArm !== 5) {
      throw new Error(`Cross bomb #${item.instanceId} missing crossArm`);
    }
    return { kind: 18, crossArm, ...base };
  }
  if (item.kind === 19) {
    return { kind: 19, ...base };
  }
  if (item.kind === 20) {
    return { kind: 20, ...base };
  }
  if (item.kind === 21) {
    return { kind: 21, ...base };
  }
  if (item.kind === 22) {
    return { kind: 22, ...base };
  }
  if (item.kind === 23) {
    return { kind: 23, ...base };
  }
  throw new Error(`Unknown buff kind ${item.kind}`);
}

function parseRushFields(data: LevelData): {
  gameMode: "classic" | "rush";
  spawnIntervalSec?: number;
  spawnPool?: SpawnPoolEntry[];
  spawnWeightAdjust?: import("./types.ts").SpawnWeightAdjustTier[];
  levelGoals?: LevelGoal[];
  comboEnabled?: boolean;
} {
  const explicitMode = data.gameMode;
  const hasRushConfig =
    data.spawnIntervalSec != null ||
    (data.spawnPool != null && data.spawnPool.length > 0) ||
    (data.spawnWeightAdjust != null && data.spawnWeightAdjust.length > 0) ||
    (data.levelGoals != null && data.levelGoals.length > 0);
  const gameMode =
    explicitMode === "rush" || (explicitMode !== "classic" && hasRushConfig)
      ? "rush"
      : "classic";
  if (gameMode !== "rush") {
    return { gameMode: "classic" };
  }
  return {
    gameMode: "rush",
    spawnIntervalSec: data.spawnIntervalSec,
    spawnPool: data.spawnPool,
    spawnWeightAdjust: data.spawnWeightAdjust,
    levelGoals: data.levelGoals,
    comboEnabled: data.comboEnabled,
  };
}

interface CollectCtx {
  arrows: ArrowItem[];
  corners: CornerItem[];
  bundles: BundleItem[];
  pipes: PipeItem[];
  bombs: BombItem[];
  frozenOverlays: FrozenOverlayItem[];
  keys: KeyArrowItem[];
  shrinkPipes: ShrinkPipeItem[];
  toggles: ToggleItem[];
  controllers: ControllerItem[];
  movingWalls: MovingWallItem[];
  buffs: BuffItem[];
}

function collectFromItems(items: RawItem[], zoneId: number | null, ctx: CollectCtx): void {
  const scopeArrows: ArrowItem[] = [];
  for (const item of items) {
    if (item.kind === 1 || item.kind === 2) {
      const arrow = parseArrow(item, zoneId);
      scopeArrows.push(arrow);
      ctx.arrows.push(arrow);
    } else if (item.kind === 4) {
      ctx.corners.push(parseCorner(item, zoneId));
    } else if (item.kind === 8) {
      ctx.bundles.push(parseBundle(item, zoneId));
    } else if (item.kind === 3) {
      ctx.pipes.push(parsePipe(item, zoneId));
    } else if (item.kind === 5) {
      const time = item.time as number | undefined;
      if (time == null) {
        throw new Error(`Bomb #${item.instanceId} missing time`);
      }
      const cell = item.occupiedPositions[0];
      if (!cell) {
        throw new Error(`Bomb #${item.instanceId} missing occupiedPositions`);
      }
      const host = findArrowOnCell(scopeArrows, cell);
      if (!host) {
        throw new Error(`Bomb #${item.instanceId} has no host arrow on cell`);
      }
      ctx.bombs.push({
        kind: 5,
        instanceId: item.instanceId,
        layer: item.layer,
        occupiedPositions: clonePositions(item.occupiedPositions),
        time,
        zoneId,
        hostArrowId: host.instanceId,
      });
    } else if (item.kind === 13) {
      const health = item.health as number | undefined;
      if (health == null || health < 1) {
        throw new Error(`Frozen #${item.instanceId} missing health`);
      }
      const positions = clonePositions(item.occupiedPositions);
      const host = findArrowByPositions(scopeArrows, positions);
      if (!host) {
        throw new Error(`Frozen #${item.instanceId} has no matching host arrow`);
      }
      ctx.frozenOverlays.push({
        kind: 13,
        instanceId: item.instanceId,
        layer: item.layer,
        occupiedPositions: positions,
        health,
        zoneId,
        hostArrowId: host.instanceId,
      });
    } else if (item.kind === 11) {
      ctx.keys.push(parseKey(item));
    } else if (item.kind === 14) {
      ctx.shrinkPipes.push(parseShrinkPipe(item, zoneId, ctx.pipes));
    } else if (item.kind === 15) {
      ctx.toggles.push(parseToggle(item, zoneId));
    } else if (item.kind === 16) {
      ctx.controllers.push(parseController(item, zoneId, ctx));
    } else if (
      item.kind === 17 ||
      item.kind === 18 ||
      item.kind === 19 ||
      item.kind === 20 ||
      item.kind === 21 ||
      item.kind === 22 ||
      item.kind === 23
    ) {
      ctx.buffs.push(parseBuff(item, zoneId));
    } else if (item.kind === 12) {
      if (item.items) {
        collectFromItems(item.items, item.instanceId, ctx);
      }
    }
  }
}

export interface ParseLevelOptions {
  /** 编辑器画布：移动墙路径未画完时不抛错 */
  allowIncompleteMovingWalls?: boolean;
}

export function parseLevelData(id: number, data: LevelData, options?: ParseLevelOptions): GameLevel {
  if (!data.width || !data.height) {
    throw new Error("Level missing width/height");
  }
  if (!Array.isArray(data.itemModels)) {
    throw new Error("Level missing itemModels");
  }

  const arrows: ArrowItem[] = [];
  const corners: CornerItem[] = [];
  const zones: ZoneItem[] = [];
  const bundles: BundleItem[] = [];
  const pipes: PipeItem[] = [];
  const curtains: CurtainItem[] = [];
  const keys: KeyArrowItem[] = [];
  const bombs: BombItem[] = [];
  const movingWalls: MovingWallItem[] = [];
  const frozenOverlays: FrozenOverlayItem[] = [];
  const shrinkPipes: ShrinkPipeItem[] = [];
  const toggles: ToggleItem[] = [];
  const controllers: ControllerItem[] = [];
  const buffs: BuffItem[] = [];

  const topCtx: CollectCtx = {
    arrows,
    corners,
    bundles,
    pipes,
    bombs,
    frozenOverlays,
    keys,
    shrinkPipes,
    toggles,
    controllers,
    movingWalls,
    buffs,
  };

  for (const item of data.itemModels) {
    if (item.kind === 12) {
      zones.push(buildZoneItem(item));
      if (item.items) {
        collectFromItems(item.items, item.instanceId, {
          arrows,
          corners,
          bundles,
          pipes,
          bombs,
          frozenOverlays,
          keys,
          shrinkPipes,
          toggles,
          controllers,
          movingWalls,
          buffs,
        });
      }
    } else if (item.kind === 1 || item.kind === 2) {
      arrows.push(parseArrow(item, null));
    } else if (item.kind === 4) {
      corners.push(parseCorner(item, null));
    } else if (item.kind === 8) {
      bundles.push(parseBundle(item, null));
    } else if (item.kind === 3) {
      pipes.push(parsePipe(item, null));
    } else if (item.kind === 6) {
      curtains.push(parseCurtain(item));
    } else if (item.kind === 11) {
      keys.push(parseKey(item));
    } else if (item.kind === 7) {
      movingWalls.push(
        options?.allowIncompleteMovingWalls
          ? parseMovingWallForEditor(item)
          : parseMovingWall(item),
      );
    } else if (item.kind === 5) {
      const time = item.time as number | undefined;
      if (time == null) {
        throw new Error(`Bomb #${item.instanceId} missing time`);
      }
      const cell = item.occupiedPositions[0];
      if (!cell) {
        throw new Error(`Bomb #${item.instanceId} missing occupiedPositions`);
      }
      const host = findArrowOnCell(topLevelArrows(arrows), cell);
      if (!host) {
        throw new Error(`Bomb #${item.instanceId} has no host arrow on cell`);
      }
      bombs.push({
        kind: 5,
        instanceId: item.instanceId,
        layer: item.layer,
        occupiedPositions: clonePositions(item.occupiedPositions),
        time,
        zoneId: null,
        hostArrowId: host.instanceId,
      });
    } else if (item.kind === 13) {
      const health = item.health as number | undefined;
      if (health == null || health < 1) {
        throw new Error(`Frozen #${item.instanceId} missing health`);
      }
      const positions = clonePositions(item.occupiedPositions);
      const host = findArrowByPositions(topLevelArrows(arrows), positions);
      if (!host) {
        throw new Error(`Frozen #${item.instanceId} has no matching host arrow`);
      }
      frozenOverlays.push({
        kind: 13,
        instanceId: item.instanceId,
        layer: item.layer,
        occupiedPositions: positions,
        health,
        zoneId: null,
        hostArrowId: host.instanceId,
      });
    } else if (item.kind === 14) {
      topCtx.shrinkPipes.push(parseShrinkPipe(item, null, pipes));
    } else if (item.kind === 15) {
      topCtx.toggles.push(parseToggle(item, null));
    } else if (item.kind === 16) {
      topCtx.controllers.push(parseController(item, null, topCtx));
    } else if (
      item.kind === 17 ||
      item.kind === 18 ||
      item.kind === 19 ||
      item.kind === 20 ||
      item.kind === 21 ||
      item.kind === 22 ||
      item.kind === 23
    ) {
      buffs.push(parseBuff(item, null));
    }
  }

  const rush = parseRushFields(data);
  const boardMask = buildBoardMaskFromLevel(data);
  const invalidCellColors = buildInvalidCellColorMap(data);

  const seen = new Set<number>();
  for (const obj of [
    ...arrows,
    ...corners,
    ...zones,
    ...bundles,
    ...pipes,
    ...curtains,
    ...keys,
    ...bombs,
    ...movingWalls,
    ...frozenOverlays,
    ...shrinkPipes,
    ...toggles,
    ...controllers,
    ...buffs,
  ]) {
    if (seen.has(obj.instanceId)) {
      throw new Error(`Duplicate instanceId ${obj.instanceId}`);
    }
    seen.add(obj.instanceId);
  }

  return {
    id,
    width: data.width,
    height: data.height,
    name: data.name || `Level ${id}`,
    durationInSec: data.durationInSec ?? 120,
    difficulty: data.difficulty ?? 1,
    gameMode: rush.gameMode,
    spawnIntervalSec: rush.spawnIntervalSec,
    spawnPool: rush.spawnPool,
    spawnWeightAdjust: rush.spawnWeightAdjust,
    levelGoals: rush.levelGoals,
    comboEnabled: rush.comboEnabled,
    boardShape: boardMask.boardShape,
    playableCells: boardMask.playableCells,
    blackHoleCells: boardMask.blackHoleCells,
    invalidCellColors,
    arrows,
    corners,
    zones,
    bundles,
    pipes,
    curtains,
    keys,
    bombs,
    movingWalls,
    frozenOverlays,
    shrinkPipes,
    toggles,
    controllers,
    buffs,
  };
}

export function assertLoadableLevelData(data: unknown): LevelData {
  if (!data || typeof data !== "object") {
    throw new Error("无效的 JSON：根对象缺失");
  }
  const d = data as Record<string, unknown>;
  if (typeof d.width !== "number" || typeof d.height !== "number") {
    throw new Error("必填字段缺失：width / height");
  }
  if (!Array.isArray(d.itemModels)) {
    throw new Error("必填字段缺失：itemModels");
  }
  return data as LevelData;
}
