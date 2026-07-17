import type { BuffItem } from "../types.ts";

/** Combo（连消）规则：仅爽快版启用 */

export const COMBO_INITIAL_WINDOW_SEC = 2;
export const COMBO_WINDOW_DECAY = 0.95;
export const COMBO_REWARD_INTERVAL = 10;

export interface ComboState {
  /** 当前连消次数；0 表示未激活 */
  count: number;
  /** 当前这一段倒计时总时长（秒） */
  windowSec: number;
  /** 当前剩余倒计时（秒） */
  remainingSec: number;
  /** 是否因连消而暂缓生成波次 */
  deferSpawn: boolean;
  /** 最近一次连消相对本窗口开始的间隔（秒），用于脉冲速度 */
  lastHitIntervalSec: number;
  /** 脉冲令牌：每次连消递增，驱动 UI 重播动画 */
  pulseToken: number;
}

export interface ComboHitResult {
  state: ComboState;
  /** 是否达到 10/20/… 应投放增益 */
  shouldSpawnReward: boolean;
}

export function createComboState(): ComboState {
  return {
    count: 0,
    windowSec: COMBO_INITIAL_WINDOW_SEC,
    remainingSec: 0,
    deferSpawn: false,
    lastHitIntervalSec: COMBO_INITIAL_WINDOW_SEC,
    pulseToken: 0,
  };
}

export function isComboActive(state: ComboState): boolean {
  return state.count > 0 && state.remainingSec > 0;
}

/** 成功消除一次（出界 / 黑洞吞噬）→ 记入连消 */
export function registerComboHit(state: ComboState): ComboHitResult {
  const prevWindow = state.count === 0 ? COMBO_INITIAL_WINDOW_SEC : state.windowSec;
  const intervalUsed =
    state.count === 0
      ? COMBO_INITIAL_WINDOW_SEC
      : Math.max(0, prevWindow - state.remainingSec);

  let nextWindow: number;
  if (state.count === 0) {
    nextWindow = COMBO_INITIAL_WINDOW_SEC;
  } else {
    nextWindow = prevWindow * COMBO_WINDOW_DECAY;
  }

  const count = state.count + 1;
  const next: ComboState = {
    count,
    windowSec: nextWindow,
    remainingSec: nextWindow,
    deferSpawn: true,
    lastHitIntervalSec: intervalUsed,
    pulseToken: state.pulseToken + 1,
  };
  return {
    state: next,
    shouldSpawnReward: count % COMBO_REWARD_INTERVAL === 0,
  };
}

export function interruptCombo(state: ComboState): ComboState {
  if (state.count === 0 && !state.deferSpawn) return state;
  return {
    ...createComboState(),
    /** 打断后由 GameState 消费 deferSpawn，再清零 */
    deferSpawn: state.deferSpawn || state.count > 0,
    pulseToken: state.pulseToken,
  };
}

export function clearComboDeferFlag(state: ComboState): ComboState {
  if (!state.deferSpawn) return state;
  return { ...state, deferSpawn: false };
}

/**
 * 推进连消倒计时。返回 timeout 时需中断。
 * 倒计时归零且有连消 → interrupt。
 */
export function tickCombo(
  state: ComboState,
  dt: number,
): { state: ComboState; timedOut: boolean } {
  if (!isComboActive(state)) {
    return { state, timedOut: false };
  }
  const remainingSec = state.remainingSec - dt;
  if (remainingSec <= 0) {
    return {
      state: interruptCombo({ ...state, remainingSec: 0 }),
      timedOut: true,
    };
  }
  return { state: { ...state, remainingSec }, timedOut: false };
}

/** 进度 1→0（满→空） */
export function comboProgress(state: ComboState): number {
  if (state.count === 0 || state.windowSec <= 0) return 0;
  return Math.max(0, Math.min(1, state.remainingSec / state.windowSec));
}

/**
 * 脉冲时长（秒）：连消间隔越短越快。
 * 基准约 0.45s，最短约 0.18s。
 */
export function comboPulseDurationSec(lastHitIntervalSec: number): number {
  const t = Math.max(0.05, Math.min(COMBO_INITIAL_WINDOW_SEC, lastHitIntervalSec));
  const normalized = t / COMBO_INITIAL_WINDOW_SEC;
  return 0.18 + normalized * 0.27;
}

export interface ComboRewardFlight {
  buff: BuffItem;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  elapsed: number;
  duration: number;
}

export interface ComboHudState {
  count: number;
  progress: number;
  pulseToken: number;
  pulseDurationSec: number;
}
