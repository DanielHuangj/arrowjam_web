import { describe, expect, it, beforeEach, vi } from "vitest";
import { loadAiGenFormPrefs, saveAiGenFormPrefs } from "./ai-form-prefs.ts";

function createLocalStorageMock(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe("ai-form-prefs", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorageMock());
  });

  it("round-trips form prefs via localStorage", () => {
    saveAiGenFormPrefs({
      prefix: "demo",
      width: 12,
      height: 12,
      durationInSec: 90,
      count: 3,
      difficulty: 2,
      levelKind: 1,
      allowedKinds: [1, 2],
      keywords: "tutorial",
    });
    const loaded = loadAiGenFormPrefs();
    expect(loaded.prefix).toBe("demo");
    expect(loaded.width).toBe(12);
    expect(loaded.allowedKinds).toEqual(expect.arrayContaining([1, 2]));
  });

  it("clamps invalid saved values", () => {
    saveAiGenFormPrefs({
      prefix: "a",
      width: 2,
      height: 999,
      durationInSec: 0,
      count: 99,
      difficulty: 9 as 1,
      levelKind: 5,
      allowedKinds: [1, 99],
      keywords: "",
    });
    const loaded = loadAiGenFormPrefs();
    expect(loaded.width).toBe(4);
    expect(loaded.height).toBe(255);
    expect(loaded.count).toBe(20);
    expect(loaded.allowedKinds).toEqual([1]);
  });

  it("persists optional base level json", () => {
    const baseJson = JSON.stringify({
      width: 12,
      height: 12,
      name: "base",
      durationInSec: 120,
      difficulty: 1,
      itemModels: [{ kind: 1, instanceId: 1, layer: 2, direction: 3, colorId: 1, occupiedPositions: [[0, 0]] }],
    });
    saveAiGenFormPrefs({
      prefix: "fill",
      width: 12,
      height: 12,
      durationInSec: 120,
      count: 1,
      difficulty: 1,
      levelKind: 2,
      allowedKinds: [1],
      keywords: "",
      baseLevelJson: baseJson,
      baseFileName: "demo.json",
    });
    const loaded = loadAiGenFormPrefs();
    expect(loaded.baseFileName).toBe("demo.json");
    expect(loaded.baseLevelJson).toBe(baseJson);
  });
});
