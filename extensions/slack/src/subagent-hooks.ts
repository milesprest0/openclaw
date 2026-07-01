import type { OpenClawPluginApi } from "openclaw/plugin-sdk/channel-plugin-common";
import { stringifyRouteThreadId } from "openclaw/plugin-sdk/channel-route";
import {
  normalizeOptionalLowercaseString,
  normalizeOptionalString,
} from "openclaw/plugin-sdk/text-runtime";
import { resolveSlackAccount } from "./accounts.js";
import { sendMessageSlack } from "./send.js";
import { normalizeSlackThreadTsCandidate } from "./thread-ts.js";

const SLACK_SUBAGENT_PROGRESS_TICK_INTERVAL_MS = 5 * 60_000;
const SLACK_SUBAGENT_PROGRESS_TICKER_MAX_AGE_MS = 60 * 60_000;

type SlackSubagentOrigin = {
  channel: "slack";
  accountId: string;
  to: string;
  threadId?: string;
};

type SlackSubagentState = {
  childSessionKey: string;
  origin: SlackSubagentOrigin;
  spawnedAt: number;
  runId?: string;
  label?: string;
  agentId?: string;
  ticker?: ReturnType<typeof setInterval>;
};

type SlackSubagentSpawningEvent = {
  childSessionKey: string;
  requester?: {
    channel?: string;
    accountId?: string;
    to?: string;
    threadId?: string | number;
  };
  label?: string;
  agentId?: string;
};

type SlackSubagentSpawnedEvent = SlackSubagentSpawningEvent & {
  runId?: string;
};

type SlackSubagentDeliveryTargetEvent = {
  childSessionKey: string;
  expectsCompletionMessage?: boolean;
  requesterOrigin?: {
    channel?: string;
    accountId?: string;
    to?: string;
    threadId?: string | number;
  };
};

type SlackSubagentDeliveryTargetResult =
  | {
      origin: {
        channel: "slack";
        accountId?: string;
        to?: string;
        threadId?: string | number;
      };
    }
  | undefined;

type SlackSubagentEndedEvent = {
  targetSessionKey: string;
  runId?: string;
  outcome?: "ok" | "error" | "timeout" | "killed" | "reset" | "deleted";
  error?: string;
};

const slackSubagentStateBySessionKey = new Map<string, SlackSubagentState>();
const slackSubagentSessionKeyByRunId = new Map<string, string>();

function clearSlackSubagentRunAlias(runId?: string) {
  const normalizedRunId = normalizeOptionalString(runId);
  if (!normalizedRunId) {
    return;
  }
  slackSubagentSessionKeyByRunId.delete(normalizedRunId);
}

function removeSlackSubagentStateBySessionKey(sessionKey: string) {
  const state = slackSubagentStateBySessionKey.get(sessionKey);
  if (!state) {
    return undefined;
  }
  clearSlackSubagentTicker(state);
  slackSubagentStateBySessionKey.delete(sessionKey);
  clearSlackSubagentRunAlias(state.runId);
  return state;
}

function resolveSlackSubagentEndedState(event: SlackSubagentEndedEvent):
  | {
      sessionKey: string;
      state: SlackSubagentState;
    }
  | undefined {
  const direct = slackSubagentStateBySessionKey.get(event.targetSessionKey);
  if (direct) {
    return {
      sessionKey: event.targetSessionKey,
      state: direct,
    };
  }
  const runId = normalizeOptionalString(event.runId);
  if (!runId) {
    return undefined;
  }
  const sessionKey = slackSubagentSessionKeyByRunId.get(runId);
  if (!sessionKey) {
    return undefined;
  }
  const state = slackSubagentStateBySessionKey.get(sessionKey);
  if (!state) {
    slackSubagentSessionKeyByRunId.delete(runId);
    return undefined;
  }
  return {
    sessionKey,
    state,
  };
}

