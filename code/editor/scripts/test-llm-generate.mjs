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

const system = `你是 Arrow Jam 关卡 JSON 生成器。只输出一个完整的 LevelData JSON 对象。`;
const user = `生成 12x12 关卡，含 2 条 kind1 折线箭。width/height/durationInSec/difficulty/itemModels 必填。只输出 JSON。`;

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
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: cfg.maxTokens ?? 8192,
    temperature: 0.7,
  }),
});

console.log("status", res.status, "ms", Date.now() - t0);
const data = await res.json();
const msg = data.choices?.[0]?.message;
console.log("content length", msg?.content?.length ?? 0);
console.log("reasoning length", msg?.reasoning_content?.length ?? 0);
console.log("finish_reason", data.choices?.[0]?.finish_reason);

const content = msg?.content ?? "";
if (!content) {
  console.log("EMPTY content! keys:", Object.keys(msg ?? {}));
  process.exit(1);
}

try {
  const parsed = extractJsonFromLlm(content);
  console.log("parse OK width=", parsed.width, "items=", parsed.itemModels?.length);
} catch (e) {
  console.log("parse FAIL", e.message);
  console.log("content head:", content.slice(0, 400));
}
