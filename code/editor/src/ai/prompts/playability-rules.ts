import type { GenerationForm } from "../types.ts";
import referenceLevel9001 from "../../../../client/public/levels/level-9001.json?raw";

const ALL_KINDS = [1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13] as const;

export function getForbiddenKinds(allowedKinds: number[]): number[] {
  const allowed = new Set(allowedKinds);
  return ALL_KINDS.filter((k) => !allowed.has(k));
}

export function formatForbiddenKindsBlock(form: GenerationForm): string {
  const forbidden = getForbiddenKinds(form.allowedKinds);
  return `## kind 白名单（违反则校验失败）
- **仅允许**: ${form.allowedKinds.join(", ")}
- **严禁出现**: ${forbidden.join(", ") || "无"}
- 参考示例中的 kind 若不在白名单内，**不得照搬**`;
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

const BASE_RANGES: Record<1 | 2 | 3, { min: number; max: number; edge: number }> = {
  1: { min: 6, max: 14, edge: 2 },
  2: { min: 12, max: 22, edge: 3 },
  3: { min: 20, max: 38, edge: 4 },
};

/** 纯 kind1 参考关（无翻转箭），避免用户只勾 K1 时模型照搬 kind2 */
const KIND1_REFERENCE_LEVEL = `{
  "width": 12,
  "height": 12,
  "name": "参考-纯折线箭",
  "durationInSec": 120,
  "difficulty": 1,
  "itemModels": [
    {"kind": 1, "instanceId": 1, "layer": 2, "direction": 3, "colorId": 6, "occupiedPositions": [[0, 5], [1, 5], [2, 5]]},
    {"kind": 1, "instanceId": 2, "layer": 2, "direction": 3, "colorId": 6, "occupiedPositions": [[0, 7], [1, 7], [2, 7]]},
    {"kind": 1, "instanceId": 3, "layer": 2, "direction": 1, "colorId": 7, "occupiedPositions": [[5, 0], [5, 1], [5, 2]]},
    {"kind": 1, "instanceId": 4, "layer": 2, "direction": 1, "colorId": 7, "occupiedPositions": [[9, 5], [9, 6], [9, 7]]},
    {"kind": 1, "instanceId": 5, "layer": 2, "direction": 3, "colorId": 3, "occupiedPositions": [[3, 9], [4, 9], [5, 9]]},
    {"kind": 1, "instanceId": 6, "layer": 2, "direction": 3, "colorId": 3, "occupiedPositions": [[7, 3], [8, 3], [9, 3], [10, 3]]},
    {"kind": 1, "instanceId": 7, "layer": 2, "direction": 1, "colorId": 6, "occupiedPositions": [[2, 10], [2, 11]]},
    {"kind": 1, "instanceId": 8, "layer": 2, "direction": 1, "colorId": 7, "occupiedPositions": [[10, 8], [11, 8], [11, 9]]}
  ]
}`;

/** 16×16 / 12 箭参考，供 20×20 及以上大盘复制密度与无重叠布局 */
const KIND1_REFERENCE_LEVEL_16 = `{
  "width": 16,
  "height": 16,
  "name": "参考-纯折线箭-16",
  "durationInSec": 150,
  "difficulty": 1,
  "itemModels": [
    {"kind": 1, "instanceId": 1, "layer": 2, "direction": 3, "colorId": 6, "occupiedPositions": [[0, 4], [1, 4], [2, 4], [3, 4]]},
    {"kind": 1, "instanceId": 2, "layer": 2, "direction": 3, "colorId": 6, "occupiedPositions": [[0, 7], [1, 7], [2, 7], [3, 7]]},
    {"kind": 1, "instanceId": 3, "layer": 2, "direction": 3, "colorId": 7, "occupiedPositions": [[0, 10], [1, 10], [2, 10]]},
    {"kind": 1, "instanceId": 4, "layer": 2, "direction": 1, "colorId": 7, "occupiedPositions": [[5, 0], [5, 1], [5, 2], [5, 3]]},
    {"kind": 1, "instanceId": 5, "layer": 2, "direction": 1, "colorId": 3, "occupiedPositions": [[9, 0], [9, 1], [9, 2]]},
    {"kind": 1, "instanceId": 6, "layer": 2, "direction": 1, "colorId": 3, "occupiedPositions": [[13, 5], [13, 6], [13, 7], [13, 8]]},
    {"kind": 1, "instanceId": 7, "layer": 2, "direction": 3, "colorId": 6, "occupiedPositions": [[3, 12], [4, 12], [5, 12], [6, 12]]},
    {"kind": 1, "instanceId": 8, "layer": 2, "direction": 3, "colorId": 7, "occupiedPositions": [[7, 3], [8, 3], [9, 3], [10, 3], [11, 3]]},
    {"kind": 1, "instanceId": 9, "layer": 2, "direction": 2, "colorId": 3, "occupiedPositions": [[14, 10], [14, 9], [14, 8]]},
    {"kind": 1, "instanceId": 10, "layer": 2, "direction": 4, "colorId": 6, "occupiedPositions": [[12, 14], [11, 14], [10, 14]]},
    {"kind": 1, "instanceId": 11, "layer": 2, "direction": 1, "colorId": 7, "occupiedPositions": [[2, 14], [2, 15]]},
    {"kind": 1, "instanceId": 12, "layer": 2, "direction": 1, "colorId": 3, "occupiedPositions": [[15, 12], [15, 13], [15, 14], [15, 15]]}
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
  const largeBoard = cells >= 400;
  const occupancyCellMin = Math.ceil(cells * (largeBoard ? 0.3 : 0.15));
  const occupancyCellTarget = Math.ceil(cells * (largeBoard ? 0.4 : 0.22));

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

### kind 白名单
- **只能**输出用户在表单勾选的 kind；未勾选的 kind（如未勾 K2 则禁止 kind2）**一律不得出现**
- 参考示例若含未勾选 kind，仅学结构与密度，**禁止复制其 kind**

### 密度与规模
- kind1+kind2 箭数量须达到「目标箭数区间」下限
- 箭身占用格子数须达到 occupancy **硬下限**；并尽量接近 **建议目标**（大盘约 30–35%）
- **禁止**箭全部贴边、中心留 5×5 以上连片空白；须有多条箭穿过棋盘内部
- 单条折线 2–8 格；colorId ≤ 4 种

### 格位不重叠
- **不同 kind1/kind2 折线的 occupiedPositions 不得共享任何格子**
- 生成后逐格检查：任一 [x,y] 只能属于一条折线箭

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
- 箭身占用格子: **≥${t.occupancyCellMin}** 格（硬下限），**建议 ≥${t.occupancyCellTarget}** 格（约 ${Math.round((t.occupancyCellTarget / cellsLabel(form)) * 100)}%）
- 外圈边箭: ≥ **${t.edgeArrowMin}** 条
- durationInSec: ${form.durationInSec} ${durationHint}`;
}

