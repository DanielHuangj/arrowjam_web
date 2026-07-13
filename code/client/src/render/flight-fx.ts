import { vecKey } from "../core/types.ts";
import {
  dotPulseScale,
  LAUNCH_CLICK_FX_DURATION,
  type DotPulseFxState,
  type LaunchClickFxState,
} from "../core/game/flight-fx-state.ts";
import {
  CELL,
  COLORS,
  CORNER_SPRING_COLOR,
  STEP,
  THEME,
  TRACE_DOT_COLOR,
  TRACE_DOT_RADIUS,
  colorForId,
} from "./colors.ts";

export type { DotPulseFxState, LaunchClickFxState } from "../core/game/flight-fx-state.ts";
export { LAUNCH_CLICK_FX_DURATION, DOT_PULSE_FX_DURATION } from "../core/game/flight-fx-state.ts";

function cellCenter(x: number, y: number): [number, number] {
  return [x * STEP + CELL / 2, y * STEP + CELL / 2];
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function drawEmptyCellDotsWithPulse(
  ctx: CanvasRenderingContext2D,
  board: { width: number; height: number },
  occupied: Set<string> | undefined,
  dotPulses: readonly DotPulseFxState[] | undefined,
  playableCells?: Set<string>,
  blackHoleCells?: Set<string>,
): void {
  const pulseByKey = new Map<string, number>();
  for (const pulse of dotPulses ?? []) {
    pulseByKey.set(vecKey(pulse.cell), dotPulseScale(pulse.elapsed));
  }

  ctx.fillStyle = TRACE_DOT_COLOR;
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      const key = vecKey([x, y]);
      if (playableCells && !playableCells.has(key)) continue;
      if (blackHoleCells?.has(key)) continue;
      if (occupied?.has(key)) continue;
      const [cx, cy] = cellCenter(x, y);
      const scale = pulseByKey.get(key) ?? 1;
      ctx.beginPath();
      ctx.arc(cx, cy, TRACE_DOT_RADIUS * scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawLaunchClickEffects(
  ctx: CanvasRenderingContext2D,
  effects: readonly LaunchClickFxState[],
): void {
  for (const fx of effects) {
    drawLaunchClickEffect(ctx, fx);
  }
}

const DUST_PALETTE = [
  COLORS[1]!,
  COLORS[2]!,
  COLORS[3]!,
  COLORS[4]!,
  COLORS[6]!,
  COLORS[7]!,
  COLORS[8]!,
  THEME.accent,
  THEME.warning,
  THEME.success,
  CORNER_SPRING_COLOR,
] as const;

function dustColor(index: number, colorId: number): string {
  return DUST_PALETTE[(index * 5 + colorId) % DUST_PALETTE.length]!;
}

function drawLaunchClickEffect(
  ctx: CanvasRenderingContext2D,
  fx: LaunchClickFxState,
): void {
  const t = fx.elapsed / LAUNCH_CLICK_FX_DURATION;
  if (t >= 1) return;

  const fade = (1 - t) * (1 - t * 0.4);
  const baseColor = colorForId(fx.colorId);
  const burst = Math.max(0, 1 - t * 6);

  ctx.save();

  if (burst > 0) {
    ctx.globalCompositeOperation = "lighter";
    const flashR = 6 + burst * 10;
    const flash = ctx.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, flashR);
    flash.addColorStop(0, hexToRgba("#FFFFFF", burst * 0.45));
    flash.addColorStop(0.5, hexToRgba(baseColor, burst * 0.35));
    flash.addColorStop(1, hexToRgba(baseColor, 0));
    ctx.fillStyle = flash;
    ctx.beginPath();
    ctx.arc(fx.x, fx.y, flashR, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }

  const puffLayers = [
    { scale: 1, alpha: 0.38, expand: 22, colorIdx: 0 },
    { scale: 0.78, alpha: 0.32, expand: 18, colorIdx: 3 },
    { scale: 0.55, alpha: 0.28, expand: 14, colorIdx: 6 },
  ];
  for (const cfg of puffLayers) {
    const color = dustColor(cfg.colorIdx, fx.colorId);
    const puffR = (5 + t * cfg.expand) * cfg.scale;
    const grad = ctx.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, puffR);
    grad.addColorStop(0, hexToRgba(color, fade * cfg.alpha));
    grad.addColorStop(0.55, hexToRgba(color, fade * cfg.alpha * 0.5));
    grad.addColorStop(1, hexToRgba(color, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(fx.x, fx.y, puffR, 0, Math.PI * 2);
    ctx.fill();
  }

  const particleCount = 24;
  for (let i = 0; i < particleCount; i++) {
    const angle =
      (i / particleCount) * Math.PI * 2 +
      fx.colorId * 0.41 +
      t * 1.1 +
      Math.sin(i * 2.3) * 0.35;
    const speed = 12 + (i % 7) * 3 + (i % 3) * 2;
    const wobble = Math.sin(fx.elapsed * 16 + i * 1.9) * (2 + t * 2.5);
    const dist = 3 + t * speed + wobble;
    const px = fx.x + Math.cos(angle) * dist;
    const py = fx.y + Math.sin(angle) * dist;
    const color = dustColor(i + 1, fx.colorId);
    const sizeWave = 0.7 + ((i * 17 + fx.colorId) % 5) * 0.18;
    const r = (1 - t * 0.88) * (2.4 + (i % 5) * 1.1) * sizeWave;

    ctx.fillStyle = hexToRgba(color, fade * (0.78 + (i % 3) * 0.08));
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const wispCount = 12;
  for (let i = 0; i < wispCount; i++) {
    const phase = i * 1.37 + fx.colorId;
    const angle = phase * 2.1 + t * 0.55;
    const dist = 4 + t * (16 + (i % 4) * 5) + Math.cos(fx.elapsed * 9 + phase) * 3;
    const px = fx.x + Math.cos(angle) * dist;
    const py = fx.y + Math.sin(angle) * dist;
    const color = dustColor(i + particleCount + 2, fx.colorId);
    const r = (1 - t) * (1.2 + (i % 3) * 0.7);

    ctx.fillStyle = hexToRgba(color, fade * 0.62);
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
