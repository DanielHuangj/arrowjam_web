import type { GenerationForm } from "../types.ts";
import { AI_KIND_OPTIONS } from "../types.ts";
import referenceLevel9001 from "../../../../client/test-fixtures/levels/level-9001.json?raw";
import {
  buildDenseKind1_12x12,
  buildDenseKind1_16x16,
} from "../fixtures/dense-kind1-12x12.ts";

const ALL_KINDS = [1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13] as const;

export function getForbiddenKinds(allowedKinds: number[]): number[] {
  const allowed = new Set(allowedKinds);
  return ALL_KINDS.filter((k) => !allowed.has(k));
}

export function formatForbiddenKindsBlock(form: GenerationForm): string {
  const forbidden = getForbiddenKinds(form.allowedKinds);
  const required = form.allowedKinds
    .map((k) => {
      const opt = AI_KIND_OPTIONS.find((o) => o.kind === k);
      const label = opt ? opt.label : `kind${k}`;
      return `- **${label}（kind ${k}）**：至少 1 个`;
    })
    .join("\n");
  return `## kind 白名单（违反则校验失败）
- **仅允许**: ${form.allowedKinds.join(", ")}
- **严禁出现**: ${forbidden.join(", ") || "无"}
- 参考示例中的 kind 若不在白名单内，**不得照搬**

## 勾选 kind 必现（硬约束）
用户勾选的每种 kind 在 itemModels（含子区域 items）中**至少出现 1 个**：
${required}`;
}

export interface DifficultyTargets {
  arrowCountMin: number;
  arrowCountMax: number;
  edgeArrowMin: number;
  suggestedDurationMin: number;
  mechanismKindCount: number;
  /** 校验硬下限 */
  occupancyCellMin: number;
  /** sanitizer / 生成建议目标（高于 min，尽量填满棋盘） */
  occupancyCellTarget: number;
}

/** 箭身占用棋盘格比例：硬下限 60%，建议略高 */
export const OCCUPANCY_RATE_MIN = 0.6;
export const OCCUPANCY_RATE_TARGET = 0.65;

const BASE_RANGES: Record<1 | 2 | 3, { min: number; max: number; edge: number }> = {
  1: { min: 6, max: 14, edge: 2 },
  2: { min: 12, max: 22, edge: 3 },
  3: { min: 20, max: 38, edge: 4 },
};

/** 纯 kind1 参考关（无翻转箭），密度 ≥60% */
const KIND1_REFERENCE_LEVEL = JSON.stringify(buildDenseKind1_12x12(), null, 2);

/** 16×16 参考，供 20×20 及以上大盘复制密度与无重叠布局 */
const KIND1_REFERENCE_LEVEL_16 = JSON.stringify(buildDenseKind1_16x16(), null, 2);

/** kind1 + 弯管示例：health=2，2 条箭可穿行穿出 */
const KIND1_PIPE_REFERENCE = `{
  "width": 12,
  "height": 12,
  "name": "参考-折线箭+弯管",
  "durationInSec": 120,
  "difficulty": 1,
  "itemModels": [
    {"kind": 3, "instanceId": 1, "layer": 2, "health": 2, "healthViewPathIndex": 2,
     "occupiedPositions": [[5, 6], [6, 6], [7, 6], [7, 7], [7, 8]],
     "passes": [{"position": [5, 6], "directions": [[-1, 0], [1, 0]]}, {"position": [7, 8], "directions": [[0, 1], [0, -1]]}]},
    {"kind": 1, "instanceId": 2, "layer": 2, "direction": 3, "colorId": 6, "occupiedPositions": [[3, 6], [4, 6]]},
    {"kind": 1, "instanceId": 3, "layer": 2, "direction": 2, "colorId": 7, "occupiedPositions": [[7, 9], [7, 10]]},
    {"kind": 1, "instanceId": 4, "layer": 2, "direction": 3, "colorId": 6, "occupiedPositions": [[0, 5], [1, 5], [2, 5]]},
    {"kind": 1, "instanceId": 5, "layer": 2, "direction": 3, "colorId": 6, "occupiedPositions": [[0, 7], [1, 7], [2, 7]]},
    {"kind": 1, "instanceId": 6, "layer": 2, "direction": 1, "colorId": 7, "occupiedPositions": [[9, 0], [9, 1], [9, 2]]},
    {"kind": 1, "instanceId": 7, "layer": 2, "direction": 1, "colorId": 3, "occupiedPositions": [[9, 5], [9, 6], [9, 7]]},
    {"kind": 1, "instanceId": 8, "layer": 2, "direction": 4, "colorId": 6, "occupiedPositions": [[11, 8], [10, 8], [9, 8]]}
  ]
}`;

