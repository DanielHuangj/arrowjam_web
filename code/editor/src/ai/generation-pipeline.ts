import type { AiConfig, GenerationFailure, GenerationForm, GenerationResult, PipelineCallbacks } from "./types.ts";
import { AI_MAX_FIX_ATTEMPTS } from "./types.ts";
import { chatCompletion } from "./llm-client.ts";
import { getAiContextBundle } from "./context.ts";
import { extractJsonString, extractJsonFromLlm } from "./parse-response.ts";
import { buildOptimizeMessages, parseOptimizeResponse } from "./prompts/optimize-prompt.ts";
import { buildGenerateMessages } from "./prompts/generate-level.ts";
import { buildFixMessages } from "./prompts/fix-level.ts";
import {
  buildFillFixMessages,
  buildFillLevelMessages,
  buildOptimizeFillMessages,
} from "./prompts/fill-level.ts";
import {
  allocateSeq,
  promoteUncheckToChecked,
  removeFile,
  uncheckFilename,
  writeGenerationLog,
  writeTextFile,
} from "./level-io.ts";
import {
  buildBaseLevelContext,
  computeFillMinAddedCells,
  countNewItemsMerged,
  mergeFillResponse,
} from "./level-base-edit.ts";
import { sanitizeLevelJson, summarizeSanitizeActions, type SanitizeOptions } from "./level-sanitizer.ts";
import { formatIssuesSummary, validateLevelJsonString } from "./validate-level.ts";
import {
  appendFixAttemptLog,
  appendGeneratePromptLog,
  appendSanitizerLog,
} from "./log-format.ts";

function logLine(lines: string[], message: string): void {
  lines.push(`${new Date().toISOString()} ${message}`);
}

function logPromptSize(lines: string[], label: string, messages: { content: string }[]): void {
  const chars = messages.reduce((n, m) => n + m.content.length, 0);
  logLine(lines, `${label} PROMPT_CHARS=${chars}`);
}

function buildSanitizeOpts(base: ReturnType<typeof buildBaseLevelContext> | null): SanitizeOptions | undefined {
  if (!base) return undefined;
  return {
    frozenArrowCells: base.frozenArrowCells,
    frozenArrowIds: base.frozenArrowIds,
    fillMode: true,
    baseOccupiedCells: base.occupiedArrowCells,
    fillEmptyCells: base.emptyCells,
  };
}

function withFillFormFields(form: GenerationForm, base: ReturnType<typeof buildBaseLevelContext> | null): GenerationForm {
  if (!form.baseLevelJson || !base) return form;
  return {
    ...form,
    fillBaseOccupiedCells: base.occupiedArrowCells,
    fillMinAddedCells: computeFillMinAddedCells(base.emptyCells),
  };
}

