import type { LaunchMode } from "../types.ts";
import type { GameState } from "./game-state.ts";
import savedConfig from "./anim-timing.config.json";
import {
  clampAnimTimingConfig,
  type AnimTimingConfig,
} from "./anim-timing-config.ts";

const fileDefaults = clampAnimTimingConfig(savedConfig as AnimTimingConfig);

/** 正式游戏参数（配置文件 / 保存按钮写入） */
let savedDefaults: AnimTimingConfig = { ...fileDefaults };
/** 当前实际用于步进计算的参数 */
let runtimeConfig: AnimTimingConfig = { ...fileDefaults };
/** 编辑器试玩中：允许临时调参，退出后丢弃 */
let playPreviewActive = false;

/** @deprecated 使用 getSavedAnimTimingConfig().baseIntervalMs */
export const ANIM_BASE_INTERVAL_MS = savedDefaults.baseIntervalMs;

/** @deprecated 使用 getSavedAnimTimingConfig().maxSpeedMultiplier */
export const ANIM_MAX_SPEED_MULTIPLIER = savedDefaults.maxSpeedMultiplier;

/** @deprecated 使用 getSavedAnimTimingConfig().accelSteps */
export const ANIM_ACCEL_STEPS = savedDefaults.accelSteps;

export function getAnimTimingConfig(): Readonly<AnimTimingConfig> {
  return runtimeConfig;
}

/** 正式游戏使用的已保存参数 */
export function getSavedAnimTimingConfig(): Readonly<AnimTimingConfig> {
  return savedDefaults;
}

export function isAnimTimingPlayPreview(): boolean {
  return playPreviewActive;
}

/** @deprecated 试玩请用 beginAnimTimingPlayPreview / setAnimTimingPlayPreview */
export function setAnimTimingConfig(partial: Partial<AnimTimingConfig>): void {
  runtimeConfig = clampAnimTimingConfig({ ...runtimeConfig, ...partial });
}

export function resetAnimTimingConfig(): void {
  runtimeConfig = { ...savedDefaults };
}

/** 进入编辑器试玩：恢复为正式参数，此后可调临时预览值 */
export function beginAnimTimingPlayPreview(): void {
  playPreviewActive = true;
  runtimeConfig = { ...savedDefaults };
}

/** 退出编辑器试玩：丢弃临时参数，恢复正式参数 */
export function endAnimTimingPlayPreview(): void {
  playPreviewActive = false;
  runtimeConfig = { ...savedDefaults };
}

/** 试玩期间临时调参（不影响正式参数，除非点击保存） */
export function setAnimTimingPlayPreview(partial: Partial<AnimTimingConfig>): void {
  if (!playPreviewActive) return;
  runtimeConfig = clampAnimTimingConfig({ ...runtimeConfig, ...partial });
}

/** 保存成功后或从配置文件加载：更新正式参数 */
export function applySavedAnimTimingConfig(config: AnimTimingConfig): void {
  const next = clampAnimTimingConfig(config);
  savedDefaults = next;
  runtimeConfig = { ...next };
}

/** 编辑器开发服：从磁盘重新读取正式参数 */
export async function reloadOfficialAnimTimingConfig(): Promise<void> {
  const res = await fetch("/api/dev/anim-timing-config");
  if (!res.ok) {
    throw new Error(await res.text());
  }
  const body = (await res.json()) as { config: AnimTimingConfig };
  applySavedAnimTimingConfig(body.config);
}

export function getAnimStepIntervalMs(
  flightStepCount: number,
  mode: LaunchMode,
  reversing: boolean,
): number {
  const { baseIntervalMs, maxSpeedMultiplier, accelSteps } = runtimeConfig;

  if (mode === "vanish") return baseIntervalMs;
  if (mode === "bump" && reversing) return baseIntervalMs;

  const speed = Math.min(
    maxSpeedMultiplier,
    1 +
      (flightStepCount / accelSteps) * (maxSpeedMultiplier - 1),
  );
  return baseIntervalMs / speed;
}

/** 按真实时间推进发射动画（每条箭独立累积步进时间） */
export function tickGameAnimation(gs: GameState, dtMs: number): void {
  if (gs.phase !== "animating" && gs.phase !== "celebrating") return;

  const maxStepsPerAnim = 256;

  for (const anim of [...gs.animations]) {
    if (!gs.animations.includes(anim)) continue;

    anim.stepAccumMs += dtMs;
    let steps = 0;
    while (
      steps < maxStepsPerAnim &&
      (gs.phase === "animating" || gs.phase === "celebrating") &&
      gs.animations.includes(anim)
    ) {
      const interval = getAnimStepIntervalMs(
        anim.flightStepCount,
        anim.mode,
        anim.reversing,
      );
      if (anim.stepAccumMs < interval) break;

      anim.stepAccumMs -= interval;
      gs.advanceOneAnimation(anim);
      steps += 1;
    }
  }

  gs.recoverAnimationState();
}

if (import.meta.hot) {
  import.meta.hot.accept("./anim-timing.config.json", (mod) => {
    if (mod?.default) {
      applySavedAnimTimingConfig(mod.default as AnimTimingConfig);
    }
  });
}
