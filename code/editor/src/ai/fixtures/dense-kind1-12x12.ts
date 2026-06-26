import type { LevelData } from "@arrowjaw/shared";

function buildDenseKind1Grid(width: number, height: number): LevelData {
  const rowLen = Math.min(width, Math.max(6, Math.ceil((width * height * 0.62) / height)));
  const itemModels: LevelData["itemModels"] = [];
  for (let y = 0; y < height; y++) {
    const startX = y % 2 === 0 ? 0 : width - rowLen;
    const occupiedPositions: [number, number][] = [];
    for (let x = startX; x < startX + rowLen; x++) {
      occupiedPositions.push([x, y]);
    }
    itemModels.push({
      kind: 1,
      instanceId: y + 1,
      layer: 2,
      direction: 3,
      colorId: (y % 4) + 1,
      occupiedPositions,
    });
  }
  return {
    width,
    height,
    name: `test-dense-${width}`,
    durationInSec: width >= 16 ? 150 : 120,
    difficulty: 1,
    itemModels,
  };
}

/** 12×12 纯 kind1：12 条箭、96 格占用（≥60%），各行右向飞出可解 */
export function buildDenseKind1_12x12(): LevelData {
  return buildDenseKind1Grid(12, 12);
}

/** 16×16 纯 kind1：16 条箭、160 格占用（≥60%） */
export function buildDenseKind1_16x16(): LevelData {
  return buildDenseKind1Grid(16, 16);
}

export const denseKind1_12x12 = buildDenseKind1_12x12();
export const denseKind1LevelJson = JSON.stringify(denseKind1_12x12);