/** 根据难度与棋盘尺寸推算箭数量、边箭、建议时限 */
export function getDifficultyTargets(form: GenerationForm): DifficultyTargets {
  const base = BASE_RANGES[form.difficulty];
  const cells = form.width * form.height;
  let arrowCountMin = base.min;
  let arrowCountMax = base.max;
  let edgeArrowMin = base.edge;

  if (cells >= 400) {
    arrowCountMin = Math.max(arrowCountMin, Math.round(cells / 50));
    arrowCountMax = Math.max(arrowCountMax, Math.round(cells / 16));
  }
  if (form.width >= 28 || form.height >= 28) {
    arrowCountMin = Math.max(arrowCountMin, 24);
    arrowCountMax = Math.max(arrowCountMax, 48);
    edgeArrowMin = Math.max(edgeArrowMin, 5);
  }

  const mechanismKindCount = form.allowedKinds.filter((k) => k !== 1 && k !== 2).length;
  const hasZone = form.allowedKinds.includes(12);
  const hasFlipOrWall = form.allowedKinds.some((k) => k === 2 || k === 7);
  const occupancyCellMin = Math.ceil(cells * OCCUPANCY_RATE_MIN);
  const occupancyCellTarget = Math.ceil(cells * OCCUPANCY_RATE_TARGET);

  const arrowsForDensity = Math.max(4, Math.ceil(occupancyCellMin / 6));
  arrowCountMin = Math.max(arrowCountMin, Math.ceil(arrowsForDensity * 0.75));
  arrowCountMax = Math.max(arrowCountMax, arrowsForDensity);

  const suggestedDurationMin = Math.ceil(
    arrowCountMax * 5 +
      mechanismKindCount * 15 +
      (hasZone ? 20 : 0) +
      (hasFlipOrWall ? 15 : 0) +
      (cells / 100) * 10,
  );

  return {
    arrowCountMin,
    arrowCountMax,
    edgeArrowMin,
    suggestedDurationMin,
    mechanismKindCount,
    occupancyCellMin,
    occupancyCellTarget,
  };
}

