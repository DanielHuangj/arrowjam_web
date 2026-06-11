import type {
  ArrowItem,
  BundleItem,
  CornerItem,
  CurtainItem,
  GameLevel,
  KeyArrowItem,
  LevelData,
  PipeItem,
  RawItem,
  ZoneItem,
} from "../types.ts";
import { buildZoneItem } from "../mechanics/zone.ts";

function parseCorner(item: RawItem, zoneId: number | null): CornerItem {
  const d1 = item.direction1 as [number, number] | undefined;
  const d2 = item.direction2 as [number, number] | undefined;
  if (!d1 || !d2) {
    throw new Error(`Corner #${item.instanceId} missing direction1/2`);
  }
  return {
    kind: 4,
    instanceId: item.instanceId,
    layer: item.layer,
    occupiedPositions: item.occupiedPositions.map(([x, y]) => [x, y]),
    direction1: d1,
    direction2: d2,
    zoneId,
  };
}

function parseBundle(item: RawItem, zoneId: number | null): BundleItem {
  return {
    kind: 8,
    instanceId: item.instanceId,
    layer: item.layer,
    occupiedPositions: item.occupiedPositions.map(([x, y]) => [x, y]),
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
    occupiedPositions: item.occupiedPositions.map(([x, y]) => [x, y]),
    health,
    order: (item.order as number) ?? 0,
  };
}

function parseKey(item: RawItem): KeyArrowItem {
  return {
    kind: 11,
    instanceId: item.instanceId,
    layer: item.layer,
    occupiedPositions: item.occupiedPositions.map(([x, y]) => [x, y]),
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
    occupiedPositions: item.occupiedPositions.map(([x, y]) => [x, y]),
    health,
    passes: passes.map((p) => ({
      position: [p.position[0], p.position[1]],
      directions: p.directions.map(([x, y]) => [x, y] as [number, number]),
    })),
    healthViewPathIndex: (item.healthViewPathIndex as number) ?? 0,
    zoneId,
  };
}

function collectFromItems(
  items: RawItem[],
  zoneId: number | null,
  arrows: ArrowItem[],
  corners: CornerItem[],
  bundles: BundleItem[],
  pipes: PipeItem[],
): void {
  for (const item of items) {
    if (item.kind === 1) {
      if (item.direction == null || item.colorId == null) {
        throw new Error(`Arrow #${item.instanceId} missing direction/colorId`);
      }
      arrows.push({
        kind: 1,
        instanceId: item.instanceId,
        layer: item.layer,
        occupiedPositions: item.occupiedPositions.map(([x, y]) => [x, y]),
        direction: item.direction,
        colorId: item.colorId,
        zoneId,
      });
    } else if (item.kind === 4) {
      corners.push(parseCorner(item, zoneId));
    } else if (item.kind === 8) {
      bundles.push(parseBundle(item, zoneId));
    } else if (item.kind === 3) {
      pipes.push(parsePipe(item, zoneId));
    } else if (item.kind === 12) {
      if (item.items) {
        collectFromItems(
          item.items,
          item.instanceId,
          arrows,
          corners,
          bundles,
          pipes,
        );
      }
    }
  }
}

export function parseLevelData(id: number, data: LevelData): GameLevel {
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

  for (const item of data.itemModels) {
    if (item.kind === 12) {
      zones.push(buildZoneItem(item));
      if (item.items) {
        collectFromItems(
          item.items,
          item.instanceId,
          arrows,
          corners,
          bundles,
          pipes,
        );
      }
    } else if (item.kind === 1) {
      collectFromItems([item], null, arrows, corners, bundles, pipes);
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
    }
  }

  const seen = new Set<number>();
  for (const obj of [
    ...arrows,
    ...corners,
    ...zones,
    ...bundles,
    ...pipes,
    ...curtains,
    ...keys,
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
    arrows,
    corners,
    zones,
    bundles,
    pipes,
    curtains,
    keys,
  };
}
