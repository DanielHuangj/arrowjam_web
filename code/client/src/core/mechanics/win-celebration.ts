/** 爽快版通关庆祝流程常量与 HUD 状态 */

export const BINGO_DURATION_SEC = 1.05;
export const CELEBRATION_TRIGGER_STAGGER_SEC = 0.2;
export const CELEBRATION_FLIGHT_DURATION_SEC = 0.55;
export const CONFETTI_DURATION_SEC = 1.0;
export const CELEBRATION_MAX_BUFFS = 10;
export const CELEBRATION_BUFF_KINDS = [17, 18, 23] as const;

export type WinCelebrationStep =
  | "bingo"
  | "flying"
  | "triggering"
  | "sweeping"
  | "confetti"
  | "done";

/** 玩家可点击主动触发的增益（排除气球 / 黑洞） */
export function isPlayerTriggerableBuffKind(kind: number): boolean {
  return kind !== 20 && kind !== 21;
}

export interface EnergyOrbHudState {
  visible: boolean;
  fill: number;
  rippleToken: number;
}

export interface BingoHudState {
  active: boolean;
  /** 每次开庆祝递增，驱动 CSS 重播 */
  token: number;
}

export interface ConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  w: number;
  h: number;
  color: string;
}

export interface ConfettiState {
  elapsed: number;
  duration: number;
  particles: ConfettiParticle[];
}

const CONFETTI_COLORS = [
  "#ff6b8a",
  "#ffd43b",
  "#69db7c",
  "#74c0fc",
  "#b197fc",
  "#ffa94d",
  "#ff8787",
];

export function createConfettiState(
  boardW: number,
  boardH: number,
  count = 90,
  rng: () => number = Math.random,
): ConfettiState {
  const particles: ConfettiParticle[] = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: rng() * boardW,
      y: -rng() * boardH * 0.35,
      vx: (rng() - 0.5) * 120,
      vy: 80 + rng() * 160,
      rot: rng() * Math.PI * 2,
      spin: (rng() - 0.5) * 10,
      w: 4 + rng() * 6,
      h: 6 + rng() * 10,
      color: CONFETTI_COLORS[Math.floor(rng() * CONFETTI_COLORS.length)]!,
    });
  }
  return {
    elapsed: 0,
    duration: CONFETTI_DURATION_SEC,
    particles,
  };
}

export function tickConfettiState(state: ConfettiState, dt: number): ConfettiState {
  const particles = state.particles.map((p) => ({
    ...p,
    x: p.x + p.vx * dt,
    y: p.y + p.vy * dt,
    vy: p.vy + 220 * dt,
    rot: p.rot + p.spin * dt,
    vx: p.vx * (1 - 0.4 * dt),
  }));
  return {
    ...state,
    elapsed: state.elapsed + dt,
    particles,
  };
}