export const PLAYABILITY_RULES = `## 可玩性硬性要求（生成前必须在脑中验证）

### kind 白名单与必现
- **只能**输出用户在表单勾选的 kind；未勾选的 kind **一律不得出现**
- **每种勾选的 kind 至少 1 个**（含子区域 items 内物件）；例如勾选管道则须含 ≥1 个 kind3
- 参考示例若含未勾选 kind，仅学结构与密度，**禁止复制其 kind**

### 密度与规模
- kind1+kind2 箭数量须达到「目标箭数区间」下限
- **箭身占用棋盘格须 ≥60%（硬下限）**；建议 ≥65%；禁止稀疏布局、中心大片空白
- **禁止**箭全部贴边、中心留 5×5 以上连片空白；须有多条箭穿过棋盘内部
- 单条折线 2–8 格；colorId ≤ 4 种

### 格位不重叠
- **不同 kind1/kind2 折线的 occupiedPositions 不得共享任何格子**
- **kind3 管道管身格不得与 kind1/kind2 箭身格重叠**（可邻接，不可同格）
- **kind4 反射角占 1 格，不得与 kind1/kind2 箭身格重叠**（可邻接，不可同格）
- **每条反射角须至少有 1 条箭飞出时经其折射**（非贴边装饰）
- 生成后逐格检查：任一 [x,y] 只能属于一条折线箭；管道/反射角与箭不可同格

### 管道（kind3）须有用
- 管道是**隐藏通道**：箭从 pass 端点沿允许方向进入，沿管身穿出另一端
- **可穿行穿出的箭条数须 ≥ health**（每条箭成功穿出计 1 次，与游戏中扣血一致）
- 禁止「装饰管道」：旁边无箭能进入 pass，或 health 大于实际能穿过的箭数
- 管身可为**弯曲折线**（L 形、Z 形等），passes 两端 directions 须与该端管身走向匹配
- 设计范例：health=2 的弯管，至少布置 2 条箭分别从两端 pass 对准进入并可穿出

### 依赖与可解性
- 依赖图无环；禁止对向死锁
- 外圈边箭首步可消；剥洋葱式先外后内

### 反模式
- A1 死锁环；A2 首步消 >50% 箭；A3 单关 3+ 新机制`;

export function buildTargetsBlock(form: GenerationForm): string {
  const t = getDifficultyTargets(form);
  const durationHint =
    form.durationInSec < t.suggestedDurationMin
      ? `（用户设 ${form.durationInSec}s，建议至少 ${t.suggestedDurationMin}s）`
      : `（建议 ≥${t.suggestedDurationMin}s）`;

  return `${formatForbiddenKindsBlock(form)}

## 本关量化目标
- 棋盘: ${form.width}×${form.height}（${cellsLabel(form)} 格）
- kind1+kind2 箭数量: **${t.arrowCountMin}–${t.arrowCountMax}** 条（**必须 ≥${t.arrowCountMin}**）
- 箭身占用格子: **≥${t.occupancyCellMin}** 格（**硬下限 = 棋盘 60%**），建议 ≥${t.occupancyCellTarget} 格（约 ${Math.round(OCCUPANCY_RATE_TARGET * 100)}%）
- 外圈边箭: ≥ **${t.edgeArrowMin}** 条
- durationInSec: ${form.durationInSec} ${durationHint}`;
}

function cellsLabel(form: GenerationForm): number {
  return form.width * form.height;
}

export function buildReferenceLevelBlock(form: GenerationForm): string {
  const useFlipRef = form.allowedKinds.includes(2);
  const usePipeRef =
    !useFlipRef && form.allowedKinds.includes(3) && !form.allowedKinds.includes(12);
  const largeBoard = form.width >= 20 && form.height >= 20;
  let json: string;
  let label: string;
  if (useFlipRef) {
    json = referenceLevel9001.trim();
    label = "level-9001";
  } else if (usePipeRef) {
    json = KIND1_PIPE_REFERENCE;
    label = "折线箭+弯管 12×12";
  } else if (largeBoard) {
    json = KIND1_REFERENCE_LEVEL_16;
    label = "纯折线箭 16×16";
  } else {
    json = KIND1_REFERENCE_LEVEL;
    label = "纯折线箭 12×12";
  }
  const note = useFlipRef
    ? "含 kind2 翻转箭示例；若未勾选某 kind 则不要输出该 kind。"
    : usePipeRef
      ? "含 kind3 弯管：#2/#3 可穿行穿出，health=2；学管道与箭布局，禁止照抄坐标。"
      : "**仅 kind1**；用户未勾选翻转箭，禁止输出 kind2。";

  return `## 参考关卡（${label}）
${note}
\`\`\`json
${json}
\`\`\`
学其密度与无重叠折线布局；${largeBoard ? "20×20 须同比例增加箭数与占用格" : "大盘须同比例增加箭数"}，禁止照抄坐标后留空大片区域。`;
}

