import { describe, expect, it } from "vitest";
import { parseLevelData } from "../level/parser.ts";
import { GameState } from "../game/game-state.ts";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("V2 rush integration", () => {
  it("parses rush level 9030", () => {
    const raw = readFileSync(
      join(__dirname, "../../../test-fixtures/levels/level-9030.json"),
      "utf-8",
    );
    const level = parseLevelData(9030, JSON.parse(raw));
    expect(level.gameMode).toBe("rush");
    expect(level.spawnPool?.length).toBe(3);
    expect(level.levelGoals?.[0]).toEqual({ type: "clearArrowCount", count: 8 });
  });

  it("rush mode does not win when board empty but goal unmet", () => {
    const raw = readFileSync(
      join(__dirname, "../../../test-fixtures/levels/level-9030.json"),
      "utf-8",
    );
    const level = parseLevelData(9030, JSON.parse(raw));
    const gs = new GameState(level);
    gs.arrows = [];
    expect(gs.isRushLevel()).toBe(true);
    expect(gs.getGoalProgress()[0]!.done).toBe(false);
  });

  it("spawn phase blocks launch clicks", () => {
    const raw = readFileSync(
      join(__dirname, "../../../test-fixtures/levels/level-9030.json"),
      "utf-8",
    );
    const level = parseLevelData(9030, JSON.parse(raw));
    const gs = new GameState(level);
    gs.spawnManager.beginSpawnPhase([999]);
    expect(gs.canAcceptLaunchClick()).toBe(false);
  });
});
