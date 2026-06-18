import type { RawItem, ZoneItem } from "./types.ts";
import { vecKey } from "./types.ts";

export function buildZoneItem(raw: RawItem): ZoneItem {
  const arrowIds: number[] = [];
  const cornerIds: number[] = [];
  for (const item of raw.items ?? []) {
    if (item.kind === 1 || item.kind === 2) arrowIds.push(item.instanceId);
    if (item.kind === 4) cornerIds.push(item.instanceId);
  }
  const xs = raw.occupiedPositions.map((p) => p[0]);
  const ys = raw.occupiedPositions.map((p) => p[1]);
  return {
    kind: 12,
    instanceId: raw.instanceId,
    layer: 1,
    occupiedPositions: raw.occupiedPositions.map(([x, y]) => [x, y]),
    cells: new Set(raw.occupiedPositions.map((p) => vecKey(p))),
    arrowIds,
    cornerIds,
    bounds: {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    },
  };
}
