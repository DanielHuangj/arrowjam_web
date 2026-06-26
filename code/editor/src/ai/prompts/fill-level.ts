import type { ValidationIssue } from "@arrowjaw/shared";
import type { ChatMessage, GenerationForm } from "../types.ts";
import type { BaseLevelContext } from "../level-base-edit.ts";
import {
  buildBaseFrozenItemsJson,
  buildBaseOccupiedSummary,
  extractNewItemsFromMergedJson,
} from "../level-base-edit.ts";
import { LEVEL_SCHEMA_SUMMARY } from "./schema-summary.ts";
import {
  buildGenerateChecklist,
  buildTargetsBlock,
  buildUserKeywordsBlock,
} from "./playability-rules.ts";

const FILL_OUTPUT_SCHEMA = `只输出 JSON（无 markdown、无注释）：
{"new_itemModels":[...]}
- new_itemModels：仅**新增**物件（折线箭、管道、角块等），不要重复基础关已有 itemModels
- 合并后须满足用户勾选的每种 kind 至少 1 个（基础关缺的 kind 须在 new_itemModels 中补上）
- instanceId 从基础关最大 id+1 起递增，勿与基础关 id 冲突`;

export function buildOptimizeFillMessages(
  form: GenerationForm,
  base: BaseLevelContext,
): ChatMessage[] {
  return [
    {
      role: "system",
      content: `你是 Arrow Jam 关卡填充设计专家。用户已有关卡，需**保留全部原有折线箭**，仅在空格中追加新箭。

只输出 JSON：
{"optimized_prompt":"...","design_notes":"..."}

optimized_prompt 须说明：如何填充剩余空格、新箭数量建议、避免与原有箭死锁、dependency 顺序；若用户勾选管道/角块等机制，合并后每种勾选 kind 至少 1 个。`,
    },
    {
      role: "user",
      content: `## 任务：二次填充编辑（保留原箭）
${buildBaseOccupiedSummary(base)}

## 用户参数
- 棋盘: ${form.width}×${form.height}
- 关键词: ${form.keywords || "（无）"}
- 允许 kind: ${form.allowedKinds.join(", ")}

${buildTargetsBlock(form)}

## 基础关折线箭（不可改，供参考布局）
${buildBaseFrozenItemsJson(base)}

请输出 optimized_prompt，指导 Phase 2 在空格中追加新物件（折线箭为主，缺失的勾选 kind 须补齐）。`,
    },
  ];
}

export function buildFillLevelMessages(
  optimizedPrompt: string,
  form: GenerationForm,
  base: BaseLevelContext,
  index: number,
  total: number,
): ChatMessage[] {
  const seq = String(index).padStart(3, "0");
  const allowedOnly = form.allowedKinds.join(", ");

  return [
    {
      role: "system",
      content: `你是 Arrow Jam 关卡 JSON **填充**生成器。

**硬性规则：**
1. **禁止**输出基础关已有 itemModels；基础关由程序合并，你只需输出新增箭
2. 新物件只能占用基础关未占用的格子（见下方基础箭 occupiedPositions）
3. 新物件 kind 只能为: ${allowedOnly}；**合并后每种勾选 kind 至少 1 个**
4. ${FILL_OUTPUT_SCHEMA}`,
    },
    {
      role: "user",
      content: `${buildUserKeywordsBlock(form)}

## 填充设计指令
${optimizedPrompt}

## 空格与目标
${buildBaseOccupiedSummary(base)}

${buildTargetsBlock(form)}

## 基础关折线箭（占用格不可再用；勿在输出中重复）
${buildBaseFrozenItemsJson(base)}

## 本关元数据
- name 建议: "${form.prefix} #${seq}"（可选字段 "name"）
- 新箭 instanceId 从 ${base.nextNewInstanceId} 起
- 第 ${index}/${total} 关

${buildGenerateChecklist(form)}

## 新箭 Schema（new_itemModels 元素）
${LEVEL_SCHEMA_SUMMARY}

请输出 {"new_itemModels":[...]}，包含追加的新物件（折线箭 + 须补齐的勾选 kind）。`,
    },
  ];
}

export function buildFillFixMessages(
  levelJson: string,
  base: BaseLevelContext,
  issues: ValidationIssue[],
  form: GenerationForm,
): ChatMessage[] {
  const issueText = issues
    .filter((i) => i.severity === "error")
    .map((i) => `- [${i.id}] ${i.message}${i.instanceId != null ? ` (#${i.instanceId})` : ""}`)
    .join("\n");

  const currentNewItems = extractNewItemsFromMergedJson(base, levelJson);
  const minAdded = form.fillMinAddedCells ?? 8;

  return [
    {
      role: "system",
      content: `修正填充关卡中的**新追加折线箭**。

**禁止**修改基础关箭（instanceId: ${[...base.frozenArrowIds].join(", ")}）。
**禁止**为通过校验而删掉全部新箭导致与基础关完全相同。

${FILL_OUTPUT_SCHEMA}`,
    },
    {
      role: "user",
      content: `## 校验错误
${issueText || "（未知）"}

## 修正策略
- AI-FILL-PROGRESS：修正后新箭占用须比基础关至少多 ${minAdded} 格
- AI-KIND-MIN：合并后缺少的勾选 kind → 在 new_itemModels 中至少添加 1 个
- AI-UNSOLVABLE / AI-OVERLAP：优先移动/删除 instanceId ≥ ${base.nextNewInstanceId} 的新箭
- 输出 {"new_itemModels":[...]} = 修正后的**全部新箭**（非基础关箭）

${buildTargetsBlock(form)}

## 当前新箭（请在此基础上修正）
${JSON.stringify({ new_itemModels: currentNewItems })}

请输出修正后的 {"new_itemModels":[...]}。`,
    },
  ];
}
