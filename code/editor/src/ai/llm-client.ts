import type { AiConfig, ChatMessage } from "./types.ts";

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export function resolveChatUrl(config: AiConfig): string {
  const base = config.baseUrl.replace(/\/$/, "");
  if (base.endsWith("/chat/completions")) return base;
  return `${base}/chat/completions`;
}

export async function chatCompletion(
  config: AiConfig,
  messages: ChatMessage[],
  options: { signal?: AbortSignal; temperature?: number } = {},
): Promise<string> {
  const url = resolveChatUrl(config);
  const controller = new AbortController();
  const timeoutMs = config.timeoutMs ?? 120_000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: options.temperature ?? config.temperature ?? 0.7,
        max_tokens: config.maxTokens ?? 8192,
        ...(config.enableThinking != null ? { enable_thinking: config.enableThinking } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 401 || res.status === 403) {
        throw new LlmError("API 密钥无效或无权访问", res.status);
      }
      if (res.status === 429) {
        throw new LlmError("请求过于频繁，请稍后重试", res.status);
      }
      throw new LlmError(`LLM 请求失败 (${res.status}): ${body.slice(0, 200)}`, res.status);
    }

    const data = (await res.json()) as {
      choices?: {
        finish_reason?: string;
        message?: { content?: string | null; reasoning_content?: string | null };
      }[];
    };
    const choice = data.choices?.[0];
    const message = choice?.message;
    const finishReason = choice?.finish_reason ?? "unknown";
    const content = message?.content?.trim();
    if (content) {
      if (finishReason === "length") {
        throw new LlmError(
          `LLM 输出被 maxTokens（${config.maxTokens ?? 8192}）截断，JSON 可能不完整。请提高 maxTokens 或使用更短的输出格式。`,
        );
      }
      return message!.content!;
    }

    const reasoning = message?.reasoning_content?.trim();
    if (reasoning) {
      if (finishReason === "length") {
        throw new LlmError(
          `LLM 输出被 maxTokens（${config.maxTokens ?? 8192}）截断。请提高 maxTokens。`,
        );
      }
      return reasoning;
    }

    throw new LlmError(`LLM 响应为空（finish_reason=${finishReason}）`);
  } catch (err) {
    if (err instanceof LlmError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new LlmError("请求已取消或超时");
    }
    throw new LlmError(err instanceof Error ? err.message : "网络请求失败");
  } finally {
    clearTimeout(timeoutId);
    options.signal?.removeEventListener("abort", onAbort);
  }
}
