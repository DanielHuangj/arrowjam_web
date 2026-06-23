import type { ValidationIssue } from "@arrowjaw/shared";

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /** Qwen3 等思考模型：设为 false 可加速并减少空 content */
  enableThinking?: boolean;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export const AI_GEN_MAX_COUNT = 20;
export const AI_MAX_FIX_ATTEMPTS = 4;

export const AI_KIND_OPTIONS: { kind: number; label: string; locked?: boolean }[] = [
  { kind: 1, label: "K1 折线箭", locked: true },
  { kind: 2, label: "K2 翻转箭" },
  { kind: 3, label: "K3 管道" },
  { kind: 4, label: "K4 反射角" },
  { kind: 5, label: "K5 定时炸弹" },
  { kind: 6, label: "K6 幕布" },
  { kind: 7, label: "K7 移动墙" },
  { kind: 8, label: "K8 捆绑箭" },
  { kind: 11, label: "K11 钥匙箭" },
  { kind: 12, label: "K12 子区域" },
  { kind: 13, label: "K13 冻结箭" },
];

export interface GenerationForm {
  prefix: string;
  width: number;
  height: number;
  durationInSec: number;
  difficulty: 1 | 2 | 3;
  levelKind: number | undefined;
  count: number;
  allowedKinds: number[];
  keywords: string;
  /** 可选：作为二次编辑基础的关卡 JSON 字符串 */
  baseLevelJson?: string;
  /** 二次填充：基础关箭身占用格数（pipeline 注入） */
  fillBaseOccupiedCells?: number;
  /** 二次填充：要求至少新增的箭身格数（pipeline 注入） */
  fillMinAddedCells?: number;
}

export interface OptimizeResult {
  optimized_prompt: string;
  design_notes?: string;
  /** Phase 1 建议箭数；Phase 2 仍以 getDifficultyTargets 为硬下限 */
  target_arrow_count?: number;
  /** Phase 1 建议 occupancy；Phase 2 仍以 getDifficultyTargets 为硬下限 */
  target_occupancy?: number;
}

export type PipelinePhase = 1 | 2 | 3;

export interface PipelineProgress {
  phase: PipelinePhase;
  index?: number;
  total?: number;
  fixAttempt?: number;
  message: string;
}

export interface GenerationFailure {
  seq: string;
  issues: ValidationIssue[];
}

export interface GenerationResult {
  requested: number;
  passed: number;
  failed: GenerationFailure[];
  cancelled: boolean;
  logLines: string[];
}

export interface PipelineCallbacks {
  onProgress: (p: PipelineProgress) => void;
  signal: AbortSignal;
}
