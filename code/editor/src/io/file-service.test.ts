import { describe, expect, it } from "vitest";
import { supportsFSA, validateSaveAsName, suggestExportName } from "./file-service.ts";

describe("file-service", () => {
  it("suggestExportName uses arrowJam format when level id known", () => {
    expect(suggestExportName("level-30.json", 30)).toBe("arrowJam-main-level-30.json");
  });

  it("validateSaveAsName accepts canonical name", () => {
    expect(validateSaveAsName("arrowJam-main-level-42.json")).toBe(true);
    expect(validateSaveAsName("level-42.json")).toBe(false);
  });

  it("supportsFSA returns boolean", () => {
    expect(typeof supportsFSA()).toBe("boolean");
  });
});
