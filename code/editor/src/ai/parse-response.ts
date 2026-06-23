function parseJsonWithHint(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const truncatedHint =
      raw.length > 15_000 ||
      /after array element|Unexpected end of JSON|Unterminated string/i.test(msg)
        ? "（疑似 LLM 输出过长被 maxTokens 截断，已改用 delta 格式；若仍失败请提高 ai-config 中 maxTokens）"
        : "";
    throw new Error(`${msg}${truncatedHint}`);
  }
}

export function extractJsonFromLlm(text: string): unknown {
  const trimmed = text.trim();

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    return parseJsonWithHint(fenceMatch[1].trim());
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return parseJsonWithHint(trimmed.slice(firstBrace, lastBrace + 1));
  }

  return parseJsonWithHint(trimmed);
}

export function extractJsonString(text: string): string {
  const parsed = extractJsonFromLlm(text);
  return JSON.stringify(parsed, null, 2);
}
