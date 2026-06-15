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

mkdirSync(destDir, { recursive: true });

if (!existsSync(srcDir)) {
  const manifest = join(destDir, "manifest.json");
  if (existsSync(manifest)) {
    console.log(
      "crackdata 源目录不存在，跳过拷贝，使用已有 public/levels/",
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

  const kinds = new Set();
  const walk = (items) => {
    for (const item of items) {
      kinds.add(item.kind);
      if (item.kind === 12 && item.items) walk(item.items);
    }
  };
  walk(data.itemModels);
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
    pureKind1,
    p1Playable,
    p2Playable,
    p3Playable,
    p4Playable,
  });
}

levels.sort((a, b) => a.id - b.id);
writeFileSync(
  join(destDir, "manifest.json"),
  JSON.stringify({ levels }, null, 2) + "\n",
);
console.log(`Copied ${levels.length} levels to public/levels/`);
