import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, "../../..");
const cfg = JSON.parse(
  readFileSync(path.join(__dirname, "../public/ai-config.local.json"), "utf8"),
);
const url = `${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`;

const featureMap = readFileSync(
  path.join(repo, "docs/arrow_jaw_游戏功能图谱.md"),
  "utf8",
);
const aiGuide = readFileSync(
  path.join(repo, "docs/arrow_jaw_AI关卡编辑指南.md"),
  "utf8",
);
const schema = readFileSync(
  path.join(repo, "docs/Arrow 关卡结构说明.md"),
  "utf8",
);

const userContent = `## 用户关卡参数
- 棋盘: 20 x 32
- 关键词: 教学关

## 游戏功能图谱
${featureMap}

## AI 关卡编辑指南
${aiGuide}

## 关卡 JSON 结构
${schema}

请输出 JSON: {"optimized_prompt":"...","design_notes":"..."}`;

console.log("user chars", userContent.length, "~tokens", Math.ceil(userContent.length / 3));

const t0 = Date.now();
const res = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cfg.apiKey}`,
  },
  body: JSON.stringify({
    model: cfg.model,
    messages: [
      { role: "system", content: "只输出 JSON" },
      { role: "user", content: userContent },
    ],
    max_tokens: 4096,
    temperature: 0.7,
  }),
});

console.log("status", res.status, "ms", Date.now() - t0);
const text = await res.text();
if (!res.ok) {
  console.log(text.slice(0, 1000));
  process.exit(1);
}
const data = JSON.parse(text);
const content = data.choices?.[0]?.message?.content ?? "";
console.log("content len", content.length, "finish", data.choices?.[0]?.finish_reason);
console.log("usage", JSON.stringify(data.usage));