export function buildOptimizeOutputSpec(form: GenerationForm): string {
  const t = getDifficultyTargets(form);
  const kinds = form.allowedKinds.join(", ");
  return `optimized_prompt 必须包含：
### 允许 kind 白名单（仅 ${kinds}）
### 勾选 kind 必现（每种至少 1 个实例，含管道/角块/机制等）
### 目标箭数与 occupancy（硬下限 ≥${t.occupancyCellMin} 格 = 棋盘 60%，建议 ≥${t.occupancyCellTarget} 格；箭须分布到棋盘内部）
### dependency_notes（无环）
### 推荐首步与预估步数
### 格位不重叠约束
${form.allowedKinds.includes(2) ? "### 机制用法（翻转箭）" : "（用户未勾选翻转箭，不得设计 kind2）"}
${form.allowedKinds.includes(3) ? "### 管道用法（kind3）：可穿行穿出箭数 ≥ health；管身可弯曲" : ""}
${form.allowedKinds.includes(4) ? "### 反射角（kind4）：占 1 格，不与箭身同格；至少 1 条箭经其折射" : ""}
${form.allowedKinds.includes(5) ? "### 炸弹（kind5）：绑在宿主箭身中段（≥3 格箭），勿绑头/尾" : ""}

design_notes 须含：瓶颈箭、边箭、重叠检查说明${form.allowedKinds.includes(3) ? "、每条管道穿行箭数与 health" : ""}${form.allowedKinds.includes(4) ? "、反射角与箭身格位分离" : ""}${form.allowedKinds.includes(5) ? "、炸弹绑箭身中段" : ""}。`;
}

/** Phase 2 生成时附带用户表单原文，避免 Phase 1 优化后偏离原意 */
export function buildUserKeywordsBlock(form: GenerationForm): string {
  const raw = form.keywords.trim();
  if (!raw) {
    return `## 用户原始生成关键词
（未填写；按 Phase 1 设计指令与量化目标设计即可）`;
  }
  return `## 用户原始生成关键词（表单原文，须保留原意）
${raw}

**说明**：以上为 Phase 1 优化前的用户原文。生成关卡时主题、教学意图、机制侧重须以此为准；若与下方 Phase 1 设计指令表述不一致，**以本段关键词为准**。`;
}

export function buildGenerateChecklist(form: GenerationForm): string {
  const t = getDifficultyTargets(form);
  const bombLine = form.allowedKinds.includes(5)
    ? "\n- [ ] kind5 炸弹：宿主箭 ≥3 格，occupiedPositions 与身中段同格（非头尾）"
    : "";
  const cornerLine = form.allowedKinds.includes(4)
    ? "\n- [ ] kind4 反射角：占 1 格，不与箭身同格；至少 1 条箭飞出时经其折射"
    : "";
  const pipeLine = form.allowedKinds.includes(3)
    ? "\n- [ ] kind3 管道：passes 端点=路径首尾；healthViewPathIndex=管身中段；管身不与箭身同格\n- [ ] 每条管道：可穿行穿出箭数 ≥ health（弯管/L 形均可）"
    : "";
  const flipLine = form.allowedKinds.includes(2)
    ? "\n- [ ] kind2 翻转箭：direction1=末段方向；direction2=反转后末段方向"
    : "";
  return `## 生成前自检
- [ ] 仅含 kind: ${form.allowedKinds.join(", ")}
- [ ] 每种勾选 kind 至少 1 个（${form.allowedKinds.map((k) => `kind${k}≥1`).join("、")}）
- [ ] kind1+kind2 箭数 ≥ ${t.arrowCountMin}
- [ ] 箭身格子数 ≥ ${t.occupancyCellMin}（**硬下限 60%**），尽量 ≥ ${t.occupancyCellTarget}；中心无大片空白
- [ ] 任意两箭无共享格子
- [ ] 依赖无环；durationInSec = ${form.durationInSec}${pipeLine}${flipLine}${cornerLine}${bombLine}`;
}
