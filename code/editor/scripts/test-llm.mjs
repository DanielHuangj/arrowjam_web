import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(
  readFileSync(path.join(__dirname, "../public/ai-config.local.json"), "utf8"),
);
const url = `${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`;

async function test(label, messages) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        max_tokens: 512,
        temperature: 0.7,
      }),
    });
    const text = await res.text();
    console.log(`--- ${label} status=${res.status} ms=${Date.now() - t0}`);
    console.log(text.slice(0, 1200));
  } catch (e) {
    console.log(`--- ${label} FETCH_ERR ${e.message} ms=${Date.now() - t0}`);
  }
}

await test("model-check", [{ role: "user", content: "reply OK" }]);
