import type { LevelData, RawItem } from "@arrowjaw/shared";
import { assertLoadableLevelData, collectAllItems, vecKey } from "@arrowjaw/shared";
import type { GenerationForm } from "./types.ts";

const ARROW_KINDS = new Set([1, 2]);

export interface BaseLevelContext {
  data: LevelData;
  json: string;
  /** 单行紧凑 JSON，用于 prompt（比用户上传的格式化 JSON 更短） */
  compactJson: string;
  /** 基础关折线箭占用的格子（不可被新箭占用） */
  frozenArrowCells: Set<string>;
  /** 基础关折线箭 instanceId（不可删除或改格位） */
  frozenArrowIds: Set<number>;
  emptyCells: number;
  occupiedArrowCells: number;
  nextNewInstanceId: number;
}

export function parseBaseLevelJson(json: string): LevelData {
  const raw = JSON.parse(json);
  return assertLoadableLevelData(raw);
}

export function buildBaseLevelContext(json: string): BaseLevelContext {
  const data = parseBaseLevelJson(json);
  const frozenArrowCells = new Set<string>();
  const frozenArrowIds = new Set<number>();

  for (const item of collectAllItems(data.itemModels)) {
    if (!ARROW_KINDS.has(item.kind)) continue;
    frozenArrowIds.add(item.instanceId);
    for (const p of item.occupiedPositions) {
      frozenArrowCells.add(vecKey(p));
    }
  }

  const total = data.width * data.height;
  const emptyCells = total - frozenArrowCells.size;

  const allItems = collectAllItems(data.itemModels);
  const nextNewInstanceId =
    allItems.length === 0 ? 1 : Math.max(...allItems.map((i) => i.instanceId)) + 1;

  return {
    data,
    json,
    compactJson: JSON.stringify(data),
    frozenArrowCells,
    frozenArrowIds,
    emptyCells,
    occupiedArrowCells: frozenArrowCells.size,
    nextNewInstanceId,
  };
}

export function validateBaseLevelForForm(
  base: BaseLevelContext,
  form: GenerationForm,
): string | null {
  const { data } = base;
  if (data.width !== form.width || data.height !== form.height) {
    return `基础关棋盘为 ${data.width}×${data.height}，与表单 ${form.width}×${form.height} 不一致（选择文件后将自动同步尺寸）`;
  }
  if (base.frozenArrowIds.size === 0) {
    return "基础关不含折线箭（kind1/kind2），无法做保留箭头的填充编辑";
  }
  if (base.emptyCells <= 0) {
    return "基础关已无空格，无需填充";
  }
  return null;
}

/** 从 LLM 产出中提取可追加的新物件（不碰基础箭格） */
export function extractNewItemsFromGenerated(
  base: BaseLevelContext,
  generated: LevelData,
): RawItem[] {
  const baseIds = new Set(collectAllItems(base.data.itemModels).map((i) => i.instanceId));
  const out: RawItem[] = [];

  for (const item of collectAllItems(generated.itemModels)) {
    if (baseIds.has(item.instanceId)) continue;
    if (base.frozenArrowIds.has(item.instanceId)) continue;

    if (ARROW_KINDS.has(item.kind)) {
      const overlapsBase = item.occupiedPositions.some((p) => base.frozenArrowCells.has(vecKey(p)));
      if (overlapsBase) continue;
    }

    out.push(structuredClone(item));
  }
  return out;
}

function nextFreeInstanceId(items: RawItem[]): number {
  const all = collectAllItems(items);
  return all.length === 0 ? 1 : Math.max(...all.map((i) => i.instanceId)) + 1;
}