function resolveSlackOriginFromRequester(params: {
  cfg?: Parameters<typeof resolveSlackAccount>[0]["cfg"];
  requester?: {
    channel?: string;
    accountId?: string;
    to?: string;
    threadId?: string | number;
  };
}): SlackSubagentOrigin | undefined {
  const channel = normalizeOptionalLowercaseString(params.requester?.channel);
  if (channel !== "slack") {
    return undefined;
  }
  const to = normalizeOptionalString(params.requester?.to);
  if (!to) {
    return undefined;
  }
  const fallbackAccountId = normalizeOptionalString(params.requester?.accountId) || "default";
  const accountId = params.cfg
    ? resolveSlackAccount({
        cfg: params.cfg,
        accountId: params.requester?.accountId,
      }).accountId
    : fallbackAccountId;
  const rawThreadId =
    params.requester?.threadId != null && params.requester.threadId !== ""
      ? stringifyRouteThreadId(params.requester.threadId)
      : undefined;
  const threadId = normalizeSlackThreadTsCandidate(rawThreadId);
  return {
    channel: "slack",
    accountId,
    to,
    ...(threadId ? { threadId } : {}),
  };
}

function buildSubagentLabel(params: { label?: string; agentId?: string }): string {
  const label = normalizeOptionalString(params.label);
  if (label) {
    return label;
  }
  const agentId = normalizeOptionalString(params.agentId);
  if (agentId) {
    return agentId;
  }
  return "subagent";
}

function buildSlackSubagentCompletionText(params: {
  label: string;
  outcome?: SlackSubagentEndedEvent["outcome"];
  error?: string;
}): string {
  if (params.outcome === "ok") {
    return `Subagent ${params.label} completed.`;
  }
  if (params.outcome === "timeout") {
    return `Subagent ${params.label} timed out.`;
  }
  if (params.outcome === "killed") {
    return `Subagent ${params.label} was stopped.`;
  }
  if (params.outcome === "deleted" || params.outcome === "reset") {
    return `Subagent ${params.label} ended before completion.`;
  }
  if (params.outcome === "error") {
    const error = normalizeOptionalString(params.error);
    return error ? `Subagent ${params.label} failed: ${error}` : `Subagent ${params.label} failed.`;
  }
  return `Subagent ${params.label} ended.`;
}

async function sendSlackSubagentThreadMessage(params: {
  api: OpenClawPluginApi;
  state: SlackSubagentState;
  text: string;
}) {
  if (!params.state.origin.threadId) {
    return;
  }
  await sendMessageSlack(params.state.origin.to, params.text, {
    cfg: params.api.config,
    accountId: params.state.origin.accountId,
    threadTs: params.state.origin.threadId,
  });
}

function clearSlackSubagentTicker(state?: SlackSubagentState) {
  if (!state?.ticker) {
    return;
  }
  clearInterval(state.ticker);
  delete state.ticker;
}

function maybeStartSlackSubagentTicker(params: {
  api: OpenClawPluginApi;
  state: SlackSubagentState;
  label: string;
}) {
  if (!params.state.origin.threadId) {
    return;
  }
  clearSlackSubagentTicker(params.state);
  const ticker = setInterval(() => {
    if (Date.now() - params.state.spawnedAt > SLACK_SUBAGENT_PROGRESS_TICKER_MAX_AGE_MS) {
      removeSlackSubagentStateBySessionKey(params.state.childSessionKey);
      return;
    }
    const elapsedMinutes = Math.max(1, Math.floor((Date.now() - params.state.spawnedAt) / 60_000));
    void sendSlackSubagentThreadMessage({
      api: params.api,
      state: params.state,
      text: `Subagent ${params.label} is still running (${elapsedMinutes}m elapsed).`,
    }).catch(() => {
      // Best-effort progress telemetry only.
    });
  }, SLACK_SUBAGENT_PROGRESS_TICK_INTERVAL_MS);
  ticker.unref?.();
  params.state.ticker = ticker;
}

