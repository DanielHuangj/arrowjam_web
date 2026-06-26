import { describe, expect, it } from "vitest";
import {
  buildReferenceLevelBlock,
  buildUserKeywordsBlock,
  getDifficultyTargets,
} from "./playability-rules.ts";
import { buildGenerateMessages } from "./generate-level.ts";
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
    expect(t.occupancyCellMin).toBe(Math.ceil(16 * 16 * 0.6));
    expect(t.occupancyCellTarget).toBe(Math.ceil(16 * 16 * 0.65));
  });

  it("scales up arrow count for 32x32", () => {
    const t = getDifficultyTargets({ ...baseForm, width: 32, height: 32, difficulty: 1 });
    expect(t.arrowCountMin).toBeGreaterThanOrEqual(24);
    expect(t.occupancyCellMin).toBe(Math.ceil(32 * 32 * 0.6));
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

describe("buildUserKeywordsBlock", () => {
  it("includes raw keywords verbatim for Phase 2", () => {
    const block = buildUserKeywordsBlock({
      ...baseForm,
      keywords: "教学关，翻转箭机制，中等难度",
    });
    expect(block).toContain("教学关，翻转箭机制，中等难度");
    expect(block).toContain("表单原文");
  });

  it("notes empty keywords", () => {
    expect(buildUserKeywordsBlock(baseForm)).toContain("未填写");
  });
});

describe("buildGenerateMessages", () => {
  it("passes original keywords before optimized prompt", () => {
    const form = { ...baseForm, keywords: "螺旋布局，先外后内" };
    const messages = buildGenerateMessages("optimized density layout", form, 1, 1);
    const user = messages.find((m) => m.role === "user")!.content;
    expect(user.indexOf("螺旋布局，先外后内")).toBeLessThan(user.indexOf("optimized density layout"));
    expect(user).toContain("以本段关键词为准");
  });
});