/** 合并：基础关原样保留 + 追加新物件 */
export function mergeBaseWithNewItems(base: BaseLevelContext, newItems: RawItem[]): LevelData {
  const merged: LevelData = structuredClone(base.data);
  let nextId = nextFreeInstanceId(merged.itemModels);

  for (const item of newItems) {
    const copy = structuredClone(item);
    if (base.frozenArrowIds.has(copy.instanceId) || merged.itemModels.some((i) => i.instanceId === copy.instanceId)) {
      copy.instanceId = nextId++;
    }
    merged.itemModels.push(copy);
  }

  return merged;
}

export function computeFillMinAddedCells(emptyCells: number): number {
  return Math.max(8, Math.ceil(emptyCells * 0.1));
}

export function stabilizeFillLevel(
  base: BaseLevelContext,
  generated: LevelData,
  form: GenerationForm,
): LevelData {
  return mergeBaseWithGeneratedLevel(base, generated, form);
}

export function countNewItemsMerged(base: BaseLevelContext, merged: LevelData): number {
  return merged.itemModels.length - base.data.itemModels.length;
}

export function mergeBaseWithGeneratedLevel(
  base: BaseLevelContext,
  generated: LevelData,
  form: GenerationForm,
): LevelData {
  const newItems = extractNewItemsFromGenerated(base, generated);
  const merged = mergeBaseWithNewItems(base, newItems);
  merged.name = generated.name?.trim() || merged.name;
  merged.durationInSec = form.durationInSec;
  merged.difficulty = form.difficulty;
  if (form.levelKind != null) merged.levelKind = form.levelKind;
  return merged;
}

export function applyFormMetaToBase(base: BaseLevelContext, form: GenerationForm): LevelData {
  const data = structuredClone(base.data);
  data.durationInSec = form.durationInSec;
  data.difficulty = form.difficulty;
  if (form.levelKind != null) data.levelKind = form.levelKind;
  return data;
}

export function buildBaseOccupiedSummary(base: BaseLevelContext): string {
  const total = base.data.width * base.data.height;
  const pct = Math.round((base.occupiedArrowCells / total) * 100);
  return `已有 ${base.frozenArrowIds.size} 条折线箭、占用 ${base.occupiedArrowCells} 格（约 ${pct}%），剩余 ${base.emptyCells} 格待填充`;
}

/** 填充 prompt 用：仅列出基础关折线箭（紧凑单行 JSON） */
export function buildBaseFrozenItemsJson(base: BaseLevelContext): string {
  const frozen = collectAllItems(base.data.itemModels).filter((i) =>
    base.frozenArrowIds.has(i.instanceId),
  );
  return JSON.stringify(frozen);
}

/** 从已合并关卡 JSON 中提取当前新箭（供 fix 轮次 prompt） */
export function extractNewItemsFromMergedJson(
  base: BaseLevelContext,
  levelJson: string,
): RawItem[] {
  const merged = assertLoadableLevelData(JSON.parse(levelJson));
  return extractNewItemsFromGenerated(base, merged);
}

/** 解析填充模式 LLM 响应：优先 delta `new_itemModels`，兼容完整 LevelData */
export function parseFillNewItems(raw: unknown, base?: BaseLevelContext): RawItem[] {
  if (Array.isArray(raw)) {
    return raw as RawItem[];
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.new_itemModels)) {
      return o.new_itemModels as RawItem[];
    }
    if (Array.isArray(o.itemModels) && base) {
      return extractNewItemsFromGenerated(base, assertLoadableLevelData(raw));
    }
  }
  throw new Error('填充响应须为 {"new_itemModels":[...]} 或含 itemModels 的完整关卡');
}

export function mergeFillResponse(
  base: BaseLevelContext,
  raw: unknown,
  form: GenerationForm,
  levelName?: string,
): LevelData {
  const newItems = parseFillNewItems(raw, base);
  const merged = mergeBaseWithNewItems(base, newItems);
  merged.name = levelName?.trim() || merged.name;
  merged.durationInSec = form.durationInSec;
  merged.difficulty = form.difficulty;
  if (form.levelKind != null) merged.levelKind = form.levelKind;
  return merged;
}