export async function handleSlackSubagentSpawning(event: SlackSubagentSpawningEvent) {
  const origin = resolveSlackOriginFromRequester({ requester: event.requester });
  if (!origin) {
    removeSlackSubagentStateBySessionKey(event.childSessionKey);
    return undefined;
  }
  const existing = slackSubagentStateBySessionKey.get(event.childSessionKey);
  clearSlackSubagentTicker(existing);
  clearSlackSubagentRunAlias(existing?.runId);
  slackSubagentStateBySessionKey.set(event.childSessionKey, {
    childSessionKey: event.childSessionKey,
    origin,
    spawnedAt: Date.now(),
    label: normalizeOptionalString(event.label),
    agentId: normalizeOptionalString(event.agentId),
  });
  return undefined;
}

export async function handleSlackSubagentSpawned(
  api: OpenClawPluginApi,
  event: SlackSubagentSpawnedEvent,
) {
  const origin = resolveSlackOriginFromRequester({ cfg: api.config, requester: event.requester });
  if (!origin) {
    return;
  }
  const existing = slackSubagentStateBySessionKey.get(event.childSessionKey);
  clearSlackSubagentRunAlias(existing?.runId);
  const state: SlackSubagentState = {
    childSessionKey: event.childSessionKey,
    origin,
    spawnedAt: existing?.spawnedAt ?? Date.now(),
    runId: normalizeOptionalString(event.runId) ?? existing?.runId,
    label: normalizeOptionalString(event.label) ?? existing?.label,
    agentId: normalizeOptionalString(event.agentId) ?? existing?.agentId,
  };
  slackSubagentStateBySessionKey.set(event.childSessionKey, state);
  if (state.runId) {
    slackSubagentSessionKeyByRunId.set(state.runId, event.childSessionKey);
  }
  const label = buildSubagentLabel({ label: state.label, agentId: state.agentId });
  try {
    await sendSlackSubagentThreadMessage({
      api,
      state,
      text: `Subagent ${label} started. I will post progress updates here every 5 minutes.`,
    });
  } catch {
    // Best-effort progress telemetry only.
  }
  maybeStartSlackSubagentTicker({ api, state, label });
}

export function handleSlackSubagentDeliveryTarget(
  event: SlackSubagentDeliveryTargetEvent,
): SlackSubagentDeliveryTargetResult {
  if (!event.expectsCompletionMessage) {
    return undefined;
  }
  const cached = slackSubagentStateBySessionKey.get(event.childSessionKey);
  if (cached) {
    return {
      origin: {
        channel: "slack",
        accountId: cached.origin.accountId,
        to: cached.origin.to,
        ...(cached.origin.threadId ? { threadId: cached.origin.threadId } : {}),
      },
    };
  }
  const fallback = resolveSlackOriginFromRequester({ requester: event.requesterOrigin });
  if (!fallback) {
    return undefined;
  }
  return {
    origin: {
      channel: "slack",
      accountId: fallback.accountId,
      to: fallback.to,
      ...(fallback.threadId ? { threadId: fallback.threadId } : {}),
    },
  };
}

export async function handleSlackSubagentEnded(
  api: OpenClawPluginApi,
  event: SlackSubagentEndedEvent,
) {
  const resolved = resolveSlackSubagentEndedState(event);
  if (!resolved) {
    return;
  }
  const state = removeSlackSubagentStateBySessionKey(resolved.sessionKey);
  if (!state) {
    return;
  }
  const label = buildSubagentLabel({ label: state.label, agentId: state.agentId });
  try {
    await sendSlackSubagentThreadMessage({
      api,
      state,
      text: buildSlackSubagentCompletionText({
        label,
        outcome: event.outcome,
        error: event.error,
      }),
    });
  } catch {
    // Best-effort progress telemetry only.
  }
}

export const __testing = {
  resetSlackSubagentHooksState() {
    for (const state of slackSubagentStateBySessionKey.values()) {
      clearSlackSubagentTicker(state);
    }
    slackSubagentStateBySessionKey.clear();
    slackSubagentSessionKeyByRunId.clear();
  },
};
