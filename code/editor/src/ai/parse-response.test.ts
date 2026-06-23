import { describe, expect, it } from "vitest";
import { extractJsonFromLlm, extractJsonString } from "./parse-response.ts";

describe("extractJsonFromLlm", () => {
  it("parses fenced json", () => {
    const text = '说明\n```json\n{"a":1}\n```\n';
    expect(extractJsonFromLlm(text)).toEqual({ a: 1 });
  });

  it("parses bare json object", () => {
    expect(extractJsonFromLlm('{"width":20}')).toEqual({ width: 20 });
  });

  it("extracts json from surrounding text", () => {
    const text = 'Here is the level:\n{"width":12,"height":12}\nDone.';
    expect(extractJsonFromLlm(text)).toEqual({ width: 12, height: 12 });
  });

  it("extractJsonString returns formatted json", () => {
    const out = extractJsonString('```json\n{"x":1}\n```');
    expect(JSON.parse(out)).toEqual({ x: 1 });
  });

  it("adds truncation hint on malformed long json", () => {
    const broken = '{"new_itemModels":[' + "1,".repeat(5000);
    expect(() => extractJsonFromLlm(broken)).toThrow(/截断|maxTokens/);
  });
});
