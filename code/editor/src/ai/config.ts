import type { AiConfig } from "./types.ts";

const CONFIG_HINT =
  "请复制 code/editor/ai-config.example.json 为 public/ai-config.local.json 并填入 apiKey";

export function validateAiConfig(raw: unknown): AiConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const baseUrl = typeof o.baseUrl === "string" ? o.baseUrl.trim() : "";
  const apiKey = typeof o.apiKey === "string" ? o.apiKey.trim() : "";
  const model = typeof o.model === "string" ? o.model.trim() : "";
  if (!baseUrl || !apiKey || !model) return null;
  if (apiKey.includes("your-key")) return null;

  const enableThinking =
    typeof o.enableThinking === "boolean"
      ? o.enableThinking
      : model.includes("qwen3")
        ? false
        : undefined;

  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiKey,
    model,
    temperature: typeof o.temperature === "number" ? o.temperature : 0.7,
    maxTokens: typeof o.maxTokens === "number" ? o.maxTokens : 8192,
    timeoutMs: typeof o.timeoutMs === "number" ? o.timeoutMs : 120_000,
    enableThinking,
  };
}

export async function loadAiConfig(): Promise<{ config: AiConfig | null; error?: string }> {
  try {
    const res = await fetch("/ai-config.local.json", { cache: "no-store" });
    if (!res.ok) {
      return { config: null, error: `未找到 ai-config.local.json。${CONFIG_HINT}` };
    }
    const raw = await res.json();
    const config = validateAiConfig(raw);
    if (!config) {
      return { config: null, error: `配置无效或未填写 apiKey。${CONFIG_HINT}` };
    }
    return { config };
  } catch {
    return { config: null, error: `无法加载配置。${CONFIG_HINT}` };
  }
}

export function getConfigHint(): string {
  return CONFIG_HINT;
}
