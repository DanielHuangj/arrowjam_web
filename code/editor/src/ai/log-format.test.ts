import { describe, expect, it } from "vitest";
import { appendFixAttemptLog, appendGeneratePromptLog, appendSanitizerLog, formatChatMessagesForLog } from "./log-format.ts";

describe("log-format", () => {
  it("formats chat messages with role headers", () => {
    const out = formatChatMessagesForLog([
      { role: "system", content: "sys" },
      { role: "user", content: "usr" },
    ]);
    expect(out).toContain("[system]\nsys");
    expect(out).toContain("[user]\nusr");
  });

  it("appendGeneratePromptLog adds delimited blocks", () => {
    const lines: string[] = [];
    appendGeneratePromptLog(lines, "001", "opt prompt", [
      { role: "user", content: "generate body" },
    ]);
    const text = lines.join("\n");
    expect(text).toContain("seq=001 GENERATE_PROMPT optimized_prompt");
    expect(text).toContain("opt prompt");
    expect(text).toContain("seq=001 GENERATE_PROMPT messages");
    expect(text).toContain("[user]\ngenerate body");
    expect(text).toContain("seq=001 GENERATE_PROMPT end");
  });

  it("appendFixAttemptLog records attempt and issues", () => {
    const lines: string[] = [];
    appendFixAttemptLog(lines, "004", 1, [
      { id: "AI-OVERLAP", severity: "error", message: "overlap" },
    ]);
    expect(lines[0]).toContain("seq=004 FIX_ATTEMPT 1");
    expect(lines[0]).toContain("AI-OVERLAP");
  });

  it("appendSanitizerLog records actions when changed", () => {
    const lines: string[] = [];
    appendSanitizerLog(lines, "004", ["AI-DENSITY added #13"], true);
    expect(lines[0]).toContain("seq=004 SANITIZE");
    expect(lines[0]).toContain("AI-DENSITY");
  });
});
