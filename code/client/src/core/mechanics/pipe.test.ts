import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLevelData } from "../level/parser.ts";
import { GameState } from "../game/game-state.ts";
import {
  advanceArrowStep,
  getArrowPipeCrossings,
  getArrowCornerCrossings,
  getPipeSideKeys,
  getPipeTraversalPath,
  isDirAllowedAtPass,
  isHeadBlockedByPipe,
  simulateCanExitWithPipes,
  tryStartPipeTransit,
} from "./pipe.ts";
import { isValidCornerEntry } from "./corner.ts";
import type { ArrowItem, CornerItem, PipeItem } from "../types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const levelsDir = join(__dirname, "../../../public/levels");

function loadLevel(id: number) {
  const raw = readFileSync(join(levelsDir, `level-${id}.json`), "utf-8");
  return parseLevelData(id, JSON.parse(raw));
}

const horizontalPipe: PipeItem = {
  kind: 3,
  instanceId: 134,
  layer: 2,
  zoneId: null,
  occupiedPositions: [
    [12, 8],
    [13, 8],
    [14, 8],
    [15, 8],
    [16, 8],
    [17, 8],
    [18, 8],
    [19, 8],
  ],
  health: 3,
  passes: [
    { position: [12, 8], directions: [[-1, 0], [1, 0]] },
    { position: [19, 8], directions: [[-1, 0], [1, 0]] },
  ],
  healthViewPathIndex: 1,
};

