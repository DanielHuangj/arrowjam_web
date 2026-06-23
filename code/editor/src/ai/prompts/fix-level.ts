import type { ValidationIssue } from "@arrowjaw/shared";
import type { ChatMessage, GenerationForm } from "../types.ts";
import { getValidatorSummary } from "../context.ts";
import { formatForbiddenKindsBlock } from "./playability-rules.ts";
import { LEVEL_SCHEMA_SUMMARY } from "./schema-summary.ts";
import { buildTargetsBlock } from "./playability-rules.ts";

function buildFixFocusBlock(issues: ValidationIssue[]): string {
  const errorIds = new Set(
    issues.filter((i) => i.severity === "error").map((i) => i.id),
  );
  if (errorIds.size === 0) return "";

  const layoutOnly = [...errorIds].every((id) => id === "AI-OVERLAP" || id === "AI-DENSITY");
  if (layoutOnly) {
    return `## 修正范围（布局类错误）
- **只**调整 kind1/kind2 的 occupiedPositions，或追加 2–3 格短折线箭
- **禁止**重写 name、dependency 散文、keywords 或与格位无关的字段
- 优先消除 AI-OVERLAP，再补足 AI-DENSITY`;
  }

  if (errorIds.has("AI-UNSOLVABLE")) {
    return `## 修正范围（不可解 / 死锁）
- 关卡须能通过「依次点击可飞出箭」清空；禁止 head 对 head 同轴对向互挡
- 优先让外圈/边箭首步可消；调整卡住箭的折线弯折或整体平移 1–2 格
- 保持格位不重叠与 density 下限`;
  }

  if (errorIds.size === 1 && errorIds.has("V11")) {
    return `## 修正范围（方向）
- direction 须与折线末段方向一致
- **勿**改动 occupiedPositions，只修正 direction 字段`;
  }

  if (errorIds.size === 1 && errorIds.has("AI-KIND")) {
    return `## 修正范围（kind 白名单）
- 删除或改写未勾选 kind 的物件；勿输出白名单外 kind`;
  }

  return "";
}

export function buildFixMessages(
  levelJson: string,
  issues: ValidationIssue[],
  form: GenerationForm,
): ChatMessage[] {
  const issueText = issues
    .filter((i) => i.severity === "error")
    .map((i) => `- [${i.id}] ${i.message}${i.instanceId != null ? ` (#${i.instanceId})` : ""}`)
    .join("\n");

  const focusBlock = buildFixFocusBlock(issues);

  return [
    {
      role: "system",
      content: `你是 Arrow Jam 关卡 JSON 修正器。修正校验错误，同时满足 kind 白名单、箭数/密度下限、折线箭格不重叠。
只输出完整 LevelData JSON。`,
    },
    {
      role: "user",
      content: `以下关卡 JSON 校验失败，请修正所有 error：

## 校验错误
${issueText || "（未知错误）"}

${focusBlock ? `${focusBlock}\n\n` : ""}${formatForbiddenKindsBlock(form)}

${buildTargetsBlock(form)}

## 校验码说明
${getValidatorSummary()}
- AI-KIND: 出现未勾选 kind → 删除
- AI-COUNT: 箭太少 → 增加 kind1 折线箭
- AI-DENSITY: 占用格太少 → 增加箭长/箭数
- AI-OVERLAP: 两箭共享格子 → 移动折线使格位互不重叠
- AI-UNSOLVABLE: 死锁/不可解 → 调整折线使箭可依次飞出
- V11: direction 与末段不一致 → 只改 direction

## Schema
${LEVEL_SCHEMA_SUMMARY}

## 当前 JSON
${levelJson}

请输出修正后的完整 JSON。`,
    },
  ];
}
