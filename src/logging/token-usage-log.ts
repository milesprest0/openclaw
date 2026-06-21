import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../config/types.js";
import { logVerbose } from "../globals.js";
import {
  POSIX_OPENCLAW_TMP_DIR,
  resolvePreferredOpenClawTmpDir,
} from "../infra/tmp-openclaw-dir.js";

const LOG_PREFIX = "token-usage";
const LOG_SUFFIX = ".jsonl";

function canUseNodeFs(): boolean {
  const getBuiltinModule = (
    process as NodeJS.Process & {
      getBuiltinModule?: (id: string) => unknown;
    }
  ).getBuiltinModule;
  if (typeof getBuiltinModule !== "function") {
    return false;
  }
  try {
    return getBuiltinModule("fs") !== undefined;
  } catch {
    return false;
  }
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Rolling per-day JSONL file for per-API-call token observability, alongside the
 * main rolling log under the OpenClaw tmp dir.
 */
export function resolveTokenUsageLogPath(date = new Date()): string {
  const logDir = canUseNodeFs() ? resolvePreferredOpenClawTmpDir() : POSIX_OPENCLAW_TMP_DIR;
  return path.join(logDir, `${LOG_PREFIX}-${formatLocalDate(date)}${LOG_SUFFIX}`);
}

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

function tokenUsageLogEnabled(config?: OpenClawConfig | null): boolean {
  return config?.logging?.tokenUsageLog !== false;
}

function promptInstrumentationEnabled(config?: OpenClawConfig | null): boolean {
  return config?.observability?.promptInstrumentation?.enabled === true;
}

/**
 * Append a single token-usage record as one JSON line. Best-effort: never throws,
 * never blocks turn handling. A failure is logged at verbose level only.
 */
export async function logTokenUsageRecord(
  record: TokenUsageRecord,
  config?: OpenClawConfig | null,
): Promise<void> {
  if (!tokenUsageLogEnabled(config)) {
    return;
  }
  if (!canUseNodeFs()) {
    return;
  }
  try {
    const filePath = resolveTokenUsageLogPath();
    await mkdir(path.dirname(filePath), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
  } catch (err) {
    logVerbose(`failed to append token usage record: ${String(err)}`);
  }
}

/**
 * Append a single prompt instrumentation record as one JSON line. Best-effort:
 * never throws and never blocks turn handling.
 */
export async function logPromptInstrumentationRecord(
  record: PromptInstrumentationRecord,
  config?: OpenClawConfig | null,
): Promise<void> {
  if (!promptInstrumentationEnabled(config)) {
    return;
  }
  if (!canUseNodeFs()) {
    return;
  }
  try {
    const filePath = resolveTokenUsageLogPath();
    await mkdir(path.dirname(filePath), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
  } catch (err) {
    logVerbose(`failed to append prompt instrumentation record: ${String(err)}`);
  }
}

export function buildPctFull(totalTokens?: number, contextMax?: number): number | undefined {
  if (
    typeof totalTokens === "number" &&
    Number.isFinite(totalTokens) &&
    typeof contextMax === "number" &&
    Number.isFinite(contextMax) &&
    contextMax > 0
  ) {
    return Math.round((totalTokens / contextMax) * 10000) / 10000;
  }
  return undefined;
}
