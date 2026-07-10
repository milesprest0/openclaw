import type { OpenClawConfig } from "../config/types.js";
/**
 * Rolling per-day JSONL file for per-API-call token observability, alongside the
 * main rolling log under the OpenClaw tmp dir.
 */
export declare function resolveTokenUsageLogPath(date?: Date): string;
export type TokenUsageRecord = {
  ts: string;
  sessionKey: string;
  model?: string;
  provider?: string;
  /** True single-call input tokens (provider prompt_tokens) when resolvable. */
  promptTokens?: number;
  completionTokens?: number;
  /** Raw last-call usage (the actual current context size). */
  lastCallInput?: number;
  lastCallOutput?: number;
  cacheRead?: number;
  cacheWrite?: number;
  /** Accumulated usage across the whole run (sum of all API calls). */
  accumInput?: number;
  accumOutput?: number;
  /** Model context window. */
  contextMax?: number;
  /** Derived context-snapshot total persisted to the session store. */
  totalTokens?: number;
  /** totalTokens / contextMax, rounded to 4dp, when both are known. */
  pctFull?: number;
};
export type PromptInstrumentationRecord = {
  generatedAt: string;
  sessionKey: string;
  sessionId?: string;
  model?: string;
  provider?: string;
  promptTokens?: number;
  systemPrompt: {
    chars: number;
    projectContextChars: number;
    nonProjectContextChars: number;
  };
  tools: {
    schemaChars: number;
  };
  skills: {
    promptChars: number;
  };
  injectedWorkspaceFiles: {
    count: number;
    injectedChars: number;
  };
  retrieval:
    | {
        available: false;
      }
    | {
        available: true;
        entries: unknown[];
      };
  qualityProxy: {
    evalPassRate: null;
    regret: null;
  };
};
/**
 * Append a single token-usage record as one JSON line. Best-effort: never throws,
 * never blocks turn handling. A failure is logged at verbose level only.
 */
export declare function logTokenUsageRecord(
  record: TokenUsageRecord,
  config?: OpenClawConfig | null,
): Promise<void>;
/**
 * Append a single prompt instrumentation record as one JSON line. Best-effort:
 * never throws and never blocks turn handling.
 */
export declare function logPromptInstrumentationRecord(
  record: PromptInstrumentationRecord,
  config?: OpenClawConfig | null,
): Promise<void>;
export declare function buildPctFull(totalTokens?: number, contextMax?: number): number | undefined;
