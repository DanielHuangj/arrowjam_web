import { describe, expect, it } from "vitest";
import { parseLevelData } from "../level/parser.ts";
import { GameState } from "./game-state.ts";
import type { RawItem } from "../types.ts";

function levelWithZoneFrozen(overlayOnZone: boolean) {
  const zone: RawItem = {
    kind: 12,
    instanceId: 100,
    layer: 1,
    occupiedPositions: [
      [2, 2],
      [3, 2],
      [2, 3],
      [3, 3],
    ],
    items: [
      {
        kind: 1,
        instanceId: 30,
        layer: 2,
        direction: 3,
        colorId: 1,
        occupiedPositions: [
          [2, 2],
          [3, 2],
        ],
      },
      {
        kind: 13,
        instanceId: 31,
        layer: 8,
        health: 2,
        occupiedPositions: [
          [2, 2],
          [3, 2],
        ],
      },
    ],
  };

  const itemModels: RawItem[] = [zone];
  if (overlayOnZone) {
    itemModels.push({
      kind: 1,
      instanceId: 32,
      layer: 2,
      direction: 3,
      colorId: 1,
      occupiedPositions: [
        [2, 2],
        [1, 2],
      ],
    });
  }
  itemModels.push({
    kind: 1,
    instanceId: 33,
    layer: 2,
    direction: 2,
    colorId: 3,
    occupiedPositions: [
      [2, 1],
      [2, 0],
    ],
  });

  return parseLevelData(1, {
    width: 8,
    height: 8,
    name: "zone frozen",
    durationInSec: 120,
    difficulty: 1,
    itemModels,
  });
}

function launchUntilDone(gs: GameState, arrowId: number): void {
  gs.tryLaunch(arrowId);
  while (gs.phase === "animating") {
    gs.advanceAnimation();
  }
}

describe("GameState zone frozen damage", () => {
  it("does not damage frozen in unrevealed zone when adjacent arrow exits", () => {
    const gs = new GameState(levelWithZoneFrozen(true));
    expect(gs.getFrozenOverlays().length).toBe(0);
    expect(gs.frozenManager.getOverlays()[0]!.health).toBe(2);

    launchUntilDone(gs, 33);

    expect(gs.frozenManager.getOverlays()[0]!.health).toBe(2);
  });

  it("damages frozen after zone content is revealed", () => {
    const gs = new GameState(levelWithZoneFrozen(false));
    expect(gs.getFrozenOverlays()[0]!.health).toBe(2);

    launchUntilDone(gs, 33);

    expect(gs.getFrozenOverlays()[0]!.health).toBe(1);
  });
});
