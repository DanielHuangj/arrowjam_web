import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GameState } from "../game/game-state.ts";
import { parseLevelData } from "../level/parser.ts";

const levelPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../public/levels/level-9003.json",
);

function load9003() {
  const data = JSON.parse(readFileSync(levelPath, "utf-8"));
  return parseLevelData(9003, data);
}

function launchUntilDone(gs: GameState, arrowId: number): void {
  gs.tryLaunch(arrowId);
  while (gs.phase === "animating") {
    gs.advanceAnimation();
  }
}

describe("frozen integration", () => {
  it("blocks other arrows while host is frozen", () => {
    const gs = new GameState(load9003());
    expect(gs.getActiveArrows().some((a) => a.instanceId === 30)).toBe(false);
    expect(gs.getBlockingArrows().some((a) => a.instanceId === 30)).toBe(true);

    const attacker = gs.arrows.find((a) => a.instanceId === 32)!;
    attacker.direction = 3;
    attacker.occupiedPositions = [
      [3, 5],
      [4, 5],
    ];
    gs.rebuildCellMap();

    expect(gs.getLaunchableIds().has(32)).toBe(false);
    gs.tryLaunch(32);
    expect(gs.animation?.mode).toBe("bump");
  });

  it("reduces health when adjacent arrow exits board", () => {
    const gs = new GameState(load9003());
    expect(gs.getFrozenOverlays()[0]!.health).toBe(2);
    expect(gs.frozenManager.isHostFrozen(30)).toBe(true);

    launchUntilDone(gs, 32);
    expect(gs.getFrozenOverlays()[0]!.health).toBe(1);
    expect(gs.frozenManager.isHostFrozen(30)).toBe(true);

    launchUntilDone(gs, 33);
    expect(gs.getFrozenOverlays().length).toBe(0);
    expect(gs.frozenManager.isHostFrozen(30)).toBe(false);
    expect(gs.getLaunchableIds().has(30)).toBe(true);
  });
});
