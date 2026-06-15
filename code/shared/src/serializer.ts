import type { EditorDocument, LevelData, RawItem } from "./types.ts";
import { levelDataFromDocument } from "./items.ts";

function serializeRawItem(item: RawItem): Record<string, unknown> {
  const out: Record<string, unknown> = {
    kind: item.kind,
    occupiedPositions: item.occupiedPositions.map(([x, y]) => [x, y]),
    instanceId: item.instanceId,
    layer: item.layer,
  };

  if (item.kind === 1) {
    out.direction = item.direction;
    out.colorId = item.colorId;
  } else if (item.kind === 4) {
    out.direction1 = item.direction1;
    out.direction2 = item.direction2;
  } else if (item.kind === 3) {
    out.health = item.health;
    out.passes = item.passes;
    out.healthViewPathIndex = item.healthViewPathIndex ?? 0;
  } else if (item.kind === 6) {
    out.health = item.health;
    out.order = item.order ?? 0;
  } else if (item.kind === 12 && item.items) {
    out.items = item.items.map(serializeRawItem);
  }

  return out;
}

export function serializeLevelData(doc: Pick<EditorDocument, "meta" | "itemModels">): string {
  const data = levelDataFromDocument(doc);
  const obj: Record<string, unknown> = {
    width: data.width,
    height: data.height,
    name: data.name,
    durationInSec: data.durationInSec,
    difficulty: data.difficulty,
    itemModels: data.itemModels.map(serializeRawItem),
  };
  if (data.levelKind != null) obj.levelKind = data.levelKind;
  return JSON.stringify(obj, null, 2);
}

export function serializeLevelDataObject(doc: Pick<EditorDocument, "meta" | "itemModels">): LevelData {
  return levelDataFromDocument(doc);
}
