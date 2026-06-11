import type { ArrowItem, CornerItem, ZoneItem } from "../types.ts";
import { vecKey } from "../types.ts";

type BoardItem = { occupiedPositions: [number, number][]; zoneId: number | null };

/**
 * kind:12 子区域规则：
 * - 区域框（layer 1）始终显示
 * - 区域内箭头/角块在「覆盖该区域格子的上层物件全部消除」后才显示并参与阻挡
 * - 区域外的箭头/线条不参与该区域的揭示判定
 * - 揭示后保持显示（动画中穿过区域的箭头不触发隐藏）
 * - 最后一个覆盖物件仍在移除动画中时暂不揭示，等其从棋盘移除后再显示
 */
export class ZoneManager {
  /** 已揭示的子区域，揭示后不再隐藏 */
  private revealedZones = new Set<number>();

  constructor(private zones: ZoneItem[]) {
    this.zones = [...zones].sort((a, b) => a.instanceId - b.instanceId);
  }

  private occupiesZoneCells(item: BoardItem, cells: Set<string>): boolean {
    return item.occupiedPositions.some((p) => cells.has(vecKey(p)));
  }

  /**
   * 某子区域是否仍有「覆盖层」物件占用其格子。
   * 排除：本区域未揭示的内部内容；其他区域未揭示的内部内容。
   */
  private hasOverlayOnZone(
    zone: ZoneItem,
    arrows: ArrowItem[],
    corners: CornerItem[],
    revealed: Map<number, boolean>,
  ): boolean {
    for (const arrow of arrows) {
      if (arrow.zoneId === zone.instanceId) continue;
      if (
        arrow.zoneId != null &&
        !this.isZoneContentRevealed(arrow.zoneId, arrows, corners, revealed)
      ) {
        continue;
      }
      if (this.occupiesZoneCells(arrow, zone.cells)) return true;
    }
    for (const corner of corners) {
      if (corner.zoneId === zone.instanceId) continue;
      if (
        corner.zoneId != null &&
        !this.isZoneContentRevealed(corner.zoneId, arrows, corners, revealed)
      ) {
        continue;
      }
      if (this.occupiesZoneCells(corner, zone.cells)) return true;
    }
    return false;
  }

  /** 指定子区域内容是否已揭示 */
  isZoneContentRevealed(
    zoneId: number,
    arrows: ArrowItem[],
    corners: CornerItem[],
    memo = new Map<number, boolean>(),
  ): boolean {
    if (this.revealedZones.has(zoneId)) {
      memo.set(zoneId, true);
      return true;
    }
    if (memo.has(zoneId)) return memo.get(zoneId)!;

    const zone = this.zones.find((z) => z.instanceId === zoneId);
    if (!zone) {
      memo.set(zoneId, true);
      return true;
    }

    // 嵌套/交叉子区域会互相查询揭示状态，先入 memo 打破循环
    memo.set(zoneId, false);

    const revealed = !this.hasOverlayOnZone(zone, arrows, corners, memo);
    if (revealed) this.revealedZones.add(zoneId);
    memo.set(zoneId, revealed);
    return revealed;
  }

  isArrowActive(
    arrow: ArrowItem,
    arrows: ArrowItem[],
    corners: CornerItem[],
  ): boolean {
    if (arrow.zoneId == null) return true;
    return this.isZoneContentRevealed(arrow.zoneId, arrows, corners);
  }

  isCornerActive(
    corner: CornerItem,
    arrows: ArrowItem[],
    corners: CornerItem[],
  ): boolean {
    if (corner.zoneId == null) return true;
    return this.isZoneContentRevealed(corner.zoneId, arrows, corners);
  }

  getZones(): ZoneItem[] {
    return this.zones;
  }
}

export function buildZoneItem(raw: {
  instanceId: number;
  occupiedPositions: [number, number][];
  items?: { kind: number; instanceId: number }[];
}): ZoneItem {
  const cells = new Set(raw.occupiedPositions.map((p) => vecKey(p)));
  const arrowIds: number[] = [];
  const cornerIds: number[] = [];
  for (const item of raw.items ?? []) {
    if (item.kind === 1) arrowIds.push(item.instanceId);
    if (item.kind === 4) cornerIds.push(item.instanceId);
  }
  const xs = raw.occupiedPositions.map((p) => p[0]);
  const ys = raw.occupiedPositions.map((p) => p[1]);
  return {
    kind: 12,
    instanceId: raw.instanceId,
    layer: 1,
    occupiedPositions: raw.occupiedPositions.map(([x, y]) => [x, y]),
    cells,
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
