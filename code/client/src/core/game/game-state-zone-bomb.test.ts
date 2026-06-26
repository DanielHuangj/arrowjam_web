import { describe, expect, it } from "vitest";
import { parseLevelData } from "../level/parser.ts";
import { GameState } from "./game-state.ts";
import type { RawItem } from "../types.ts";

function levelWithZoneBomb(overlayOnZone: boolean) {
  const zone: RawItem = {
    kind: 12,
    instanceId: 100,
    layer: 1,
    occupiedPositions: [[2, 2], [3, 2]],
    items: [
      {
        kind: 1,
        instanceId: 2,
        layer: 2,
        direction: 3,
        colorId: 1,
        occupiedPositions: [[2, 2], [3, 2], [4, 2]],
      },
      {
        kind: 5,
        instanceId: 5,
        layer: 3,
        time: 10,
        occupiedPositions: [[3, 2]],
      },
    ],
  };

  const itemModels: RawItem[] = [zone];
  if (overlayOnZone) {
    itemModels.push({
      kind: 1,
      instanceId: 1,
      layer: 2,
      direction: 3,
      colorId: 1,
      occupiedPositions: [[2, 2], [1, 2]],
    });
  }

  return parseLevelData(1, {
    width: 8,
    height: 8,
    name: "zone bomb",
    durationInSec: 120,
    difficulty: 1,
    itemModels,
  });
}

describe("GameState zone bomb visibility", () => {
  it("hides bombs in unrevealed zones", () => {
    const gs = new GameState(levelWithZoneBomb(true));
    expect(gs.getBombDrawStates().length).toBe(0);
  });

  it("shows bombs when zone content is revealed", () => {
    const level = levelWithZoneBomb(false);
    expect(level.bombs[0]?.zoneId).toBe(100);
    const gs = new GameState(level);
    expect(gs.getBombDrawStates().length).toBe(1);
    expect(gs.getBombDrawStates()[0]!.bomb.zoneId).toBe(100);
  });

  it("does not start countdown while zone is unrevealed", () => {
    const gs = new GameState(levelWithZoneBomb(true));
    expect(gs.getUrgentBombRemaining()).toBeNull();
    expect(gs.bombManager.activeBombs.every((b) => !b.activated)).toBe(true);
  });
});

describe("zone bomb host binding", () => {
  it("binds to zone arrow when top-level arrow shares bomb cell", () => {
    const level = parseLevelData(1, {
      width: 20,
      height: 20,
      name: "overlap",
      durationInSec: 120,
      difficulty: 1,
      itemModels: [
        {
          kind: 1,
          instanceId: 10,
          layer: 2,
          direction: 3,
          colorId: 1,
          occupiedPositions: [
            [5, 5],
            [6, 5],
            [7, 5],
          ],
        },
        {
          kind: 12,
          instanceId: 100,
          layer: 1,
          occupiedPositions: [
            [5, 5],
            [6, 5],
            [7, 5],
          ],
          items: [
            {
              kind: 1,
              instanceId: 20,
              layer: 2,
              direction: 3,
              colorId: 2,
              occupiedPositions: [
                [5, 5],
                [6, 5],
              ],
            },
            {
              kind: 5,
              instanceId: 21,
              layer: 3,
              time: 10,
              occupiedPositions: [[6, 5]],
            },
          ],
        },
      ],
    });
    const bomb = level.bombs.find((b) => b.instanceId === 21)!;
    expect(bomb.hostArrowId).toBe(20);
    expect(bomb.zoneId).toBe(100);
    const gs = new GameState(level);
    expect(gs.getUrgentBombRemaining()).toBeNull();
  });

  it("binds top-level bomb to overlay arrow when zone arrow shares bomb cell", () => {
    const level = parseLevelData(1, {
      width: 20,
      height: 20,
      name: "overlay bomb",
      durationInSec: 120,
      difficulty: 1,
      itemModels: [
        {
          kind: 12,
          instanceId: 100,
          layer: 1,
          occupiedPositions: [
            [5, 5],
            [6, 5],
            [7, 5],
          ],
          items: [
            {
              kind: 1,
              instanceId: 20,
              layer: 2,
              direction: 3,
              colorId: 2,
              occupiedPositions: [
                [5, 5],
                [6, 5],
              ],
            },
          ],
        },
        {
          kind: 1,
          instanceId: 10,
          layer: 2,
          direction: 3,
          colorId: 1,
          occupiedPositions: [
            [5, 5],
            [6, 5],
            [7, 5],
          ],
        },
        {
          kind: 5,
          instanceId: 21,
          layer: 3,
          time: 10,
          occupiedPositions: [[6, 5]],
        },
      ],
    });
    const bomb = level.bombs.find((b) => b.instanceId === 21)!;
    expect(bomb.hostArrowId).toBe(10);
    expect(bomb.zoneId).toBeNull();
    const gs = new GameState(level);
    expect(gs.getUrgentBombRemaining()).toBe(10);
    expect(gs.bombManager.activeBombs.find((b) => b.bomb.instanceId === 21)?.activated).toBe(
      true,
    );
  });
});
