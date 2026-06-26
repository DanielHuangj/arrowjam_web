import type { LaunchMode } from "../types.ts";
import type { GameState } from "./game-state.ts";

/** 箭头初始每格步进间隔（毫秒） */
export const ANIM_BASE_INTERVAL_MS = 40;

/** 飞行速度上限：相对初始速度的倍数 */
export const ANIM_MAX_SPEED_MULTIPLIER = 4;

/** 从初始速度线性加速到上限所需的飞行格数 */
export const ANIM_ACCEL_STEPS = 12;

export function getAnimStepIntervalMs(
  flightStepCount: number,
  mode: LaunchMode,
  reversing: boolean,
): number {
  if (mode === "vanish") return ANIM_BASE_INTERVAL_MS;
  if (mode === "bump" && reversing) return ANIM_BASE_INTERVAL_MS;

  const speed = Math.min(
    ANIM_MAX_SPEED_MULTIPLIER,
    1 +
      (flightStepCount / ANIM_ACCEL_STEPS) *
        (ANIM_MAX_SPEED_MULTIPLIER - 1),
  );
  return ANIM_BASE_INTERVAL_MS / speed;
}

/** 按真实时间推进发射动画，返回更新后的 accum（毫秒） */
export function tickGameAnimation(
  gs: GameState,
  dtMs: number,
  accum: number,
): number {
  if (gs.phase !== "animating") return accum;

  accum += dtMs;
  while (gs.phase === "animating") {
    const interval = gs.getAnimStepIntervalMs();
    if (accum < interval) break;
    gs.advanceAnimation();
    accum -= interval;
    if (gs.phase !== "animating") {
      return 0;
    }
  }
  gs.recoverAnimationState();
  return accum;
}
