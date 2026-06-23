import { BOARD_MAX_SIZE, BOARD_MIN_SIZE, isBoardSizeValid } from "../board-limits.ts";
import { AI_GEN_MAX_COUNT, AI_KIND_OPTIONS } from "../ai/types.ts";

const STORAGE_KEY = "arrowjaw-ai-gen-form";

export interface AiGenFormPrefs {
  prefix: string;
  width: number;
  height: number;
  durationInSec: number;
  count: number;
  difficulty: 1 | 2 | 3;
  levelKind: number;
  allowedKinds: number[];
  keywords: string;
  baseLevelJson?: string;
  baseFileName?: string;
}

const DEFAULT_PREFS: AiGenFormPrefs = {
  prefix: "",
  width: 20,
  height: 32,
  durationInSec: 150,
  count: 1,
  difficulty: 1,
  levelKind: 2,
  allowedKinds: [1],
  keywords: "",
};

export function loadAiGenFormPrefs(): AiGenFormPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return sanitizePrefs(JSON.parse(raw) as Partial<AiGenFormPrefs>);
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveAiGenFormPrefs(prefs: AiGenFormPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizePrefs(prefs)));
  } catch {
    // localStorage 满或不可用时忽略
  }
}

function sanitizePrefs(raw: Partial<AiGenFormPrefs>): AiGenFormPrefs {
  const width = clampInt(raw.width, BOARD_MIN_SIZE, BOARD_MAX_SIZE, DEFAULT_PREFS.width);
  const height = clampInt(raw.height, BOARD_MIN_SIZE, BOARD_MAX_SIZE, DEFAULT_PREFS.height);
  const durationInSec = clampInt(raw.durationInSec, 1, 9999, DEFAULT_PREFS.durationInSec);
  const count = clampInt(raw.count, 1, AI_GEN_MAX_COUNT, DEFAULT_PREFS.count);
  const difficulty = raw.difficulty === 2 || raw.difficulty === 3 ? raw.difficulty : 1;
  const levelKind = raw.levelKind === 1 ? 1 : 2;

  const allowedSet = new Set<number>();
  if (Array.isArray(raw.allowedKinds)) {
    for (const k of raw.allowedKinds) {
      if (typeof k === "number" && AI_KIND_OPTIONS.some((o) => o.kind === k)) {
        allowedSet.add(k);
      }
    }
  }
  if (!allowedSet.has(1)) allowedSet.add(1);

  let baseLevelJson: string | undefined;
  let baseFileName: string | undefined;
  if (typeof raw.baseLevelJson === "string" && raw.baseLevelJson.trim()) {
    try {
      const parsed = JSON.parse(raw.baseLevelJson) as { width?: number; height?: number };
      if (
        typeof parsed.width === "number" &&
        typeof parsed.height === "number" &&
        isBoardSizeValid(parsed.width, parsed.height)
      ) {
        baseLevelJson = raw.baseLevelJson;
        baseFileName =
          typeof raw.baseFileName === "string" && raw.baseFileName.trim()
            ? raw.baseFileName.trim()
            : "已保存的基础关";
      }
    } catch {
      // drop invalid base level
    }
  }

  return {
    prefix: typeof raw.prefix === "string" ? raw.prefix : DEFAULT_PREFS.prefix,
    width,
    height,
    durationInSec,
    count,
    difficulty,
    levelKind,
    allowedKinds: [...allowedSet],
    keywords: typeof raw.keywords === "string" ? raw.keywords : DEFAULT_PREFS.keywords,
    baseLevelJson,
    baseFileName,
  };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export interface AiGenFormElements {
  prefixEl: HTMLInputElement;
  widthEl: HTMLInputElement;
  heightEl: HTMLInputElement;
  durEl: HTMLInputElement;
  countEl: HTMLInputElement;
  diffEl: HTMLSelectElement;
  levelKindEl: HTMLSelectElement;
  keywordsEl: HTMLTextAreaElement;
  kindsEl: HTMLElement;
  baseLevelJson?: string;
  baseFileName?: string;
}

export function collectAiGenFormPrefs(els: AiGenFormElements): AiGenFormPrefs {
  const allowedKinds = AI_KIND_OPTIONS.filter((opt) => {
    const cb = els.kindsEl.querySelector(`input[value="${opt.kind}"]`) as HTMLInputElement | null;
    return cb?.checked;
  }).map((o) => o.kind);
  if (!allowedKinds.includes(1)) allowedKinds.unshift(1);

  return sanitizePrefs({
    prefix: els.prefixEl.value,
    width: parseInt(els.widthEl.value, 10),
    height: parseInt(els.heightEl.value, 10),
    durationInSec: parseInt(els.durEl.value, 10),
    count: parseInt(els.countEl.value, 10),
    difficulty: parseInt(els.diffEl.value, 10) as 1 | 2 | 3,
    levelKind: parseInt(els.levelKindEl.value, 10),
    allowedKinds,
    keywords: els.keywordsEl.value,
    baseLevelJson: els.baseLevelJson,
    baseFileName: els.baseFileName,
  });
}

export function applyAiGenFormPrefs(prefs: AiGenFormPrefs, els: AiGenFormElements): void {
  els.prefixEl.value = prefs.prefix;
  els.widthEl.value = String(prefs.width);
  els.heightEl.value = String(prefs.height);
  els.durEl.value = String(prefs.durationInSec);
  els.countEl.value = String(prefs.count);
  els.diffEl.value = String(prefs.difficulty);
  els.levelKindEl.value = String(prefs.levelKind);
  els.keywordsEl.value = prefs.keywords;

  for (const opt of AI_KIND_OPTIONS) {
    const cb = els.kindsEl.querySelector(`input[value="${opt.kind}"]`) as HTMLInputElement | null;
    if (!cb || cb.disabled) continue;
    cb.checked = prefs.allowedKinds.includes(opt.kind);
  }
}
