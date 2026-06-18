import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const srcDir = join(root, "..", "..", "docs", "crackdata", "关卡提取");
const destDir = join(root, "public", "levels");

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

function refreshManifestKinds(manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  for (const entry of manifest.levels) {
    const levelPath = join(destDir, entry.file);
    if (!existsSync(levelPath)) continue;
    const data = JSON.parse(readFileSync(levelPath, "utf-8"));
    entry.kinds = collectKinds(data.itemModels);
  }
  if (manifest.devTests) {
    for (const entry of manifest.devTests) {
      const levelPath = join(destDir, entry.file);
      if (!existsSync(levelPath)) continue;
      const data = JSON.parse(readFileSync(levelPath, "utf-8"));
      entry.kinds = collectKinds(data.itemModels);
    }
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

mkdirSync(destDir, { recursive: true });

if (!existsSync(srcDir)) {
  const manifestPath = join(destDir, "manifest.json");
  if (existsSync(manifestPath)) {
    refreshManifestKinds(manifestPath);
    console.log(
      "crackdata 源目录不存在，已根据 public/levels/ 刷新 manifest kinds",
    );
    process.exit(0);
  }
  console.error(
    "缺少 docs/crackdata/关卡提取/ 且 public/levels/ 为空，无法构建关卡数据",
  );
  process.exit(1);
}

const levels = [];
const pattern = /^0605-arrowJam-main-level-(\d+)-seed-1\.json$/;

for (const file of readdirSync(srcDir)) {
  const m = file.match(pattern);
  if (!m) continue;
  const id = Number(m[1]);
  const raw = readFileSync(join(srcDir, file), "utf-8");
  const data = JSON.parse(raw);

  copyFileSync(join(srcDir, file), join(destDir, `level-${id}.json`));

  const kindList = collectKinds(data.itemModels);
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
    kinds.has(6) &&
    kinds.has(11) &&
    [...kinds].every((k) => p4Kinds.has(k));

  levels.push({
    id,
    file: `level-${id}.json`,
    name: data.name || `Level ${id}`,
    difficulty: data.difficulty ?? 1,
    width: data.width,
    height: data.height,
    durationInSec: data.durationInSec ?? 120,
    kinds: kindList,
    pureKind1,
    p1Playable,
    p2Playable,
    p3Playable,
    p4Playable,
  });
}

levels.sort((a, b) => a.id - b.id);

const manifestPath = join(destDir, "manifest.json");
let devTests = [];
if (existsSync(manifestPath)) {
  try {
    const prev = JSON.parse(readFileSync(manifestPath, "utf-8"));
    devTests = prev.devTests ?? [];
  } catch {
    devTests = [];
  }
}
if (devTests.length === 0) {
  devTests = [
    {
      id: 9001,
      file: "level-9001.json",
      name: "[测] 翻转箭",
      difficulty: 1,
      width: 12,
      height: 12,
      durationInSec: 120,
      kinds: [1, 2],
      pureKind1: false,
      p1Playable: true,
      p2Playable: false,
      p3Playable: false,
      p4Playable: false,
    },
    {
      id: 9002,
      file: "level-9002.json",
      name: "[测] 移动墙",
      difficulty: 1,
      width: 14,
      height: 14,
      durationInSec: 120,
      kinds: [1, 7],
      pureKind1: false,
      p1Playable: true,
      p2Playable: false,
      p3Playable: false,
      p4Playable: false,
    },
    {
      id: 9003,
      file: "level-9003.json",
      name: "[测] 冻结解冻",
      difficulty: 1,
      width: 12,
      height: 12,
      durationInSec: 120,
      kinds: [1, 13],
      pureKind1: false,
      p1Playable: true,
      p2Playable: false,
      p3Playable: false,
      p4Playable: false,
    },
    {
      id: 9004,
      file: "level-9004.json",
      name: "[测] 定时炸弹",
      difficulty: 1,
      width: 12,
      height: 12,
      durationInSec: 300,
      kinds: [1, 5, 6, 11],
      pureKind1: false,
      p1Playable: false,
      p2Playable: false,
      p3Playable: false,
      p4Playable: true,
    },
  ];
}

writeFileSync(
  manifestPath,
  JSON.stringify({ devTests, levels }, null, 2) + "\n",
);
console.log(`Copied ${levels.length} levels to public/levels/`);
