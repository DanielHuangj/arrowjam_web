import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { chatCompletion, resolveChatUrl, LlmError } from "./llm-client.ts";
import type { AiConfig } from "./types.ts";

const config: AiConfig = {
  baseUrl: "https://api.example.com/v1",
  apiKey: "sk-test",
  model: "gpt-4o",
  temperature: 0.7,
  maxTokens: 8192,
  timeoutMs: 5000,
};

describe("resolveChatUrl", () => {
  it("appends chat/completions when missing", () => {
    expect(resolveChatUrl(config)).toBe("https://api.example.com/v1/chat/completions");
  });

  it("keeps full completions url", () => {
    expect(
      resolveChatUrl({ ...config, baseUrl: "https://proxy.example.com/chat/completions" }),
    ).toBe("https://proxy.example.com/chat/completions");
  });
});

describe("chatCompletion", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends correct request and parses response", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"optimized_prompt":"hello"}' } }],
      }),
    } as Response);

    const content = await chatCompletion(config, [{ role: "user", content: "hi" }]);
    expect(content).toBe('{"optimized_prompt":"hello"}');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("gpt-4o");
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("throws LlmError on 401", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    } as Response);

    await expect(chatCompletion(config, [{ role: "user", content: "x" }])).rejects.toThrow(
      LlmError,
    );
    await expect(chatCompletion(config, [{ role: "user", content: "x" }])).rejects.toThrow(
      "API 密钥无效",
    );
  });
});
