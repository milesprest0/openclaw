import { subagentRuns } from "./subagent-registry-memory.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";
import { getSubagentSessionStartedAt } from "./subagent-session-metrics.js";

export const STALE_UNENDED_SUBAGENT_RUN_MS = 2 * 60 * 60 * 1_000;
export const RECENT_ENDED_SUBAGENT_CHILD_SESSION_MS = 30 * 60 * 1_000;
const EXPLICIT_TIMEOUT_STALE_GRACE_MS = 60_000;
const MIN_REALISTIC_RUN_TIMESTAMP_MS = Date.UTC(2020, 0, 1);
const DEFAULT_FRESHNESS_FALLBACK_MS = 10 * 60_000;

export const SUBAGENT_RUN_LIVENESS_GATE_KEY = "prest0n.subagentRunLiveness";

function resolveFreshnessMsFromEnv(value: string | undefined): number {
  if (!value) {
    return DEFAULT_FRESHNESS_FALLBACK_MS;
  }
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return DEFAULT_FRESHNESS_FALLBACK_MS;
}

export const DEFAULT_FRESHNESS_MS = resolveFreshnessMsFromEnv(
  process.env.PREST0N_RUN_LIVENESS_FRESHNESS_MS,
);

type LivenessComparableSubagentRun = Pick<
  SubagentRunRecord,
  "createdAt" | "startedAt" | "sessionStartedAt" | "endedAt"
> & {
  lastActivityAt?: number;
};

export type SubagentRunLivenessQuery = {
  runId?: string;
  childSessionKey?: string;
  spawnedAt?: number;
};

export type SubagentRunLivenessAssessment = {
  state: "live" | "dead" | "unknown";
  announceStillRunning: boolean;
  stopMonitoring: boolean;
};

const SUBAGENT_RUN_LIVENESS_UNKNOWN: SubagentRunLivenessAssessment = {
  state: "unknown",
  announceStillRunning: true,
  stopMonitoring: false,
};

