import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./validate-level.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./validate-level.ts")>();
  return {
    ...actual,
    validateLevelJsonString: vi.fn(actual.validateLevelJsonString),
  };
});

vi.mock("./llm-client.ts", () => ({
  chatCompletion: vi.fn(),
}));

vi.mock("./context.ts", () => ({
  getAiContextBundle: () => ({
    featureMap: "feature map",
    aiGuide: "ai guide",
    levelStructure: "structure",
  }),
  getValidatorSummary: () => "V04 折线不连续",
}));

import { runGenerationPipeline } from "./generation-pipeline.ts";
import type { AiConfig, GenerationForm } from "./types.ts";
import { chatCompletion } from "./llm-client.ts";
import { validateLevelJsonString } from "./validate-level.ts";

function createMockDir(): FileSystemDirectoryHandle & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    name: "test-out",
    kind: "directory",
    async getFileHandle(name: string, opts?: { create?: boolean }) {
      if (!files.has(name) && !opts?.create) {
        throw new DOMException("NotFound", "NotFoundError");
      }
      if (opts?.create && !files.has(name)) {
        files.set(name, "");
      }
      return {
        kind: "file" as const,
        name,
        async getFile() {
          return new File([files.get(name) ?? ""], name);
        },
        async createWritable() {
          let content = files.get(name) ?? "";
          return {
            async write(data: string) {
              content = data;
            },
            async close() {
              files.set(name, content);
            },
          };
        },
      };
    },
    async removeEntry(name: string) {
      files.delete(name);
    },
  } as unknown as FileSystemDirectoryHandle & { files: Map<string, string> };
}

const config: AiConfig = {
  baseUrl: "https://api.example.com/v1",
  apiKey: "sk-test",
  model: "gpt-4o",
};

const baseForm: GenerationForm = {
  prefix: "testlvl",
  width: 12,
  height: 12,
  durationInSec: 150,
  difficulty: 1,
  levelKind: 2,
  count: 1,
  allowedKinds: [1, 2],
  keywords: "flip arrow tutorial",
};

const denseKind1Level = JSON.stringify({
  width: 12,
  height: 12,
  name: "test-dense",
  durationInSec: 120,
  difficulty: 1,
  itemModels: [
    { kind: 1, instanceId: 1, layer: 2, direction: 3, colorId: 6, occupiedPositions: [[0, 5], [1, 5], [2, 5]] },
    { kind: 1, instanceId: 2, layer: 2, direction: 3, colorId: 6, occupiedPositions: [[0, 7], [1, 7], [2, 7]] },
    { kind: 1, instanceId: 3, layer: 2, direction: 1, colorId: 7, occupiedPositions: [[5, 0], [5, 1], [5, 2]] },
    { kind: 1, instanceId: 4, layer: 2, direction: 1, colorId: 7, occupiedPositions: [[9, 5], [9, 6], [9, 7]] },
    { kind: 1, instanceId: 5, layer: 2, direction: 3, colorId: 3, occupiedPositions: [[3, 9], [4, 9], [5, 9]] },
    { kind: 1, instanceId: 6, layer: 2, direction: 3, colorId: 3, occupiedPositions: [[7, 3], [8, 3], [9, 3], [10, 3]] },
    { kind: 1, instanceId: 7, layer: 2, direction: 1, colorId: 6, occupiedPositions: [[2, 10], [2, 11]] },
    { kind: 1, instanceId: 8, layer: 2, direction: 1, colorId: 7, occupiedPositions: [[10, 8], [11, 8], [11, 9]] },
  ],
});

const formK1Only: GenerationForm = {
  ...baseForm,
  allowedKinds: [1],
  keywords: "dense kind1",
};

describe("runGenerationPipeline", () => {
  beforeEach(async () => {
    vi.mocked(chatCompletion).mockReset();
    const actual = await vi.importActual<typeof import("./validate-level.ts")>(
      "./validate-level.ts",
    );
    vi.mocked(validateLevelJsonString).mockImplementation(actual.validateLevelJsonString);
  });

  it("writes checked json when generation and validation pass", async () => {
    expect(validateLevelJsonString(denseKind1Level, formK1Only).ok).toBe(true);

    vi.mocked(chatCompletion)
      .mockResolvedValueOnce('{"optimized_prompt":"dense kind1","design_notes":"note"}')
      .mockResolvedValueOnce(denseKind1Level);

    const dir = createMockDir();
    const result = await runGenerationPipeline(formK1Only, dir, config, {
      signal: new AbortController().signal,
      onProgress: () => {},
    });

    expect(result.failed, JSON.stringify(result.logLines)).toHaveLength(0);
    expect(result.passed).toBe(1);
    expect(dir.files.has("testlvl-001.json")).toBe(true);
    expect(chatCompletion).toHaveBeenCalledTimes(2);
  });

  it("calls fix at most four times then deletes uncheck on failure", async () => {
    vi.mocked(validateLevelJsonString).mockReturnValue({
      ok: false,
      blocking: true,
      issues: [{ id: "V04", severity: "error", message: "折线不连续" }],
    });

    vi.mocked(chatCompletion)
      .mockResolvedValueOnce('{"optimized_prompt":"x"}')
      .mockResolvedValueOnce('{"width":12,"height":12,"itemModels":[]}')
      .mockResolvedValue('{"width":12,"height":12,"itemModels":[]}');

    const dir = createMockDir();
    const result = await runGenerationPipeline(formK1Only, dir, config, {
      signal: new AbortController().signal,
      onProgress: () => {},
    });

    expect(result.passed).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(result.logLines.some((l) => l.includes("GENERATE_PROMPT"))).toBe(true);
    expect(dir.files.has("testlvl-001.uncheck.json")).toBe(false);
    expect(chatCompletion).toHaveBeenCalledTimes(6);
    expect(vi.mocked(validateLevelJsonString).mock.calls.length).toBeGreaterThanOrEqual(5);
    expect(result.logLines.some((l) => l.includes("FIX_ATTEMPT"))).toBe(true);
  });

  it("respects abort signal", async () => {
    vi.mocked(chatCompletion).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve('{"optimized_prompt":"x"}'), 50);
        }),
    );

    const controller = new AbortController();
    const dir = createMockDir();
    const promise = runGenerationPipeline(baseForm, dir, config, {
      signal: controller.signal,
      onProgress: () => {},
    });
    controller.abort();

    const result = await promise;
    expect(result.cancelled).toBe(true);
  });
});
