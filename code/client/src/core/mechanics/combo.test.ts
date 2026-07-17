import { describe, expect, it } from "vitest";
import {
  COMBO_INITIAL_WINDOW_SEC,
  COMBO_WINDOW_DECAY,
  clearComboDeferFlag,
  comboProgress,
  createComboState,
  interruptCombo,
  isComboActive,
  registerComboHit,
  tickCombo,
} from "./combo.ts";

describe("combo", () => {
  it("starts at count 1 with initial window", () => {
    const { state, shouldSpawnReward } = registerComboHit(createComboState());
    expect(state.count).toBe(1);
    expect(state.windowSec).toBe(COMBO_INITIAL_WINDOW_SEC);
    expect(state.remainingSec).toBe(COMBO_INITIAL_WINDOW_SEC);
    expect(shouldSpawnReward).toBe(false);
    expect(isComboActive(state)).toBe(true);
  });

  it("shrinks window by 5% each subsequent hit", () => {
    let state = createComboState();
    ({ state } = registerComboHit(state));
    ({ state } = registerComboHit(state));
    expect(state.count).toBe(2);
    expect(state.windowSec).toBeCloseTo(COMBO_INITIAL_WINDOW_SEC * COMBO_WINDOW_DECAY, 6);
    ({ state } = registerComboHit(state));
    expect(state.windowSec).toBeCloseTo(
      COMBO_INITIAL_WINDOW_SEC * COMBO_WINDOW_DECAY * COMBO_WINDOW_DECAY,
      6,
    );
  });

  it("requests reward every 10 hits", () => {
    let state = createComboState();
    for (let i = 0; i < 9; i++) {
      const r = registerComboHit(state);
      state = r.state;
      expect(r.shouldSpawnReward).toBe(false);
    }
    const tenth = registerComboHit(state);
    expect(tenth.state.count).toBe(10);
    expect(tenth.shouldSpawnReward).toBe(true);
  });

  it("times out and interrupts", () => {
    let { state } = registerComboHit(createComboState());
    const t1 = tickCombo(state, 1);
    expect(t1.timedOut).toBe(false);
    expect(comboProgress(t1.state)).toBeCloseTo(0.5, 5);
    const t2 = tickCombo(t1.state, 2);
    expect(t2.timedOut).toBe(true);
    expect(t2.state.count).toBe(0);
    expect(t2.state.deferSpawn).toBe(true);
  });

  it("interrupt clears count but keeps defer flag until cleared", () => {
    let { state } = registerComboHit(createComboState());
    state = interruptCombo(state);
    expect(state.count).toBe(0);
    expect(state.deferSpawn).toBe(true);
    state = clearComboDeferFlag(state);
    expect(state.deferSpawn).toBe(false);
  });
});
