import type { GameLevel, LevelData, LevelManifest } from "../types.ts";
import { parseLevelData } from "./parser.ts";

export async function loadManifest(): Promise<LevelManifest> {
  const res = await fetch("/levels/manifest.json");
  if (!res.ok) throw new Error("Failed to load manifest");
  return res.json() as Promise<LevelManifest>;
}

export async function loadLevel(id: number): Promise<GameLevel> {
  const res = await fetch(`/levels/level-${id}.json`);
  if (!res.ok) throw new Error(`Failed to load level ${id}`);
  const data = (await res.json()) as LevelData;
  return parseLevelData(id, data);
}