async function runPhase3Loop(
  form: GenerationForm,
  dir: FileSystemDirectoryHandle,
  config: AiConfig,
  seq: string,
  uncheckName: string,
  levelJson: string,
  logLines: string[],
  optimizedPrompt: string,
  generateMessages: import("./types.ts").ChatMessage[],
  sanitizeOpts: SanitizeOptions | undefined,
  fixMessagesBuilder: (
    json: string,
    issues: import("@arrowjaw/shared").ValidationIssue[],
  ) => import("./types.ts").ChatMessage[],
  callbacks: PipelineCallbacks,
  index: number,
  total: number,
  baseCtx: ReturnType<typeof buildBaseLevelContext> | null,
  pipelineForm: GenerationForm,
): Promise<{ status: "pass" | "fail" | "cancel"; issues?: import("@arrowjaw/shared").ValidationIssue[] }> {
  const { onProgress, signal } = callbacks;
  let fixAttempts = 0;
  let currentJson = levelJson;

  while (true) {
    if (signal.aborted) return { status: "cancel" };

    onProgress({
      phase: 3,
      index,
      total,
      fixAttempt: fixAttempts,
      message: `Phase 3：校验第 ${index}/${total} 关${fixAttempts > 0 ? `（修正 ${fixAttempts}/${AI_MAX_FIX_ATTEMPTS}）` : ""}…`,
    });

    const sanitized = sanitizeLevelJson(currentJson, pipelineForm, sanitizeOpts);
    if (sanitized.error) {
      logLine(logLines, `seq=${seq} SANITIZE_SKIP ${sanitized.error}`);
    } else if (sanitized.changed) {
      currentJson = sanitized.json;
      await writeTextFile(dir, uncheckName, currentJson);
      appendSanitizerLog(logLines, seq, sanitized.actions, true);
    }

    const result = validateLevelJsonString(currentJson, pipelineForm);
    if (result.ok) {
      await promoteUncheckToChecked(dir, form.prefix, seq);
      logLine(logLines, `seq=${seq} PASS`);
      return { status: "pass" };
    }

    if (fixAttempts >= AI_MAX_FIX_ATTEMPTS) {
      await removeFile(dir, uncheckName);
      logLine(logLines, `seq=${seq} FAIL ${formatIssuesSummary(result.issues)}`);
      if (sanitized.changed) {
        logLine(
          logLines,
          `seq=${seq} SANITIZE_SUMMARY ${summarizeSanitizeActions(sanitized.actions, 10)}`,
        );
      }
      appendGeneratePromptLog(logLines, seq, optimizedPrompt, generateMessages);
      return { status: "fail", issues: result.issues };
    }

    appendFixAttemptLog(logLines, seq, fixAttempts + 1, result.issues);
    fixAttempts++;
    onProgress({
      phase: 3,
      index,
      total,
      fixAttempt: fixAttempts,
      message: `修正第 ${index} 关（${fixAttempts}/${AI_MAX_FIX_ATTEMPTS}）…`,
    });

    try {
      const fixRaw = await chatCompletion(
        config,
        fixMessagesBuilder(currentJson, result.issues),
        { signal, temperature: Math.min(config.temperature ?? 0.7, 0.5) },
      );
      if (baseCtx) {
        const parsed = extractJsonFromLlm(fixRaw);
        const stabilized = mergeFillResponse(baseCtx, parsed, pipelineForm);
        const newCount = countNewItemsMerged(baseCtx, stabilized);
        currentJson = JSON.stringify(stabilized);
        logLine(logLines, `seq=${seq} FILL_STABILIZE new=${newCount}`);
      } else {
        currentJson = extractJsonString(fixRaw);
      }
      await writeTextFile(dir, uncheckName, currentJson);
    } catch (err) {
      if (signal.aborted) return { status: "cancel" };
      await removeFile(dir, uncheckName);
      logLine(logLines, `seq=${seq} FIX_FAIL ${err instanceof Error ? err.message : String(err)}`);
      appendGeneratePromptLog(logLines, seq, optimizedPrompt, generateMessages);
      return { status: "fail", issues: result.issues };
    }
  }
}

