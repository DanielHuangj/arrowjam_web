import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { simulateCanExit } from "../board/path-check.ts";
import { GameState } from "../game/game-state.ts";
import { parseLevelData } from "../level/parser.ts";

const levelPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../test-fixtures/levels/level-9002.json",
);

describe("moving wall blocking", () => {
  it("blocks arrow launch when wall is ahead", () => {
    const data = JSON.parse(readFileSync(levelPath, "utf-8"));
    const level = parseLevelData(9002, data);
    const gs = new GameState(level);
    const arrow = gs.arrows.find((a) => a.instanceId === 10)!;
    const walls = gs.getWallBlockerCells();

    expect([...walls]).toContain("8,5");
    expect(arrow.occupiedPositions.at(-1)).toEqual([4, 5]);

    const canExit = simulateCanExit(
      arrow,
      gs.getActiveArrows(),
      gs.getActiveCorners(),
      level,
      gs.getActivePipes(),
      gs.curtainManager.getActiveCellKeys(),
      walls,
    );
    expect(canExit).toBe(false);
    expect(gs.getLaunchableIds().has(10)).toBe(false);

    gs.tryLaunch(10);
    expect(gs.animation?.mode).toBe("bump");

    for (let i = 0; i < 20; i++) {
      if (gs.phase !== "animating") break;
      gs.advanceAnimation();
    }
    const headAfterBump = gs.arrows.find((a) => a.instanceId === 10)!
      .occupiedPositions.at(-1)!;
    expect(headAfterBump[0]).toBeLessThanOrEqual(4);
    expect(headAfterBump).not.toEqual([8, 5]);
  });

  it("allows launch after wall moves away", () => {
    const data = JSON.parse(readFileSync(levelPath, "utf-8"));
    const level = parseLevelData(9002, data);
    const gs = new GameState(level);

    gs.tryLaunch(11);
    while (gs.phase === "animating") {
      gs.advanceAnimation();
    }

    expect(gs.getWallBlockerCells().has("8,5")).toBe(false);
    expect(gs.getLaunchableIds().has(10)).toBe(true);
  });
});
