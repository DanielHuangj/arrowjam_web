import { describe, expect, it } from "vitest";
import { buildReferenceLevelBlock, getDifficultyTargets } from "./playability-rules.ts";
import type { GenerationForm } from "../types.ts";

const baseForm: GenerationForm = {
  prefix: "test",
  width: 16,
  height: 16,
  durationInSec: 150,
  difficulty: 1,
  levelKind: 2,
  count: 1,
  allowedKinds: [1],
  keywords: "",
};

describe("getDifficultyTargets", () => {
  it("returns Normal defaults for 16x16", () => {
    const t = getDifficultyTargets(baseForm);
    expect(t.arrowCountMin).toBeGreaterThanOrEqual(4);
    expect(t.arrowCountMax).toBeGreaterThanOrEqual(12);
    expect(t.edgeArrowMin).toBe(2);
  });

  it("scales up arrow count for 32x32", () => {
    const t = getDifficultyTargets({ ...baseForm, width: 32, height: 32, difficulty: 1 });
    expect(t.arrowCountMin).toBeGreaterThanOrEqual(24);
    expect(t.occupancyCellMin).toBeGreaterThanOrEqual(200);
  });

  it("suggests higher duration for Hard with mechanisms", () => {
    const plain = getDifficultyTargets({ ...baseForm, difficulty: 2 });
    const rich = getDifficultyTargets({
      ...baseForm,
      difficulty: 2,
      allowedKinds: [1, 2, 12],
    });
    expect(rich.suggestedDurationMin).toBeGreaterThan(plain.suggestedDurationMin);
  });

  it("uses 16x16 reference for 20x20 kind1-only boards", () => {
    const block = buildReferenceLevelBlock({
      ...baseForm,
      width: 20,
      height: 20,
      allowedKinds: [1],
    });
    expect(block).toContain("16×16");
    expect(block).toContain('"width": 16');
    expect(block).toContain('"instanceId": 12');
  });
});
