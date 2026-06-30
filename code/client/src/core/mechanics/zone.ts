import type { ArrowItem, CornerItem, Vec2, ZoneItem } from "../types.ts";
import { vecKey } from "../types.ts";
export { buildZoneItem } from "@arrowjaw/shared";

type BoardItem = { occupiedPositions: [number, number][]; zoneId: number | null };

/**
 * kind:12 子区域规则：
 * - 区域框（layer 1）始终显示
 * - 区域内箭头/角块在「覆盖该区域格子的上层物件全部消除」后才显示并参与阻挡
 * - 区域外的箭头/线条不参与该区域的揭示判定
 * - 揭示后保持显示（动画中穿过区域的箭头不触发隐藏）
 * - 覆盖箭仍在棋盘上时（含反弹动画中暂离区域格）暂不揭示，等其实际消除后再显示
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

  /** 覆盖箭：当前格或发射前原位任一占用区域格即视为仍覆盖 */
  private arrowOccupiesZoneCells(
    arrow: ArrowItem,
    cells: Set<string>,
    overlayOriginalByArrowId?: ReadonlyMap<number, Vec2[]>,
  ): boolean {
    if (arrow.occupiedPositions.some((p) => cells.has(vecKey(p)))) return true;
    const orig = overlayOriginalByArrowId?.get(arrow.instanceId);
    if (orig?.some((p) => cells.has(vecKey(p)))) return true;
    return false;
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
    overlayOriginalByArrowId?: ReadonlyMap<number, Vec2[]>,
  ): boolean {
    for (const arrow of arrows) {
      if (arrow.zoneId === zone.instanceId) continue;
      if (
        arrow.zoneId != null &&
        !this.isZoneContentRevealed(
          arrow.zoneId,
          arrows,
          corners,
          revealed,
          overlayOriginalByArrowId,
        )
      ) {
        continue;
      }
      if (this.arrowOccupiesZoneCells(arrow, zone.cells, overlayOriginalByArrowId)) {
        return true;
      }
    }
    for (const corner of corners) {
      if (corner.zoneId === zone.instanceId) continue;
      if (
        corner.zoneId != null &&
        !this.isZoneContentRevealed(
          corner.zoneId,
          arrows,
          corners,
          revealed,
          overlayOriginalByArrowId,
        )
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
    overlayOriginalByArrowId?: ReadonlyMap<number, Vec2[]>,
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

    const revealed = !this.hasOverlayOnZone(
      zone,
      arrows,
      corners,
      memo,
      overlayOriginalByArrowId,
    );
    if (revealed) this.revealedZones.add(zoneId);
    memo.set(zoneId, revealed);
    return revealed;
  }

  isArrowActive(
    arrow: ArrowItem,
    arrows: ArrowItem[],
    corners: CornerItem[],
    overlayOriginalByArrowId?: ReadonlyMap<number, Vec2[]>,
  ): boolean {
    if (arrow.zoneId == null) return true;
    return this.isZoneContentRevealed(
      arrow.zoneId,
      arrows,
      corners,
      new Map(),
      overlayOriginalByArrowId,
    );
  }

  isCornerActive(
    corner: CornerItem,
    arrows: ArrowItem[],
    corners: CornerItem[],
    overlayOriginalByArrowId?: ReadonlyMap<number, Vec2[]>,
  ): boolean {
    if (corner.zoneId == null) return true;
    return this.isZoneContentRevealed(
      corner.zoneId,
      arrows,
      corners,
      new Map(),
      overlayOriginalByArrowId,
    );
  }

  getZones(): ZoneItem[] {
    return this.zones;
  }
}
