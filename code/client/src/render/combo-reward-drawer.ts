import type { ComboRewardFlight } from "../core/mechanics/combo.ts";
import { drawBuff } from "./mechanics-drawer.ts";
import { STEP } from "./colors.ts";

/** 从 combo 字样飞向落点格子：由小变大 */
export function drawComboRewardFlights(
  ctx: CanvasRenderingContext2D,
  flights: readonly ComboRewardFlight[],
): void {
  for (const flight of flights) {
    const t = Math.min(1, Math.max(0, flight.elapsed / flight.duration));
    const ease = 1 - (1 - t) ** 2;
    const x = flight.fromX + (flight.toX - flight.fromX) * ease;
    const y = flight.fromY + (flight.toY - flight.fromY) * ease;
    const scale = 0.2 + 0.8 * ease;
    const cell = flight.buff.occupiedPositions[0];
    if (!cell) continue;
    // drawBuff 按格子中心绘制；临时改坐标到插值像素中心
    const fakeBuff = {
      ...flight.buff,
      occupiedPositions: [[x / STEP - 0.5, y / STEP - 0.5] as [number, number]],
    };
    drawBuff(ctx, fakeBuff, STEP, 1, { spawnScale: scale });
  }
}
