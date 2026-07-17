import type { EditorDocument, EditorMeta, LevelData } from "./types.ts";
import { assertLoadableLevelData } from "./parser.ts";
import { findDuplicateInstanceIds, reassignDuplicateIds } from "./items.ts";

export function createEmptyDocument(meta: Partial<EditorMeta> = {}): EditorDocument {
  return {
    meta: {
      width: meta.width ?? 20,
      height: meta.height ?? 32,
      name: meta.name ?? "",
      durationInSec: meta.durationInSec ?? 150,
      difficulty: meta.difficulty ?? 1,
      levelKind: meta.levelKind,
      gameMode: meta.gameMode ?? "classic",
      spawnIntervalSec: meta.spawnIntervalSec,
      spawnPool: meta.spawnPool,
      levelGoals: meta.levelGoals,
      comboEnabled: meta.comboEnabled,
      boardShape: meta.boardShape,
      playableMask: meta.playableMask,
      blackHoleRegions: meta.blackHoleRegions,
      invalidCellColors: meta.invalidCellColors,
    },
    itemModels: [],
    source: { name: "未命名关卡.json" },
    dirty: true,
    selectedInstanceIds: [],
    editContext: { zoneInstanceId: null, regionEditMode: null },
  };
}

export interface CreateDocumentResult {
  doc: EditorDocument;
  warnings: string[];
}

export function createDocumentFromJson(
  name: string,
  raw: unknown,
  handle?: FileSystemFileHandle,
): CreateDocumentResult {
  const data = assertLoadableLevelData(raw);
  const warnings: string[] = [];
  let itemModels = data.itemModels.map(cloneRawItem);

  const dups = findDuplicateInstanceIds(itemModels);
  if (dups.length > 0) {
    const fixed = reassignDuplicateIds(itemModels);
    itemModels = fixed.items;
    warnings.push(`instanceId 冲突已自动重分配：${dups.join(", ")}`);
  }

  const doc: EditorDocument = {
    meta: {
      width: data.width,
      height: data.height,
      name: data.name ?? "",
      durationInSec: data.durationInSec ?? 150,
      difficulty: data.difficulty ?? 1,
      levelKind: data.levelKind,
      gameMode: data.gameMode ?? "classic",
      spawnIntervalSec: data.spawnIntervalSec,
      spawnPool: data.spawnPool?.map((e) => ({ ...e })),
      levelGoals: data.levelGoals?.map((g) =>
        g.type === "clearColorArrows"
          ? {
              type: "clearColorArrows" as const,
              targets: g.targets.map((t) => ({ ...t })),
            }
          : { ...g },
      ),
      comboEnabled: data.comboEnabled,
      boardShape: data.boardShape,
      playableMask: data.playableMask
        ? { rows: data.playableMask.rows.map(([y, a, b]) => [y, a, b] as [number, number, number]) }
        : undefined,
      blackHoleRegions: data.blackHoleRegions?.map((r) => ({
        rows: r.rows.map(([y, a, b]) => [y, a, b] as [number, number, number]),
      })),
      invalidCellColors: data.invalidCellColors?.map((e) => ({
        color: e.color,
        rows: e.rows.map(([y, a, b]) => [y, a, b] as [number, number, number]),
      })),
    },
    itemModels,
    source: { name, handle },
    dirty: false,
    selectedInstanceIds: [],
    editContext: { zoneInstanceId: null, regionEditMode: null },
  };
  return { doc, warnings };
}

function cloneRawItem(item: import("./types.ts").RawItem): import("./types.ts").RawItem {
  const copy: import("./types.ts").RawItem = {
    ...item,
    occupiedPositions: item.occupiedPositions.map(([x, y]) => [x, y]),
  };
  if (item.items) copy.items = item.items.map(cloneRawItem);
  return copy;
}

export function cloneDocument(doc: EditorDocument): EditorDocument {
  return {
    ...doc,
    meta: { ...doc.meta },
    itemModels: doc.itemModels.map(cloneRawItem),
    source: { ...doc.source },
    selectedInstanceIds: [...doc.selectedInstanceIds],
    editContext: { ...doc.editContext },
  };
}

export function parseLevelIdFromFilename(name: string): number {
  const m =
    name.match(/arrowJam-main-level-(\d+)\.json/i) ??
    name.match(/level-(\d+)\.json/i);
  return m ? parseInt(m[1]!, 10) : 0;
}

export function levelDataToDocument(data: LevelData, name: string): EditorDocument {
  return createDocumentFromJson(name, data).doc;
}
