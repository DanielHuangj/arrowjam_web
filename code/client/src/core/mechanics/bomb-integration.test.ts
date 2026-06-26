import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BOMB_EXPLOSION_DURATION } from "./bomb.ts";
import { GameState } from "../game/game-state.ts";
import { parseLevelData } from "../level/parser.ts";

const levelPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../test-fixtures/levels/level-9004.json",
);

function load9004() {
  const data = JSON.parse(readFileSync(levelPath, "utf-8"));
  return parseLevelData(9004, data);
}

describe("bomb integration", () => {
  it("bomb follows host arrow during exit animation", () => {
    const gs = new GameState(load9004());
    const before = gs.getBombDrawStates()[0]!.bomb.occupiedPositions[0]!;
    expect(before).toEqual([5, 5]);

    gs.tryLaunch(43);
    expect(gs.phase).toBe("animating");
    gs.advanceAnimation();

    const after = gs.getBombDrawStates()[0]!.bomb.occupiedPositions[0]!;
    expect(after).not.toEqual(before);
    expect(after).toEqual([6, 5]);
  });

  it("removes bomb when host arrow is eliminated", () => {
    const gs = new GameState(load9004());
    gs.tryTargetVanishAtCell([5, 5]);
    while (gs.phase === "animating") {
      gs.advanceAnimation();
    }
    expect(gs.getBombDrawStates().length).toBe(0);
  });

  it("plays explosion before lost", () => {
    const gs = new GameState(load9004());
    gs.bombManager.updateActivation(() => false);
    gs.tick(20);

    expect(gs.phase).toBe("exploding");
    expect(gs.getBombExplosion()).not.toBeNull();
    expect(gs.getBombExplosion()!.progress).toBeLessThan(1);

    gs.tick(BOMB_EXPLOSION_DURATION);
    expect(gs.phase).toBe("lost");
    expect(gs.getLostReason()).toBe("bomb");
    expect(gs.getBombExplosion()).toBeNull();
  });
});