function cellsLabel(form: GenerationForm): number {
  return form.width * form.height;
}

export function buildReferenceLevelBlock(form: GenerationForm): string {
  const useFlipRef = form.allowedKinds.includes(2);
  const largeBoard = form.width >= 20 && form.height >= 20;
  let json: string;
  let label: string;
  if (useFlipRef) {
    json = referenceLevel9001.trim();
    label = "level-9001";
  } else if (largeBoard) {
    json = KIND1_REFERENCE_LEVEL_16;
    label = "纯折线箭 16×16";
  } else {
    json = KIND1_REFERENCE_LEVEL;
    label = "纯折线箭 12×12";
  }
  const note = useFlipRef
    ? "含 kind2 翻转箭示例；若未勾选某 kind 则不要输出该 kind。"
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
### 目标箭数与 occupancy（硬下限 ≥${t.occupancyCellMin} 格，建议 ≥${t.occupancyCellTarget} 格；箭须分布到棋盘内部）
### dependency_notes（无环）
### 推荐首步与预估步数
### 格位不重叠约束
${form.allowedKinds.includes(2) ? "### 机制用法（翻转箭）" : "（用户未勾选翻转箭，不得设计 kind2）"}

design_notes 须含：瓶颈箭、边箭、重叠检查说明。`;
}

export function buildGenerateChecklist(form: GenerationForm): string {
  const t = getDifficultyTargets(form);
  return `## 生成前自检
- [ ] 仅含 kind: ${form.allowedKinds.join(", ")}
- [ ] kind1+kind2 箭数 ≥ ${t.arrowCountMin}
- [ ] 箭身格子数 ≥ ${t.occupancyCellMin}（硬下限），尽量 ≥ ${t.occupancyCellTarget}；中心无大片空白
- [ ] 任意两箭无共享格子
- [ ] 依赖无环；durationInSec = ${form.durationInSec}`;
}
