import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(
  readFileSync(path.join(__dirname, "../public/ai-config.local.json"), "utf8"),
);
const url = `${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`;

function extractJsonFromLlm(text) {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) return JSON.parse(fenceMatch[1].trim());
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }
  return JSON.parse(trimmed);
}

const user = `生成完整 LevelData JSON：
- width 20, height 32, durationInSec 150, difficulty 1, levelKind 2
- 10+ kind1 箭, 2 kind2 翻转箭, 1 kind3 管道, 1 kind12 子区域
- instanceId 唯一, 可解
只输出 JSON，不要解释。`;

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
      { role: "system", content: "只输出 LevelData JSON" },
      { role: "user", content: user },
    ],
    max_tokens: cfg.maxTokens,
    temperature: 0.7,
  }),
});

console.log("status", res.status, "ms", Date.now() - t0);
const data = await res.json();
const choice = data.choices?.[0];
const msg = choice?.message;
console.log("finish", choice?.finish_reason);
console.log("content len", msg?.content?.length ?? 0);
console.log("reasoning len", msg?.reasoning_content?.length ?? 0);
console.log("usage", JSON.stringify(data.usage));

if (!msg?.content) {
  console.log("FAIL: empty content");
  process.exit(1);
}

try {
  extractJsonFromLlm(msg.content);
  console.log("parse OK");
} catch (e) {
  console.log("parse FAIL:", e.message);
  console.log(msg.content.slice(0, 300));
  console.log("...", msg.content.slice(-200));
}
