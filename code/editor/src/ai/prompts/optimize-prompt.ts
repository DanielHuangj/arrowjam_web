import type { AiContextBundle } from "../context.ts";
import type { OptimizeResult } from "../types.ts";
import { formatForbiddenKindsBlock } from "./playability-rules.ts";
import { LEVEL_SCHEMA_SUMMARY } from "./schema-summary.ts";
import {
  buildOptimizeOutputSpec,
  buildReferenceLevelBlock,
  buildTargetsBlock,
  PLAYABILITY_RULES,
} from "./playability-rules.ts";

const DIFF_LABELS: Record<number, string> = {
  1: "Normal",
  2: "Hard",
  3: "Superhuman",
};

const LEVEL_KIND_LABELS: Record<number, string> = {
  1: "主线",
  2: "普通",
};

export function buildOptimizeMessages(
  form: GenerationForm,
  context: AiContextBundle,
  schemaSummary: string = LEVEL_SCHEMA_SUMMARY,
): ChatMessage[] {
  const levelKindText =
    form.levelKind != null ? LEVEL_KIND_LABELS[form.levelKind] ?? String(form.levelKind) : "未设置";

  const userParams = `
## 用户关卡参数
- 名称前缀: ${form.prefix}
- 棋盘: ${form.width} x ${form.height}
- 时限: ${form.durationInSec} 秒
- 难度: ${DIFF_LABELS[form.difficulty]} (${form.difficulty})
- 关卡类型 levelKind: ${levelKindText}${form.levelKind != null ? ` (${form.levelKind})` : ""}
- 允许使用的 kind: ${form.allowedKinds.join(", ")}（必须包含 kind 1）
- 用户创意关键词: ${form.keywords || "（无，请自行设计合理主题）"}
`.trim();

  return [
    {
      role: "system",
      content: `你是 Arrow Jam 关卡设计专家。将用户需求扩展为 Phase 2 可执行的详细生成指令。

你必须只输出 JSON：
{"optimized_prompt":"...","design_notes":"...","target_arrow_count":10,"target_occupancy":88}

target_arrow_count / target_occupancy 为可选建议值；Phase 2 以 getDifficultyTargets 硬下限为准。

${buildOptimizeOutputSpec(form)}

optimized_prompt 须写入具体数字（箭数区间、边箭数、occupancy 目标），并完整写出 dependency_notes。
不要输出 markdown 代码块外的其他文字。`,
    },
    {
      role: "user",
      content: `${userParams}

${formatForbiddenKindsBlock(form)}

${buildTargetsBlock(form)}

${PLAYABILITY_RULES}

${buildReferenceLevelBlock(form)}

## 游戏功能图谱
${context.featureMap}

## AI 关卡编辑指南
${context.aiGuide}

## 关卡 JSON 结构
${schemaSummary}

请基于以上文档，优化用户关键词为 Phase 2 使用的 optimized_prompt。`,
    },
  ];
}

export function parseOptimizeResponse(raw: unknown): OptimizeResult {
  if (!raw || typeof raw !== "object") {
    throw new Error("提示词优化响应不是 JSON 对象");
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.optimized_prompt !== "string" || !o.optimized_prompt.trim()) {
    throw new Error("缺少 optimized_prompt 字段");
  }
  return {
    optimized_prompt: o.optimized_prompt.trim(),
    design_notes: typeof o.design_notes === "string" ? o.design_notes : undefined,
    target_arrow_count:
      typeof o.target_arrow_count === "number" ? o.target_arrow_count : undefined,
    target_occupancy: typeof o.target_occupancy === "number" ? o.target_occupancy : undefined,
  };
}
