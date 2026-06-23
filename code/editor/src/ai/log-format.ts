import type { ValidationIssue } from "@arrowjaw/shared";
import type { ChatMessage } from "./types.ts";
import { formatIssuesSummary } from "./validate-level.ts";

export function formatChatMessagesForLog(messages: ChatMessage[]): string {
  return messages
    .map((m) => `[${m.role}]\n${m.content}`)
    .join("\n\n---\n\n");
}

export function appendGeneratePromptLog(
  lines: string[],
  seq: string,
  optimizedPrompt: string,
  generateMessages: ChatMessage[],
): void {
  lines.push(`--- seq=${seq} GENERATE_PROMPT optimized_prompt ---`);
  lines.push(optimizedPrompt);
  lines.push(`--- seq=${seq} GENERATE_PROMPT messages ---`);
  lines.push(formatChatMessagesForLog(generateMessages));
  lines.push(`--- seq=${seq} GENERATE_PROMPT end ---`);
}

export function appendFixAttemptLog(
  lines: string[],
  seq: string,
  attempt: number,
  issues: ValidationIssue[],
): void {
  lines.push(
    `seq=${seq} FIX_ATTEMPT ${attempt} issues=${formatIssuesSummary(issues, 8) || "none"}`,
  );
}

export function appendSanitizerLog(
  lines: string[],
  seq: string,
  actions: string[],
  changed: boolean,
): void {
  if (!changed) return;
  lines.push(`seq=${seq} SANITIZE ${actions.slice(0, 8).join("; ") || "changed"}`);
}