export async function runGenerationPipeline(
  form: GenerationForm,
  dir: FileSystemDirectoryHandle,
  config: AiConfig,
  callbacks: PipelineCallbacks,
): Promise<GenerationResult> {
  const { onProgress, signal } = callbacks;
  const logLines: string[] = [];
  const failed: GenerationResult["failed"] = [];
  let passed = 0;
  let cancelled = false;

  const baseCtx = form.baseLevelJson ? buildBaseLevelContext(form.baseLevelJson) : null;
  const sanitizeOpts = buildSanitizeOpts(baseCtx);
  const fillMode = !!baseCtx;
  const pipelineForm = withFillFormFields(form, baseCtx);

  onProgress({
    phase: 1,
    message: fillMode ? "Phase 1：优化填充指令…" : "Phase 1：优化提示词…",
  });

  const context = getAiContextBundle();
  const optimizeMessages = fillMode
    ? buildOptimizeFillMessages(pipelineForm, baseCtx!)
    : buildOptimizeMessages(pipelineForm, context);

  let optimizeRaw: string;
  try {
    optimizeRaw = await chatCompletion(config, optimizeMessages, { signal });
  } catch (err) {
    if (signal.aborted) {
      return { requested: form.count, passed, failed, cancelled: true, logLines };
    }
    throw err;
  }

  if (signal.aborted) {
    return { requested: form.count, passed: 0, failed, cancelled: true, logLines };
  }

  let optimizedPrompt: string;
  try {
    const parsed = parseOptimizeResponse(extractJsonFromLlm(optimizeRaw));
    optimizedPrompt = parsed.optimized_prompt;
    if (parsed.design_notes) {
      logLine(logLines, `Phase1 OK design_notes=${parsed.design_notes.slice(0, 120)}`);
    } else {
      logLine(logLines, fillMode ? "Phase1 OK fill" : "Phase1 OK");
    }
  } catch (err) {
    throw new Error(`Phase 1 响应解析失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (fillMode) {
    logLine(logLines, `BASE_LEVEL arrows=${baseCtx!.frozenArrowIds.size} empty=${baseCtx!.emptyCells}`);
  }

  for (let i = 1; i <= form.count; i++) {
    if (signal.aborted) {
      cancelled = true;
      break;
    }

    onProgress({
      phase: 2,
      index: i,
      total: form.count,
      message: fillMode
        ? `Phase 2：填充第 ${i}/${form.count} 关…`
        : `Phase 2：生成第 ${i}/${form.count} 关…`,
    });

    const seq = await allocateSeq(dir, form.prefix, i);
    const uncheckName = uncheckFilename(form.prefix, seq);
    const generateMessages = fillMode
      ? buildFillLevelMessages(optimizedPrompt, pipelineForm, baseCtx!, i, form.count)
      : buildGenerateMessages(optimizedPrompt, pipelineForm, i, form.count);

    let levelJson: string;
    try {
      logPromptSize(logLines, `seq=${seq}`, generateMessages);
      const generateRaw = await chatCompletion(config, generateMessages, { signal });

      if (fillMode && baseCtx) {
        const parsed = extractJsonFromLlm(generateRaw);
        const levelName = `${form.prefix} #${seq}`;
        const merged = mergeFillResponse(baseCtx, parsed, pipelineForm, levelName);
        levelJson = JSON.stringify(merged);
        logLine(
          logLines,
          `seq=${seq} MERGE base=${baseCtx.frozenArrowIds.size} new=${countNewItemsMerged(baseCtx, merged)}`,
        );
      } else {
        levelJson = extractJsonString(generateRaw);
      }
    } catch (err) {
      if (signal.aborted) {
        cancelled = true;
        break;
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      logLine(logLines, `seq=${seq} GENERATE_FAIL ${errMsg}`);
      appendGeneratePromptLog(logLines, seq, optimizedPrompt, generateMessages);
      failed.push({
        seq,
        issues: [{ id: "LLM", severity: "error", message: errMsg || "LLM 生成失败" }],
      });
      continue;
    }

    if (signal.aborted) {
      cancelled = true;
      break;
    }

    await writeTextFile(dir, uncheckName, levelJson);
    logLine(logLines, `seq=${seq} WRITTEN ${uncheckName}`);

    const fixBuilder = (json: string, issues: import("@arrowjaw/shared").ValidationIssue[]) =>
      fillMode && baseCtx
        ? buildFillFixMessages(json, baseCtx, issues, pipelineForm)
        : buildFixMessages(json, issues, pipelineForm);

    const phase3 = await runPhase3Loop(
      form,
      dir,
      config,
      seq,
      uncheckName,
      levelJson,
      logLines,
      optimizedPrompt,
      generateMessages,
      sanitizeOpts,
      fixBuilder,
      callbacks,
      i,
      form.count,
      baseCtx,
      pipelineForm,
    );

    if (phase3.status === "pass") {
      passed++;
    } else if (phase3.status === "fail") {
      failed.push({ seq, issues: phase3.issues ?? [] });
    } else {
      cancelled = true;
      break;
    }
  }

  try {
    await writeGenerationLog(dir, form.prefix, logLines);
  } catch {
    // 日志写入失败不阻塞汇总
  }

  return {
    requested: form.count,
    passed,
    failed,
    cancelled,
    logLines,
  };
}
