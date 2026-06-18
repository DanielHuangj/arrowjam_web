#!/usr/bin/env node
/** 校验 P5 机制测试关 JSON 可被 shared 解析 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLevelData } from "../../shared/src/parser.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const levelsDir = join(root, "public", "levels");

const ids = [9001, 9002, 9003, 9004];
let failed = false;

for (const id of ids) {
  const path = join(levelsDir, `level-${id}.json`);
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    const level = parseLevelData(id, data);
    console.log(
      `OK level-${id}: arrows=${level.arrows.length} walls=${level.movingWalls.length} bombs=${level.bombs.length} frozen=${level.frozenOverlays.length}`,
    );
  } catch (e) {
    failed = true;
    console.error(`FAIL level-${id}:`, e);
  }
}

if (failed) process.exit(1);
