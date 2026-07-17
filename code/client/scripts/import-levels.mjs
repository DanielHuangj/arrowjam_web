/**
 * 从 levels-inbox/ 导入新关卡到 public/levels/，并更新 manifest.json。
 *
 * levels-inbox/levels/     → 主线（id 自增，接 manifest.levels 最大 id）
 * levels-inbox/devTests/   → 机制测试（id 自增，9000 段，与 rushTests 共用 id 池）
 * levels-inbox/rushTests/  → 爽快版测试（同上，写入 manifest.rushTests）
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
const inboxRush = join(inboxRoot, "rushTests");
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
  const entry = {
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
  if (data.gameMode) entry.gameMode = data.gameMode;
  if (data.spawnIntervalSec != null) entry.spawnIntervalSec = data.spawnIntervalSec;
  return entry;
}

function loadManifest() {
  if (!existsSync(manifestPath)) {
    return { devTests: [], rushTests: [], levels: [] };
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  manifest.devTests = manifest.devTests ?? [];
  manifest.rushTests = manifest.rushTests ?? [];
  manifest.levels = manifest.levels ?? [];
  return manifest;
}

function saveManifest(manifest) {
  manifest.devTests.sort((a, b) => a.id - b.id);
  manifest.rushTests.sort((a, b) => a.id - b.id);
  manifest.levels.sort((a, b) => a.id - b.id);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

function refreshManifestKinds(manifest) {
  for (const list of [manifest.levels, manifest.devTests, manifest.rushTests]) {
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

/** 从文件名提取数字（默认仅含一个）；无数字时排到末尾 */
function numberFromFilename(name) {
  const m = name.match(/\d+/);
  return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY;
}

function listInboxJson(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort((a, b) => {
      const na = numberFromFilename(a);
      const nb = numberFromFilename(b);
      if (na !== nb) return na - nb;
      return a.localeCompare(b);
    });
}

function nextMainId(manifest) {
  if (manifest.levels.length === 0) return 1;
  return Math.max(...manifest.levels.map((e) => e.id)) + 1;
}

/** devTests 与 rushTests 共用 9000 段 id，避免 level 文件冲突 */
function nextTestId(manifest) {
  const tests = [...manifest.devTests, ...manifest.rushTests];
  if (tests.length === 0) return 9001;
  return Math.max(...tests.map((e) => e.id)) + 1;
}

function parseLevelFile(filePath) {
  const raw = readFileSync(filePath, "utf-8");
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`${filePath}: JSON 解析失败 — ${e.message}`);
  }
}

function importFromInbox(manifest, inboxDir, targetList, idAllocator) {
  const files = listInboxJson(inboxDir);
  if (files.length === 0) return 0;

  const pending = [];
  let next = idAllocator(manifest);

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
mkdirSync(inboxRush, { recursive: true });

const manifest = loadManifest();
const importedMain = importFromInbox(manifest, inboxMain, manifest.levels, nextMainId);
const importedDev = importFromInbox(manifest, inboxDev, manifest.devTests, nextTestId);
const importedRush = importFromInbox(
  manifest,
  inboxRush,
  manifest.rushTests,
  nextTestId,
);
refreshManifestKinds(manifest);
saveManifest(manifest);

const total = importedMain + importedDev + importedRush;
if (total === 0) {
  console.log("levels-inbox 为空，已刷新 manifest kinds");
} else {
  console.log(
    `已导入 ${total} 个关卡（主线 ${importedMain}，机制测试 ${importedDev}，爽快版测试 ${importedRush}），源文件已删除`,
  );
}
