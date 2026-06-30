import { describe, expect, it } from "vitest";
import { parseLevelData } from "../level/parser.ts";
import { GameState } from "./game-state.ts";
import type { RawItem } from "../types.ts";

function levelWithCurtainFrozen(curtainCoversFrozen: boolean) {
  const itemModels: RawItem[] = [
    {
      kind: 6,
      instanceId: 10,
      layer: 1,
      order: 1,
      health: 2,
      occupiedPositions: curtainCoversFrozen
        ? [
            [2, 2],
            [3, 2],
            [2, 3],
            [3, 3],
          ]
        : [
            [0, 0],
            [1, 0],
          ],
    },
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
    {
      kind: 1,
      instanceId: 33,
      layer: 2,
      direction: 2,
      colorId: 3,
      occupiedPositions: [
        [2, 1],
        [2, 0],
      ],
    },
  ];

  return parseLevelData(1, {
    width: 8,
    height: 8,
    name: "curtain frozen",
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

describe("GameState curtain frozen damage", () => {
  it("does not damage frozen under active curtain when adjacent arrow exits", () => {
    const gs = new GameState(levelWithCurtainFrozen(true));
    expect(gs.getFrozenOverlays().length).toBe(0);
    expect(gs.frozenManager.getOverlays()[0]!.health).toBe(2);

    launchUntilDone(gs, 33);

    expect(gs.frozenManager.getOverlays()[0]!.health).toBe(2);
  });

  it("damages frozen after curtain no longer covers host", () => {
    const gs = new GameState(levelWithCurtainFrozen(false));
    expect(gs.getFrozenOverlays()[0]!.health).toBe(2);

    launchUntilDone(gs, 33);

    expect(gs.getFrozenOverlays()[0]!.health).toBe(1);
  });

  it("does not damage frozen when key on same exit opens curtain", () => {
    const level = parseLevelData(1, {
      width: 8,
      height: 8,
      name: "key opens curtain",
      durationInSec: 120,
      difficulty: 1,
      itemModels: [
        {
          kind: 6,
          instanceId: 10,
          layer: 1,
          order: 1,
          health: 1,
          occupiedPositions: [
            [2, 2],
            [3, 2],
            [2, 3],
            [3, 3],
          ],
        },
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
        {
          kind: 1,
          instanceId: 33,
          layer: 2,
          direction: 2,
          colorId: 3,
          occupiedPositions: [
            [2, 1],
            [2, 0],
          ],
        },
        {
          kind: 11,
          instanceId: 40,
          layer: 3,
          occupiedPositions: [[2, 1]],
        },
      ],
    });
    const gs = new GameState(level);
    expect(gs.getActiveCurtainsForRender().length).toBe(1);

    launchUntilDone(gs, 33);

    expect(gs.getActiveCurtainsForRender().length).toBe(0);
    expect(gs.frozenManager.getOverlays()[0]!.health).toBe(2);
  });
});
