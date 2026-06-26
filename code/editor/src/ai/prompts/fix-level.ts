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

  if (errorIds.has("AI-OVERLAP") && errorIds.has("V04")) {
    return `## 修正范围（重叠 + 折线断裂）
- **先**消除 AI-OVERLAP：任何两箭不得共享格子；移动/缩短折线，勿删格导致 V04
- kind1/kind2 折线须**逐格正交连续**（V04）；改 occupiedPositions 时保持每相邻两格曼哈顿距离=1
- 禁止为去重叠而删除中间格造成断线；应平移整条折线或改弯折路径
- kind5 炸弹仍绑定在箭身格上（occupiedPositions 与宿主箭同格），勿拆炸弹`;
  }

  if (errorIds.has("AI-OVERLAP")) {
    return `## 修正范围（箭格重叠）
- kind1/kind2 **不得**共享任何 occupiedPositions 格子
- 平移其中一条折线 1–2 格，或缩短/弯折路径消除冲突
- 保持折线连续（V04）与 direction 与末段一致（V11）`;
  }

  if (errorIds.has("V04")) {
    return `## 修正范围（折线不连续）
- kind1/kind2 occupiedPositions 须为逐格相连的折线（相邻格曼哈顿距离=1）
- 删除多余断点或补全中间格，勿留下跳跃坐标
- 同步修正 direction / direction1 与末段方向`;
  }

  if (errorIds.has("AI-UNSOLVABLE")) {
    return `## 修正范围（不可解 / 死锁）
- 关卡须能通过「依次点击可飞出箭」清空；禁止 head 对 head 同轴对向互挡
- 优先让外圈/边箭首步可消；调整卡住箭的折线弯折或整体平移 1–2 格
- 保持格位不重叠与 density 下限`;
  }

  if (errorIds.size === 1 && errorIds.has("V11")) {
    return `## 修正范围（方向）
- kind1: direction 须与折线末段方向一致
- kind2 翻转箭: direction1=末段方向（箭头顺箭身），direction2=反转折线后的末段方向；**勿**只改 occupiedPositions`;
  }

  if (errorIds.size === 1 && errorIds.has("AI-KIND")) {
    return `## 修正范围（kind 白名单）
- 删除或改写未勾选 kind 的物件；勿输出白名单外 kind`;
  }

  if (errorIds.has("AI-KIND-MIN")) {
    return `## 修正范围（勾选 kind 缺失）
- 用户勾选的每种 kind 须至少出现 1 个；在保持可玩前提下**追加**缺失的 kind 物件
- 例如缺 kind3 管道：添加 1 条合法管道（health、passes 端点完整）
- kind5 炸弹：occupiedPositions 为宿主箭的**某一格**，layer=3，time>0`;
  }

  if (errorIds.has("LOAD") || errorIds.has("V07") || errorIds.has("V08")) {
    return `## 修正范围（管道 passes / LOAD）
- kind3 **禁止** passes: [[x,y],[x,y]] 裸坐标写法
- 每个 pass 必须是对象：{"position":[x,y],"directions":[[dx,dy],[dx,dy]]}
- position **必须**是 occupiedPositions 折线路径的**首尾格**（与路径顺序一致）
- healthViewPathIndex = Math.floor(管身格数/2)，锚在管身中段（勿用 0）
- health 为正整数（建议等于管身格数）
- 水平管 directions [[-1,0],[1,0]]；竖直管 [[0,1],[0,-1]]`;
  }

  if (errorIds.has("AI-PIPE-OVERLAP") || errorIds.has("V-PIPE-01")) {
    return `## 修正范围（管道与箭重叠）
- kind3 管身 occupiedPositions **不得**与 kind1/kind2 箭身格共享任何格子
- 将管道平移到仅邻接箭身、不重叠的位置，或缩短/弯折管道路径
- 保持 passes 端点为管道路径首尾格`;
  }

  if (errorIds.has("AI-CORNER-OVERLAP") || errorIds.has("V-CORNER-01")) {
    return `## 修正范围（反射角与箭重叠）
- kind4 反射角占 **1 格**，**不得**与 kind1/kind2 箭身格共享任何格子
- 将反射角平移到箭身旁的空格（可邻接，不可同格），或调整箭折线避开角块格
- 保持 direction1/direction2 为互相垂直的 Vec2`;
  }

  if (errorIds.has("AI-CORNER-USELESS")) {
    return `## 修正范围（反射角无实际作用）
- 反射角须在至少 **1 条箭** 飞出路径上，使箭经角块**折射转向**（非装饰）
- 将角块放在箭头部飞行将经过的空格上，direction1/direction2 与该入射/出射方向垂直匹配
- 或调整箭 direction 与折线，使箭飞向角块开口方向（从 -direction1 或 -direction2 侧进入）`;
  }

  if (errorIds.has("AI-BOMB-ANCHOR") || errorIds.has("AI-BOMB-SHORT")) {
    return `## 修正范围（炸弹绑定位置）
- kind5 occupiedPositions 须与宿主 kind1/kind2 **身中段**同格：取宿主折线索引 floor(格数/2)
- **禁止**绑在宿主箭的**头格或尾格**；宿主箭须 **≥3 格**
- 仅改炸弹 occupiedPositions（与中段同坐标），保留 time/layer`;
  }

  if (errorIds.has("AI-PIPE-USELESS")) {
    return `## 修正范围（管道无实际作用）
- 每条管道 health 表示须有多少条箭**穿行穿出**（从 pass 进入、从另一端穿出）
- **可穿行穿出箭数须 ≥ health**；不足则：降低 health，或新增/调整箭使其对准 pass 端点进入
- 管身可为弯曲折线；passes 的 directions 须与该端走向匹配
- 箭头部应能沿 direction 进入 pass，穿出后继续飞出棋盘`;
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
- AI-KIND-MIN: 勾选 kind 未出现 → 至少添加 1 个该 kind
- AI-COUNT: 箭太少 → 增加 kind1 折线箭
- AI-DENSITY: 占用格太少（须 ≥ 棋盘 60%）→ 增加箭长/箭数，铺满盘面
- AI-OVERLAP: 两箭共享格子 → 移动折线使格位互不重叠
- AI-UNSOLVABLE: 死锁/不可解 → 调整折线使箭可依次飞出
- V11: direction/direction1 与末段不一致 → 修正方向字段（翻转箭 direction1=末段、direction2=首段）
- V07/V08/LOAD: 管道 passes 格式错误 → 按 Schema 中 kind3 示例重写 passes
- V-PIPE-01 / AI-PIPE-OVERLAP: 管道与箭身格重叠 → 平移/缩短管道，勿与箭共享格子
- V-CORNER-01 / AI-CORNER-OVERLAP: 反射角与箭身格重叠 → 平移角块或调整箭折线，勿同格
- AI-CORNER-USELESS: 无箭经角块折射 → 将角块放到箭飞行路径上并匹配 direction1/2
- AI-BOMB-ANCHOR / AI-BOMB-SHORT: 炸弹须绑宿主箭身中段（≥3 格箭，非头尾）
- AI-PIPE-USELESS: 可穿行箭不足 → 降 health 或增加对准 pass 的箭

## Schema
${LEVEL_SCHEMA_SUMMARY}

## 当前 JSON
${levelJson}

请输出修正后的完整 JSON。`,
    },
  ];
}
