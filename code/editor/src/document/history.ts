import type { EditorDocument } from "@arrowjaw/shared";
import { cloneDocument } from "@arrowjaw/shared";

export interface HistoryState {
  past: EditorDocument[];
  future: EditorDocument[];
}

export function createHistory(): HistoryState {
  return { past: [], future: [] };
}

export function pushHistory(history: HistoryState, doc: EditorDocument): HistoryState {
  return {
    past: [...history.past, cloneDocument(doc)].slice(-50),
    future: [],
  };
}

export function undo(
  history: HistoryState,
  current: EditorDocument,
): { history: HistoryState; doc: EditorDocument | null } {
  if (history.past.length === 0) return { history, doc: null };
  const past = [...history.past];
  const prev = past.pop()!;
  return {
    history: { past, future: [cloneDocument(current), ...history.future] },
    doc: prev,
  };
}

export function redo(
  history: HistoryState,
  current: EditorDocument,
): { history: HistoryState; doc: EditorDocument | null } {
  if (history.future.length === 0) return { history, doc: null };
  const future = [...history.future];
  const next = future.shift()!;
  return {
    history: { past: [...history.past, cloneDocument(current)], future },
    doc: next,
  };
}