function normalizeFiniteTimestamp(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function resolveActivityTimestampMs(run: LivenessComparableSubagentRun): number | undefined {
  const fromSessionStart = getSubagentSessionStartedAt(run);
  const fromLastActivity = normalizeFiniteTimestamp(run.lastActivityAt);
  if (typeof fromSessionStart === "number" && typeof fromLastActivity === "number") {
    return Math.max(fromSessionStart, fromLastActivity);
  }
  return fromLastActivity ?? fromSessionStart;
}

function resolveFreshnessMs(options?: { freshnessMs?: number }): number {
  const freshnessMs = options?.freshnessMs;
  if (typeof freshnessMs === "number" && Number.isFinite(freshnessMs) && freshnessMs > 0) {
    return Math.floor(freshnessMs);
  }
  return DEFAULT_FRESHNESS_MS;
}

function resolveNowMs(nowMs: number): number {
  return Number.isFinite(nowMs) ? nowMs : Date.now();
}

function findLatestRunByChildSessionKey(
  childSessionKey: string,
): LivenessComparableSubagentRun | undefined {
  let latest: LivenessComparableSubagentRun | undefined;
  for (const entry of subagentRuns.values()) {
    if (entry.childSessionKey !== childSessionKey) {
      continue;
    }
    if (!latest || entry.createdAt > latest.createdAt) {
      latest = entry;
    }
  }
  return latest;
}

function resolveRunFromQuery(
  query?: SubagentRunLivenessQuery,
): LivenessComparableSubagentRun | undefined {
  if (!query) {
    return undefined;
  }
  const runId = query.runId?.trim();
  if (runId) {
    const byRunId = subagentRuns.get(runId);
    if (byRunId) {
      return byRunId;
    }
  }
  const childSessionKey = query.childSessionKey?.trim();
  if (childSessionKey) {
    return findLatestRunByChildSessionKey(childSessionKey);
  }
  return undefined;
}

export function assessRunLiveness(
  run: LivenessComparableSubagentRun | null | undefined,
  nowMs: number,
  options?: { freshnessMs?: number },
): SubagentRunLivenessAssessment {
  try {
    if (!run) {
      return {
        state: "dead",
        announceStillRunning: false,
        stopMonitoring: true,
      };
    }
    if (hasSubagentRunEnded(run)) {
      return {
        state: "dead",
        announceStillRunning: false,
        stopMonitoring: true,
      };
    }

    const effectiveNowMs = resolveNowMs(nowMs);
    const activityTimestampMs = resolveActivityTimestampMs(run);
    if (typeof activityTimestampMs !== "number") {
      return SUBAGENT_RUN_LIVENESS_UNKNOWN;
    }

    const freshnessMs = resolveFreshnessMs(options);
    if (effectiveNowMs - activityTimestampMs <= freshnessMs) {
      return {
        state: "live",
        announceStillRunning: true,
        stopMonitoring: false,
      };
    }

    return {
      state: "dead",
      announceStillRunning: false,
      stopMonitoring: true,
    };
  } catch {
    return SUBAGENT_RUN_LIVENESS_UNKNOWN;
  }
}

function assessRunLivenessFromQuery(
  query: SubagentRunLivenessQuery,
  nowMs: number,
): SubagentRunLivenessAssessment {
  return assessRunLiveness(resolveRunFromQuery(query), nowMs);
}

export function registerSubagentRunLivenessGate(): boolean {
  const gateSymbol = Symbol.for(SUBAGENT_RUN_LIVENESS_GATE_KEY);
  const globalRecord = globalThis as Record<PropertyKey, unknown>;
  if (typeof globalRecord[gateSymbol] === "function") {
    return false;
  }
  globalRecord[gateSymbol] = (
    query: SubagentRunLivenessQuery,
    nowMs: number,
  ): SubagentRunLivenessAssessment => {
    try {
      return assessRunLivenessFromQuery(query, resolveNowMs(nowMs));
    } catch {
      return SUBAGENT_RUN_LIVENESS_UNKNOWN;
    }
  };
  return true;
}

export function hasSubagentRunEnded<T extends Pick<SubagentRunRecord, "endedAt">>(
  entry: T,
): entry is T & { endedAt: number } {
  return typeof entry.endedAt === "number" && Number.isFinite(entry.endedAt);
}

function resolveStaleCutoffMs(entry: Pick<SubagentRunRecord, "runTimeoutSeconds">): number {
  const timeoutSeconds = entry.runTimeoutSeconds;
  if (typeof timeoutSeconds === "number" && Number.isFinite(timeoutSeconds) && timeoutSeconds > 0) {
    return Math.max(
      STALE_UNENDED_SUBAGENT_RUN_MS,
      Math.floor(timeoutSeconds) * 1_000 + EXPLICIT_TIMEOUT_STALE_GRACE_MS,
    );
  }
  return STALE_UNENDED_SUBAGENT_RUN_MS;
}

export function isStaleUnendedSubagentRun(
  entry: Pick<
    SubagentRunRecord,
    "createdAt" | "startedAt" | "sessionStartedAt" | "endedAt" | "runTimeoutSeconds"
  >,
  now = Date.now(),
): boolean {
  if (hasSubagentRunEnded(entry)) {
    return false;
  }
  const startedAt = getSubagentSessionStartedAt(entry);
  if (
    typeof startedAt !== "number" ||
    !Number.isFinite(startedAt) ||
    startedAt < MIN_REALISTIC_RUN_TIMESTAMP_MS
  ) {
    return false;
  }
  return now - startedAt > resolveStaleCutoffMs(entry);
}

export function isLiveUnendedSubagentRun(
  entry: Pick<
    SubagentRunRecord,
    "createdAt" | "startedAt" | "sessionStartedAt" | "endedAt" | "runTimeoutSeconds"
  >,
  now = Date.now(),
): boolean {
  return !hasSubagentRunEnded(entry) && !isStaleUnendedSubagentRun(entry, now);
}

function isRecentlyEndedSubagentRun(
  entry: Pick<SubagentRunRecord, "endedAt">,
  now = Date.now(),
  recentMs = RECENT_ENDED_SUBAGENT_CHILD_SESSION_MS,
): boolean {
  if (!hasSubagentRunEnded(entry)) {
    return false;
  }
  return now - entry.endedAt <= recentMs;
}

export function shouldKeepSubagentRunChildLink(
  entry: Pick<
    SubagentRunRecord,
    "createdAt" | "startedAt" | "sessionStartedAt" | "endedAt" | "runTimeoutSeconds"
  >,
  options?: {
    activeDescendants?: number;
    now?: number;
  },
): boolean {
  const now = options?.now ?? Date.now();
  return (
    isLiveUnendedSubagentRun(entry, now) ||
    (options?.activeDescendants ?? 0) > 0 ||
    isRecentlyEndedSubagentRun(entry, now)
  );
}

registerSubagentRunLivenessGate();
