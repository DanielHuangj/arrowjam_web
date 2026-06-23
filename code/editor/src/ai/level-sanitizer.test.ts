import { describe, expect, it } from "vitest";
import { directionFromLastSegment, flipArrowDirection2 } from "../tools/draw-state.ts";
import { sanitizeLevelJson, sanitizeLevelData } from "./level-sanitizer.ts";
import { validateLevelJsonString } from "./validate-level.ts";
import type { GenerationForm } from "./types.ts";
import type { LevelData } from "@arrowjaw/shared";

const form20K1: GenerationForm = {
  prefix: "hjtest",
  width: 20,
  height: 20,
  durationInSec: 120,
  difficulty: 1,
  levelKind: 2,
  count: 1,
  allowedKinds: [1],
  keywords: "",
};

/** 模拟 hjtest log：77 格、2 处 overlap（(10,8) #2/#3、(15,5) #8/#9） */
function buildLogFailureFixture(): LevelData {
  return {
    width: 20,
    height: 20,
    name: "hjtest #004",
    durationInSec: 120,
    difficulty: 1,
    itemModels: [
      { kind: 1, instanceId: 1, layer: 2, direction: 3, colorId: 6, occupiedPositions: [[0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5], [11, 5], [12, 5], [13, 5]] },
      { kind: 1, instanceId: 2, layer: 2, direction: 1, colorId: 6, occupiedPositions: [[10, 6], [10, 7], [10, 8]] },
      { kind: 1, instanceId: 3, layer: 2, direction: 3, colorId: 7, occupiedPositions: [[10, 8], [11, 8], [12, 8], [13, 8], [14, 8]] },
      { kind: 1, instanceId: 4, layer: 2, direction: 1, colorId: 7, occupiedPositions: [[5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [6, 4], [7, 4]] },
      { kind: 1, instanceId: 5, layer: 2, direction: 3, colorId: 3, occupiedPositions: [[0, 10], [1, 10], [2, 10], [3, 10], [4, 10], [5, 10], [6, 10], [7, 10]] },
      { kind: 1, instanceId: 6, layer: 2, direction: 2, colorId: 3, occupiedPositions: [[18, 10], [18, 9], [18, 8], [18, 7], [18, 6], [18, 5]] },
      { kind: 1, instanceId: 7, layer: 2, direction: 4, colorId: 6, occupiedPositions: [[15, 0], [14, 0], [13, 0], [12, 0], [11, 0], [10, 0], [9, 0]] },
      { kind: 1, instanceId: 8, layer: 2, direction: 3, colorId: 7, occupiedPositions: [[15, 3], [15, 4], [15, 5]] },
      { kind: 1, instanceId: 9, layer: 2, direction: 1, colorId: 6, occupiedPositions: [[15, 5], [15, 6], [15, 7], [15, 8], [15, 9], [15, 10]] },
      { kind: 1, instanceId: 10, layer: 2, direction: 2, colorId: 3, occupiedPositions: [[8, 15], [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9]] },
      { kind: 1, instanceId: 11, layer: 2, direction: 3, colorId: 6, occupiedPositions: [[12, 12], [13, 12], [14, 12], [15, 12], [16, 12], [17, 12], [18, 12]] },
      { kind: 1, instanceId: 12, layer: 2, direction: 1, colorId: 7, occupiedPositions: [[19, 0], [19, 1], [19, 2], [19, 3], [19, 4], [19, 5]] },
    ],
  };
}

function countBodyCells(data: LevelData): number {
  const cells = new Set<string>();
  for (const item of data.itemModels) {
    if (item.kind === 1 || item.kind === 2) {
      for (const p of item.occupiedPositions) {
        cells.add(`${p[0]},${p[1]}`);
      }
    }
  }
  return cells.size;
}

describe("level-sanitizer", () => {
  it("fixture matches log failure pattern before sanitize", () => {
    const data = buildLogFailureFixture();
    expect(countBodyCells(data)).toBe(77);
    const before = validateLevelJsonString(JSON.stringify(data), form20K1);
    expect(before.ok).toBe(false);
    expect(before.issues.some((i) => i.id === "AI-DENSITY")).toBe(true);
    expect(before.issues.filter((i) => i.id === "AI-OVERLAP").length).toBeGreaterThanOrEqual(2);
  });

  it("fixes overlap, density, and V11 for log-like fixture", () => {
    const data = buildLogFailureFixture();
    data.itemModels[0]!.direction = 1;

    const result = sanitizeLevelData(data, form20K1);
    expect(result.changed).toBe(true);
    expect(result.actions.some((a) => a.includes("AI-OVERLAP"))).toBe(true);
    expect(result.actions.some((a) => a.includes("AI-DENSITY"))).toBe(true);
    expect(result.actions.some((a) => a.includes("V11"))).toBe(true);

    const validated = validateLevelJsonString(result.json, form20K1);
    expect(validated.ok, JSON.stringify(validated.issues)).toBe(true);
  });

  it("sanitizeLevelJson removes disallowed kind", () => {
    const json = JSON.stringify({
      width: 12,
      height: 12,
      name: "t",
      durationInSec: 120,
      difficulty: 1,
      itemModels: [
        { kind: 2, instanceId: 1, layer: 2, direction1: 3, direction2: 4, colorId: 1, occupiedPositions: [[0, 0], [1, 0]] },
        { kind: 1, instanceId: 2, layer: 2, direction: 3, colorId: 6, occupiedPositions: [[0, 5], [1, 5], [2, 5]] },
      ],
    });
    const form: GenerationForm = { ...form20K1, width: 12, height: 12 };
    const result = sanitizeLevelJson(json, form);
    expect(result.actions.some((a) => a.includes("AI-KIND"))).toBe(true);
    const parsed = JSON.parse(result.json);
    expect(parsed.itemModels.every((i: { kind: number }) => i.kind === 1)).toBe(true);
  });

  it("20x20 K1 smoke: sanitizer rescues sparse overlapping levels repeatedly", () => {
    let passCount = 0;
    for (let n = 0; n < 10; n++) {
      const data = buildLogFailureFixture();
      data.itemModels.forEach((item, idx) => {
        if (idx % 3 === 0) item.direction = 1;
      });
      const result = sanitizeLevelData(data, form20K1);
      if (validateLevelJsonString(result.json, form20K1).ok) passCount++;
    }
    expect(passCount).toBeGreaterThanOrEqual(6);
  });

  it("fixes malformed pipe passes (bare coordinates) without LOAD crash", () => {
    const data: LevelData = {
      width: 16,
      height: 16,
      itemModels: [
        {
          kind: 3,
          instanceId: 1,
          layer: 2,
          occupiedPositions: [[4, 8], [5, 8], [6, 8], [7, 8]],
          passes: [[4, 8], [7, 8]],
        },
        {
          kind: 1,
          instanceId: 2,
          layer: 2,
          direction: 3,
          colorId: 6,
          occupiedPositions: [[0, 0], [1, 0], [2, 0]],
        },
      ],
    };
    const form: GenerationForm = { ...form20K1, width: 16, height: 16, allowedKinds: [1, 3] };
    const result = sanitizeLevelData(data, form);
    expect(result.changed).toBe(true);
    expect(result.actions.some((a) => a.includes("pipe #1"))).toBe(true);

    const parsed = JSON.parse(result.json);
    const pipe = parsed.itemModels.find((i: { kind: number }) => i.kind === 3);
    expect(pipe.passes).toHaveLength(2);
    expect(pipe.passes[0]).toMatchObject({ position: [4, 8] });
    expect(pipe.passes[0].directions).toHaveLength(2);
    expect(pipe.health).toBeGreaterThan(0);

    const validation = validateLevelJsonString(result.json, form);
    expect(validation.issues.some((i) => i.id === "LOAD")).toBe(false);
  });

  it("snaps pass positions to path endpoints and sets mid healthViewPathIndex", () => {
    const data: LevelData = {
      width: 16,
      height: 16,
      itemModels: [
        {
          kind: 3,
          instanceId: 1,
          layer: 2,
          health: 4,
          healthViewPathIndex: 0,
          occupiedPositions: [[4, 8], [5, 8], [6, 8], [7, 8]],
          passes: [
            { position: [6, 8], directions: [[-1, 0], [1, 0]] },
            { position: [5, 8], directions: [[-1, 0], [1, 0]] },
          ],
        },
      ],
    };
    const form: GenerationForm = { ...form20K1, width: 16, height: 16, allowedKinds: [1, 3] };
    const result = sanitizeLevelData(data, form);
    const pipe = JSON.parse(result.json).itemModels[0];
    expect(pipe.passes[0].position).toEqual([4, 8]);
    expect(pipe.passes[1].position).toEqual([7, 8]);
    expect(pipe.healthViewPathIndex).toBe(2);
  });

  it("resolves pipe-arrow overlap by shifting or trimming pipe", () => {
    const data: LevelData = {
      width: 16,
      height: 16,
      itemModels: [
        {
          kind: 3,
          instanceId: 1,
          layer: 2,
          health: 3,
          healthViewPathIndex: 0,
          occupiedPositions: [[5, 8], [6, 8], [7, 8]],
          passes: [[5, 8], [7, 8]],
        },
        {
          kind: 1,
          instanceId: 2,
          layer: 2,
          direction: 3,
          colorId: 6,
          occupiedPositions: [[6, 8], [7, 8], [8, 8]],
        },
      ],
    };
    const form: GenerationForm = { ...form20K1, width: 16, height: 16, allowedKinds: [1, 3] };
    const result = sanitizeLevelData(data, form);
    const parsed = JSON.parse(result.json);
    const pipeCells = new Set(
      parsed.itemModels
        .find((i: { kind: number }) => i.kind === 3)
        .occupiedPositions.map((p: number[]) => `${p[0]},${p[1]}`),
    );
    const arrowCells = parsed.itemModels
      .find((i: { kind: number }) => i.kind === 1)
      .occupiedPositions.map((p: number[]) => `${p[0]},${p[1]}`);
    for (const key of arrowCells) {
      expect(pipeCells.has(key)).toBe(false);
    }
    expect(result.actions.some((a) => a.includes("AI-PIPE-OVERLAP"))).toBe(true);
  });

  it("resolves corner-arrow overlap by moving corner or adjusting arrow", () => {
    const data: LevelData = {
      width: 16,
      height: 16,
      itemModels: [
        {
          kind: 4,
          instanceId: 1,
          layer: 2,
          direction1: [1, 0],
          direction2: [0, 1],
          occupiedPositions: [[6, 8]],
        },
        {
          kind: 1,
          instanceId: 2,
          layer: 2,
          direction: 3,
          colorId: 6,
          occupiedPositions: [[5, 8], [6, 8], [7, 8]],
        },
      ],
    };
    const form: GenerationForm = { ...form20K1, width: 16, height: 16, allowedKinds: [1, 4] };
    const result = sanitizeLevelData(data, form);
    const parsed = JSON.parse(result.json);
    const corner = parsed.itemModels.find((i: { kind: number }) => i.kind === 4);
    const arrow = parsed.itemModels.find((i: { kind: number }) => i.kind === 1);
    expect(corner).toBeDefined();
    const cornerKey = `${corner.occupiedPositions[0][0]},${corner.occupiedPositions[0][1]}`;
    const arrowKeys = new Set(
      arrow.occupiedPositions.map((p: number[]) => `${p[0]},${p[1]}`),
    );
    expect(arrowKeys.has(cornerKey)).toBe(false);
    expect(result.actions.some((a) => a.includes("AI-CORNER-OVERLAP"))).toBe(true);
  });

  it("fixes flip arrow direction1/direction2 to match polyline segments", () => {
    const data: LevelData = {
      width: 12,
      height: 12,
      itemModels: [
        {
          kind: 2,
          instanceId: 1,
          layer: 2,
          direction1: 1,
          direction2: 1,
          colorId: 7,
          occupiedPositions: [[5, 6], [6, 6], [7, 6]],
        },
      ],
    };
    const form: GenerationForm = { ...form20K1, width: 12, height: 12, allowedKinds: [2] };
    const result = sanitizeLevelData(data, form, { frozenArrowIds: new Set([1]) });
    const flip = JSON.parse(result.json).itemModels[0];
    const pl = flip.occupiedPositions;
    expect(flip.direction1).toBe(directionFromLastSegment(pl));
    expect(flip.direction2).toBe(flipArrowDirection2(pl));
    expect(flip.direction1).toBe(3);
    expect(flip.direction2).toBe(4);
    expect(result.actions.some((a) => a.includes("V11") && a.includes("#1"))).toBe(true);
    expect(validateLevelJsonString(result.json, form).issues.some((i) => i.id === "V11")).toBe(
      false,
    );
  });

  it("resolves cross-arrow overlaps like bomb-level bottleneck conflicts", () => {
    const data: LevelData = {
      width: 16,
      height: 16,
      itemModels: [
        {
          kind: 1,
          instanceId: 4,
          layer: 2,
          direction: 3,
          colorId: 6,
          occupiedPositions: [[4, 5], [5, 5], [6, 5], [7, 5], [8, 5]],
        },
        {
          kind: 1,
          instanceId: 5,
          layer: 2,
          direction: 1,
          colorId: 7,
          occupiedPositions: [[7, 3], [7, 4], [7, 5], [7, 6]],
        },
        {
          kind: 1,
          instanceId: 6,
          layer: 2,
          direction: 1,
          colorId: 3,
          occupiedPositions: [[8, 3], [8, 4], [8, 5], [8, 6]],
        },
        {
          kind: 5,
          instanceId: 20,
          layer: 3,
          time: 12,
          occupiedPositions: [[7, 6]],
        },
        {
          kind: 1,
          instanceId: 1,
          layer: 2,
          direction: 3,
          colorId: 6,
          occupiedPositions: [[0, 5], [1, 5], [2, 5]],
        },
        {
          kind: 1,
          instanceId: 2,
          layer: 2,
          direction: 3,
          colorId: 7,
          occupiedPositions: [[0, 7], [1, 7], [2, 7]],
        },
        {
          kind: 1,
          instanceId: 3,
          layer: 2,
          direction: 1,
          colorId: 3,
          occupiedPositions: [[9, 0], [9, 1], [9, 2]],
        },
      ],
    };
    const form: GenerationForm = {
      ...form20K1,
      width: 16,
      height: 16,
      allowedKinds: [1, 5],
    };
    const result = sanitizeLevelData(data, form);
    const validated = validateLevelJsonString(result.json, form);
    const overlapIssues = validated.issues.filter((i) => i.id === "AI-OVERLAP");
    const v04Issues = validated.issues.filter((i) => i.id === "V04");
    expect(overlapIssues.length).toBe(0);
    expect(v04Issues.length).toBe(0);
    expect(result.actions.some((a) => a.includes("AI-OVERLAP"))).toBe(true);
  });

  it("moves bomb from arrow head to mid-body segment", () => {
    const data: LevelData = {
      width: 12,
      height: 12,
      itemModels: [
        {
          kind: 1,
          instanceId: 2,
          layer: 2,
          direction: 3,
          colorId: 6,
          occupiedPositions: [[3, 5], [4, 5], [5, 5], [6, 5], [7, 5]],
        },
        {
          kind: 5,
          instanceId: 10,
          layer: 3,
          time: 12,
          occupiedPositions: [[7, 5]],
        },
      ],
    };
    const form: GenerationForm = {
      ...form20K1,
      width: 12,
      height: 12,
      allowedKinds: [1, 5],
    };
    const result = sanitizeLevelData(data, form, { frozenArrowIds: new Set([2]) });
    const bomb = JSON.parse(result.json).itemModels.find((i: { kind: number }) => i.kind === 5);
    expect(bomb.occupiedPositions[0]).toEqual([5, 5]);
    expect(result.actions.some((a) => a.includes("AI-BOMB-ANCHOR"))).toBe(true);
    expect(validateLevelJsonString(result.json, form).issues.some((i) => i.id === "AI-BOMB-ANCHOR")).toBe(
      false,
    );
  });
});
