import { describe, expect, it } from "vitest";
import { validateAiConfig } from "./config.ts";

describe("validateAiConfig", () => {
  it("accepts valid config", () => {
    const config = validateAiConfig({
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-real-key",
      model: "gpt-4o",
      temperature: 0.5,
      maxTokens: 4096,
      timeoutMs: 60_000,
    });
    expect(config).toEqual({
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-real-key",
      model: "gpt-4o",
      temperature: 0.5,
      maxTokens: 4096,
      timeoutMs: 60_000,
    });
  });

  it("strips trailing slash from baseUrl", () => {
    const config = validateAiConfig({
      baseUrl: "https://api.example.com/v1/",
      apiKey: "sk-real-key",
      model: "gpt-4o",
    });
    expect(config?.baseUrl).toBe("https://api.example.com/v1");
  });

  it("rejects placeholder apiKey", () => {
    expect(
      validateAiConfig({
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-your-key-here",
        model: "gpt-4o",
      }),
    ).toBeNull();
  });

  it("rejects missing fields", () => {
    expect(validateAiConfig({ baseUrl: "", apiKey: "x", model: "m" })).toBeNull();
    expect(validateAiConfig(null)).toBeNull();
  });
});
