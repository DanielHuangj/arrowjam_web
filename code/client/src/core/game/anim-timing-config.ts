export interface AnimTimingConfig {
  /** 初始每格步进间隔（毫秒），越小初始速度越快 */
  baseIntervalMs: number;
  /** 最高速度相对初始速度的倍数 */
  maxSpeedMultiplier: number;
  /** 从初始速度线性加速到上限所需的飞行格数，越小加速越快 */
  accelSteps: number;
}

export function initialSpeedCellsPerSec(config: AnimTimingConfig): number {
  return 1000 / config.baseIntervalMs;
}

export function maxSpeedCellsPerSec(config: AnimTimingConfig): number {
  return initialSpeedCellsPerSec(config) * config.maxSpeedMultiplier;
}

export function configFromSpeeds(
  initialCellsPerSec: number,
  maxCellsPerSec: number,
  accelSteps: number,
): AnimTimingConfig {
  const initial = Math.max(1, initialCellsPerSec);
  const max = Math.max(initial, maxCellsPerSec);
  return {
    baseIntervalMs: roundTo(1000 / initial, 2),
    maxSpeedMultiplier: roundTo(max / initial, 3),
    accelSteps: clampInt(accelSteps, 1, 80),
  };
}

export function clampAnimTimingConfig(config: AnimTimingConfig): AnimTimingConfig {
  const initial = Math.max(1, initialSpeedCellsPerSec(config));
  const max = Math.max(initial, maxSpeedCellsPerSec(config));
  return configFromSpeeds(initial, max, config.accelSteps);
}

function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}