describe("pipe mechanics", () => {
  it("blocks only perpendicular entry into pipe from side cells", () => {
    const sides = getPipeSideKeys(horizontalPipe);
    expect(sides.has("13,7")).toBe(true);
    expect(isHeadBlockedByPipe([13, 7], 1, [horizontalPipe])).toBe(true);
    expect(isHeadBlockedByPipe([13, 7], 3, [horizontalPipe])).toBe(false);
  });

  it("reflects at corner on pipe side before pipe blocking check", () => {
    const corner: CornerItem = {
      kind: 4,
      instanceId: 99,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[13, 7]],
      direction1: [1, 0],
      direction2: [0, -1],
    };
    const arrow: ArrowItem = {
      kind: 1,
      instanceId: 1,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[13, 5], [13, 6]],
      direction: 1,
      colorId: 3,
    };
    const step = advanceArrowStep(arrow, 1, null, [corner], [horizontalPipe]);
    expect(step.blocked).toBe(false);
    expect(step.dir).toBe(3);
    expect(step.cornerReflectedId).toBe(99);
    expect(step.arrow.occupiedPositions.at(-1)).toEqual([13, 7]);
  });

  it("blocks entry into corner from non-reflection face", () => {
    const corner: CornerItem = {
      kind: 4,
      instanceId: 99,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[13, 7]],
      direction1: [1, 0],
      direction2: [0, -1],
    };
    const arrow: ArrowItem = {
      kind: 1,
      instanceId: 1,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[12, 7]],
      direction: 3,
      colorId: 3,
    };
    const step = advanceArrowStep(arrow, 3, null, [corner], []);
    expect(step.blocked).toBe(true);
    expect(isValidCornerEntry(3, corner)).toBe(false);
    expect(
      simulateCanExitWithPipes(
        arrow,
        [arrow],
        [corner],
        { width: 12, height: 12 },
        [],
      ),
    ).toBe(false);
  });

  it("tracks corner crossings during full flight simulation", () => {
    const corner: CornerItem = {
      kind: 4,
      instanceId: 5,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[5, 6]],
      direction1: [1, 0],
      direction2: [0, -1],
    };
    const arrow: ArrowItem = {
      kind: 1,
      instanceId: 1,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[5, 4], [5, 5]],
      direction: 1,
      colorId: 3,
    };
    expect(
      getArrowCornerCrossings(
        arrow,
        [arrow],
        [corner],
        { width: 12, height: 12 },
        [],
      ),
    ).toEqual([5]);
  });

  it("builds traversal path along pipe body", () => {
    const path = getPipeTraversalPath(horizontalPipe, 0);
    expect(path[0]).toEqual([12, 8]);
    expect(path.at(-1)).toEqual([19, 8]);
    expect(path.length).toBe(8);
  });

  it("enters pipe at endpoint and walks through to exit", () => {
    const arrow: ArrowItem = {
      kind: 1,
      instanceId: 1,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[10, 8], [11, 8]],
      direction: 3,
      colorId: 3,
    };
    let transit = null;
    let current = arrow;
    let dir = 3 as const;
    const pipes = [horizontalPipe];

    const step1 = advanceArrowStep(current, dir, transit, [], pipes);
    expect(step1.transit).not.toBeNull();
    current = step1.arrow;
    transit = step1.transit;
    dir = step1.dir;

    let exited = false;
    for (let i = 0; i < 12; i++) {
      const step = advanceArrowStep(current, dir, transit, [], pipes);
      current = step.arrow;
      transit = step.transit;
      dir = step.dir;
      if (step.pipeExitedId != null) {
        exited = true;
        break;
      }
    }
    expect(exited).toBe(true);
    expect(current.occupiedPositions.at(-1)).toEqual([19, 8]);
  });

  it("arrow parallel to pipe on side row can exit", () => {
    const arrow: ArrowItem = {
      kind: 1,
      instanceId: 1,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[10, 7], [11, 7]],
      direction: 3,
      colorId: 3,
    };
    expect(
      simulateCanExitWithPipes(
        arrow,
        [arrow],
        [],
        { width: 25, height: 25 },
        [horizontalPipe],
      ),
    ).toBe(true);
    expect(
      getArrowPipeCrossings(
        arrow,
        [arrow],
        [],
        { width: 25, height: 25 },
        [horizontalPipe],
      ),
    ).toEqual([]);
  });

  it("records pipe id when arrow traverses through pipe", () => {
    const arrow: ArrowItem = {
      kind: 1,
      instanceId: 1,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[10, 8], [11, 8]],
      direction: 3,
      colorId: 3,
    };
    const crossed = getArrowPipeCrossings(
      arrow,
      [arrow],
      [],
      { width: 25, height: 25 },
      [horizontalPipe],
    );
    expect(crossed).toContain(horizontalPipe.instanceId);
  });

  it("bump reverses when arrow hits pipe wall", () => {
    const arrow: ArrowItem = {
      kind: 1,
      instanceId: 1,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[13, 5], [13, 6]],
      direction: 1,
      colorId: 3,
    };
    const gs = new GameState({
      id: 45,
      width: 25,
      height: 30,
      name: "t",
      durationInSec: 60,
      difficulty: 1,
      arrows: [arrow],
      corners: [],
      zones: [],
      bundles: [],
      pipes: [horizontalPipe],
      curtains: [],
      keys: [],
    });
    expect(gs.tryLaunch(1)).toBe(true);
    expect(gs.animation?.mode).toBe("bump");
    while (gs.phase === "animating") gs.advanceAnimation();
    expect(gs.phase).toBe("playing");
    expect(gs.pipes[0]!.health).toBe(3);
    expect(gs.arrows[0]!.occupiedPositions).toEqual([
      [13, 5],
      [13, 6],
    ]);
    expect(gs.arrows[0]!.direction).toBe(1);
  });

  it("restores direction after bump through pipe transit", () => {
    const arrow: ArrowItem = {
      kind: 1,
      instanceId: 1,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[10, 8], [11, 8]],
      direction: 3,
      colorId: 3,
    };
    const blocker: ArrowItem = {
      kind: 1,
      instanceId: 2,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[20, 8], [21, 8]],
      direction: 3,
      colorId: 6,
    };
    const gs = new GameState({
      id: 45,
      width: 25,
      height: 30,
      name: "t",
      durationInSec: 60,
      difficulty: 1,
      arrows: [arrow, blocker],
      corners: [],
      zones: [],
      bundles: [],
      pipes: [horizontalPipe],
      curtains: [],
      keys: [],
    });
    expect(gs.tryLaunch(1)).toBe(true);
    expect(gs.animation?.mode).toBe("bump");
    while (gs.phase === "animating") gs.advanceAnimation();
    expect(gs.phase).toBe("playing");
    expect(gs.arrows[0]!.occupiedPositions).toEqual([
      [10, 8],
      [11, 8],
    ]);
    expect(gs.arrows[0]!.direction).toBe(3);
  });

  it("allows entry at pass endpoint with valid direction", () => {
    expect(isDirAllowedAtPass(3, horizontalPipe.passes[0]!)).toBe(true);
    expect(tryStartPipeTransit([12, 8], 3, [horizontalPipe])).not.toBeNull();
    expect(isHeadBlockedByPipe([14, 8], 3, [horizontalPipe])).toBe(true);
  });

  const lShapedPipe: PipeItem = {
    kind: 3,
    instanceId: 1,
    layer: 2,
    zoneId: null,
    occupiedPositions: [
      [0, 25],
      [0, 26],
      [0, 27],
      [0, 28],
      [0, 29],
      [1, 29],
      [2, 29],
      [3, 29],
      [4, 29],
    ],
    health: 4,
    passes: [
      { position: [0, 25], directions: [[0, 1], [0, -1]] },
      { position: [4, 29], directions: [[-1, 0], [1, 0]] },
    ],
    healthViewPathIndex: 1,
  };

  it("enters L-shaped pipe when entry and exit pass directions differ (L48)", () => {
    const arrow: ArrowItem = {
      kind: 1,
      instanceId: 18,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[0, 23], [0, 24]],
      direction: 1,
      colorId: 3,
    };
    expect(isHeadBlockedByPipe([0, 25], 1, [lShapedPipe])).toBe(false);
    expect(tryStartPipeTransit([0, 25], 1, [lShapedPipe])).not.toBeNull();

    const step = advanceArrowStep(arrow, 1, null, [], [lShapedPipe]);
    expect(step.blocked).toBe(false);
    expect(step.transit).not.toBeNull();
    expect(step.arrow.occupiedPositions.at(-1)).toEqual([0, 25]);
  });

  it("parses pipes on L41", () => {
    const level = loadLevel(41);
    expect(level.pipes.length).toBe(3);
  });

  it("decrements pipe health only after arrow exits board through pipe", () => {
    const arrow: ArrowItem = {
      kind: 1,
      instanceId: 1,
      layer: 2,
      zoneId: null,
      occupiedPositions: [[10, 8], [11, 8]],
      direction: 3,
      colorId: 3,
    };
    const gs = new GameState({
      id: 41,
      width: 25,
      height: 25,
      name: "t",
      durationInSec: 60,
      difficulty: 1,
      arrows: [arrow],
      corners: [],
      zones: [],
      bundles: [],
      pipes: [horizontalPipe],
      curtains: [],
      keys: [],
    });
    gs.tryLaunch(1);
    let steps = 0;
    while (gs.phase === "animating" && steps < 300) {
      gs.advanceAnimation();
      steps++;
    }
    expect(gs.phase).toBe("won");
    expect(gs.pipes[0]!.health).toBe(2);
  });
});
