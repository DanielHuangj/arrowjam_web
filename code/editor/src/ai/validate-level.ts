import { assertLoadableLevelData, hasBlockingErrors, validateLevelData } from "@arrowjaw/shared";
import type { LevelData, ValidationIssue } from "@arrowjaw/shared";
import type { GenerationForm } from "./types.ts";
import { validateGenerationConstraints } from "./generation-constraints.ts";

export interface ValidateLevelResult {
  ok: boolean;
  blocking: boolean;
  issues: ValidationIssue[];
  data?: LevelData;
}

export function validateLevelJsonString(
  json: string,
  form?: GenerationForm,
): ValidateLevelResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return {
      ok: false,
      blocking: true,
      issues: [
        {
          id: "JSON",
          severity: "error",
          message: `JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`,
        },
      ],
    };
  }

  try {
    const data = assertLoadableLevelData(raw);
    const issues = validateLevelData(data);
    if (form) {
      issues.push(...validateGenerationConstraints(data, form));
    }
    const blocking = hasBlockingErrors(issues);
    return { ok: !blocking, blocking, issues, data };
  } catch (e) {
    return {
      ok: false,
      blocking: true,
      issues: [
        {
          id: "LOAD",
          severity: "error",
          message: e instanceof Error ? e.message : String(e),
        },
      ],
    };
  }
}

export function formatIssuesSummary(issues: ValidationIssue[], limit = 3): string {
  return issues
    .filter((i) => i.severity === "error")
    .slice(0, limit)
    .map((i) => `[${i.id}] ${i.message}`)
    .join("; ");
}
