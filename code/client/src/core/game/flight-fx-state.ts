import type { Vec2 } from "../types.ts";

export const LAUNCH_CLICK_FX_DURATION = 0.52;
export const DOT_PULSE_FX_DURATION = 0.35;

const DOT_PULSE_MAX_SCALE = 1.42;

export interface LaunchClickFxState {
  x: number;
  y: number;
  colorId: number;
  elapsed: number;
}

export interface DotPulseFxState {
  cell: Vec2;
  elapsed: number;
}

export function dotPulseScale(elapsed: number): number {
  const t = Math.min(1, elapsed / DOT_PULSE_FX_DURATION);
  if (t < 0.45) {
    return 1 + (DOT_PULSE_MAX_SCALE - 1) * (t / 0.45);
  }
  return (
    DOT_PULSE_MAX_SCALE -
    (DOT_PULSE_MAX_SCALE - 1) * ((t - 0.45) / 0.55)
  );
}
