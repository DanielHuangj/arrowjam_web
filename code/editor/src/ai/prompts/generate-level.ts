import type { ChatMessage, GenerationForm } from "../types.ts";
import { LEVEL_SCHEMA_SUMMARY } from "./schema-summary.ts";
import {
  buildGenerateChecklist,
  buildReferenceLevelBlock,
  buildTargetsBlock,
  buildUserKeywordsBlock,
} from "./playability-rules.ts";

export function buildGenerateMessages(
  optimizedPrompt: string,
  form: GenerationForm,
  index: number,
  total: number,
): ChatMessage[] {
  const seq = String(index).padStart(3, "0");
  const allowedOnly = form.allowedKinds.join(", ");

  return [
    {
      role: "system",
      content: `你是 Arrow Jam 关卡 JSON 生成器。

**硬性规则（违反则自动校验失败）：**
1. itemModels 中每个物件的 kind **只能**是: ${allowedOnly}
2. **每种勾选的 kind 至少 1 个**（例如勾选 K3 管道则须含 ≥1 个 kind3）
3. 禁止输出任何其他 kind（含 kind2 翻转箭，除非已在列表中）
4. 不同 kind1/kind2 的 occupiedPositions **不得共享格子**
5. **箭身占用棋盘格须 ≥60%**（见下方「硬性量化下限」），箭须铺满盘面内部，禁止稀疏布局

只输出一个 LevelData JSON，不要解释。`,
    },
    {
      role: "user",
      content: `${buildUserKeywordsBlock(form)}

## Phase 1 设计指令
${optimizedPrompt}

## 硬性量化下限（本块数字优先于 optimized_prompt 中的建议值）
${buildTargetsBlock(form)}

${buildReferenceLevelBlock(form)}

## 本关约束（第 ${index}/${total} 关）
- width: ${form.width}, height: ${form.height}
- durationInSec: ${form.durationInSec}
- difficulty: ${form.difficulty}
${form.levelKind != null ? `- levelKind: ${form.levelKind}` : ""}
- name: "${form.prefix} #${seq}"

${buildGenerateChecklist(form)}

## Schema
${LEVEL_SCHEMA_SUMMARY}

请生成本关完整 JSON。`,
    },
  ];
}
