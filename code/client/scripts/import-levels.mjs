/**
 * 从 levels-inbox/ 导入新关卡到 public/levels/，并更新 manifest.json。
 *
 * levels-inbox/levels/     → 主线（id 自增，接 manifest.levels 最大 id）
 * levels-inbox/devTests/   → 测试（id 自增，接 manifest.devTests 最大 id，首关从 9001 起）
 *
 * 导入成功后删除 inbox 中的源文件。inbox 为空时仅刷新 manifest 中的 kinds 字段。
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientRoot = join(__dirname, "..");
const inboxRoot = join(clientRoot, "levels-inbox");
const inboxMain = join(inboxRoot, "levels");
const inboxDev = join(inboxRoot, "devTests");
const destDir = join(clientRoot, "public", "levels");
const manifestPath = join(destDir, "manifest.json");

function collectKinds(itemModels) {
  const kinds = new Set();
  const walk = (items) => {
    for (const item of items) {
      kinds.add(item.kind);
      if (item.kind === 12 && item.items) walk(item.items);
    }
  };
  walk(itemModels ?? []);
  return [...kinds].sort((a, b) => a - b);
}

function buildPlayabilityFlags(kindList) {
  const kinds = new Set(kindList);
  const pureKind1 = kinds.size === 1 && kinds.has(1);
  const p1Playable = [...kinds].every((k) => k === 1 || k === 4 || k === 12);
  const p2Playable =
    kinds.has(8) &&
    [...kinds].every((k) => k === 1 || k === 4 || k === 8 || k === 12);
  const p3Playable =
    kinds.has(3) &&
    [...kinds].every((k) => k === 1 || k === 3 || k === 4 || k === 8 || k === 12);
  const p4Kinds = new Set([1, 3, 4, 6, 8, 11, 12]);
  const p4Playable =
    kinds.has(6) && kinds.has(11) && [...kinds].every((k) => p4Kinds.has(k));
  return { pureKind1, p1Playable, p2Playable, p3Playable, p4Playable };
}

function buildManifestEntry(id, data) {
  if (typeof data.width !== "number" || typeof data.height !== "number") {
    throw new Error(`关卡 ${id} 缺少 width/height`);
  }
  if (!Array.isArray(data.itemModels)) {
    throw new Error(`关卡 ${id} 缺少 itemModels 数组`);
  }
  const kindList = collectKinds(data.itemModels);
  return {
    id,
    file: `level-${id}.json`,
    name: data.name || `Level ${id}`,
    difficulty: data.difficulty ?? 1,
    width: data.width,
    height: data.height,
    durationInSec: data.durationInSec ?? 120,
    kinds: kindList,
    ...buildPlayabilityFlags(kindList),
  };
}

function loadManifest() {
  if (!existsSync(manifestPath)) {
    return { devTests: [], levels: [] };
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  manifest.devTests = manifest.devTests ?? [];
  manifest.levels = manifest.levels ?? [];
  return manifest;
}

function saveManifest(manifest) {
  manifest.devTests.sort((a, b) => a.id - b.id);
  manifest.levels.sort((a, b) => a.id - b.id);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

function refreshManifestKinds(manifest) {
  for (const list of [manifest.levels, manifest.devTests]) {
    for (const entry of list) {
      const levelPath = join(destDir, entry.file);
      if (!existsSync(levelPath)) continue;
      const data = JSON.parse(readFileSync(levelPath, "utf-8"));
      const kindList = collectKinds(data.itemModels);
      entry.kinds = kindList;
      Object.assign(entry, buildPlayabilityFlags(kindList));
    }
  }
}

function listInboxJson(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function nextId(entries, devTest) {
  if (entries.length === 0) return devTest ? 9001 : 1;
  return Math.max(...entries.map((e) => e.id)) + 1;
}

function parseLevelFile(filePath) {
  const raw = readFileSync(filePath, "utf-8");
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`${filePath}: JSON 解析失败 — ${e.message}`);
  }
}

function importFromInbox(manifest, inboxDir, targetList, devTest) {
  const files = listInboxJson(inboxDir);
  if (files.length === 0) return 0;

  const pending = [];
  let next = nextId(targetList, devTest);

  for (const file of files) {
    const srcPath = join(inboxDir, file);
    const data = parseLevelFile(srcPath);
    const id = next++;
    const entry = buildManifestEntry(id, data);
    const destPath = join(destDir, entry.file);
    pending.push({ srcPath, destPath, entry, data });
  }

  for (const { destPath, entry, data } of pending) {
    writeFileSync(destPath, JSON.stringify(data, null, 2) + "\n");
    targetList.push(entry);
  }

  for (const { srcPath } of pending) {
    unlinkSync(srcPath);
  }

  return pending.length;
}

mkdirSync(destDir, { recursive: true });
mkdirSync(inboxMain, { recursive: true });
mkdirSync(inboxDev, { recursive: true });

const manifest = loadManifest();
const importedMain = importFromInbox(manifest, inboxMain, manifest.levels, false);
const importedDev = importFromInbox(manifest, inboxDev, manifest.devTests, true);
refreshManifestKinds(manifest);
saveManifest(manifest);

const total = importedMain + importedDev;
if (total === 0) {
  console.log("levels-inbox 为空，已刷新 manifest kinds");
} else {
  console.log(
    `已导入 ${total} 个关卡（主线 ${importedMain}，测试 ${importedDev}），源文件已删除`,
  );
}
