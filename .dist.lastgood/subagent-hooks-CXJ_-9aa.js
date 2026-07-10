import { a as resolveSlackAccount } from "./accounts-Stz3jcMX.js";
import { h as stringifyRouteThreadId } from "./channel-route-B9olp3tt.js";
import "./text-runtime-lKuAtsoz.js";
import { t as sendMessageSlack } from "./send-JE0jcFcj.js";
import {
  c as normalizeOptionalString,
  s as normalizeOptionalLowercaseString,
} from "./string-coerce-BdEutqX5.js";
import { t as normalizeSlackThreadTsCandidate } from "./thread-ts-CAy_-OyD.js";
//#region extensions/slack/src/subagent-hooks.ts
const SLACK_SUBAGENT_PROGRESS_TICK_INTERVAL_MS = 5 * 6e4;
const SLACK_SUBAGENT_PROGRESS_TICKER_MAX_AGE_MS = 60 * 6e4;
const slackSubagentStateBySessionKey = /* @__PURE__ */ new Map();
const slackSubagentSessionKeyByRunId = /* @__PURE__ */ new Map();
function clearSlackSubagentRunAlias(runId) {
  const normalizedRunId = normalizeOptionalString(runId);
  if (!normalizedRunId) return;
  slackSubagentSessionKeyByRunId.delete(normalizedRunId);
}
function removeSlackSubagentStateBySessionKey(sessionKey) {
  const state = slackSubagentStateBySessionKey.get(sessionKey);
  if (!state) return;
  clearSlackSubagentTicker(state);
  slackSubagentStateBySessionKey.delete(sessionKey);
  clearSlackSubagentRunAlias(state.runId);
  return state;
}
function resolveSlackSubagentEndedState(event) {
  const direct = slackSubagentStateBySessionKey.get(event.targetSessionKey);
  if (direct)
    return {
      sessionKey: event.targetSessionKey,
      state: direct,
    };
  const runId = normalizeOptionalString(event.runId);
  if (!runId) return;
  const sessionKey = slackSubagentSessionKeyByRunId.get(runId);
  if (!sessionKey) return;
  const state = slackSubagentStateBySessionKey.get(sessionKey);
  if (!state) {
    slackSubagentSessionKeyByRunId.delete(runId);
    return;
  }
  return {
    sessionKey,
    state,
  };
}
function resolveSlackOriginFromRequester(params) {
  if (normalizeOptionalLowercaseString(params.requester?.channel) !== "slack") return;
  const to = normalizeOptionalString(params.requester?.to);
  if (!to) return;
  const fallbackAccountId = normalizeOptionalString(params.requester?.accountId) || "default";
  const accountId = params.cfg
    ? resolveSlackAccount({
        cfg: params.cfg,
        accountId: params.requester?.accountId,
      }).accountId
    : fallbackAccountId;
  const threadId = normalizeSlackThreadTsCandidate(
    params.requester?.threadId != null && params.requester.threadId !== ""
      ? stringifyRouteThreadId(params.requester.threadId)
      : void 0,
  );
  return {
    channel: "slack",
    accountId,
    to,
    ...(threadId ? { threadId } : {}),
  };
}
function buildSubagentLabel(params) {
  const label = normalizeOptionalString(params.label);
  if (label) return label;
  const agentId = normalizeOptionalString(params.agentId);
  if (agentId) return agentId;
  return "subagent";
}
function buildSlackSubagentCompletionText(params) {
  if (params.outcome === "ok") return `Subagent ${params.label} completed.`;
  if (params.outcome === "timeout") return `Subagent ${params.label} timed out.`;
  if (params.outcome === "killed") return `Subagent ${params.label} was stopped.`;
  if (params.outcome === "deleted" || params.outcome === "reset")
    return `Subagent ${params.label} ended before completion.`;
  if (params.outcome === "error") {
    const error = normalizeOptionalString(params.error);
    return error ? `Subagent ${params.label} failed: ${error}` : `Subagent ${params.label} failed.`;
  }
  return `Subagent ${params.label} ended.`;
}
async function sendSlackSubagentThreadMessage(params) {
  if (!params.state.origin.threadId) return;
  await sendMessageSlack(params.state.origin.to, params.text, {
    cfg: params.api.config,
    accountId: params.state.origin.accountId,
    threadTs: params.state.origin.threadId,
  });
}
function clearSlackSubagentTicker(state) {
  if (!state?.ticker) return;
  clearInterval(state.ticker);
  delete state.ticker;
}
function maybeStartSlackSubagentTicker(params) {
  if (!params.state.origin.threadId) return;
  clearSlackSubagentTicker(params.state);
  const ticker = setInterval(() => {
    if (Date.now() - params.state.spawnedAt > SLACK_SUBAGENT_PROGRESS_TICKER_MAX_AGE_MS) {
      removeSlackSubagentStateBySessionKey(params.state.childSessionKey);
      return;
    }
    const elapsedMinutes = Math.max(1, Math.floor((Date.now() - params.state.spawnedAt) / 6e4));
    sendSlackSubagentThreadMessage({
      api: params.api,
      state: params.state,
      text: `Subagent ${params.label} is still running (${elapsedMinutes}m elapsed).`,
    }).catch(() => {});
  }, SLACK_SUBAGENT_PROGRESS_TICK_INTERVAL_MS);
  ticker.unref?.();
  params.state.ticker = ticker;
}
async function handleSlackSubagentSpawning(event) {
  const origin = resolveSlackOriginFromRequester({ requester: event.requester });
  if (!origin) {
    removeSlackSubagentStateBySessionKey(event.childSessionKey);
    return;
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
}
async function handleSlackSubagentSpawned(api, event) {
  const origin = resolveSlackOriginFromRequester({
    cfg: api.config,
    requester: event.requester,
  });
  if (!origin) return;
  const existing = slackSubagentStateBySessionKey.get(event.childSessionKey);
  clearSlackSubagentRunAlias(existing?.runId);
  const state = {
    childSessionKey: event.childSessionKey,
    origin,
    spawnedAt: existing?.spawnedAt ?? Date.now(),
    runId: normalizeOptionalString(event.runId) ?? existing?.runId,
    label: normalizeOptionalString(event.label) ?? existing?.label,
    agentId: normalizeOptionalString(event.agentId) ?? existing?.agentId,
  };
  slackSubagentStateBySessionKey.set(event.childSessionKey, state);
  if (state.runId) slackSubagentSessionKeyByRunId.set(state.runId, event.childSessionKey);
  const label = buildSubagentLabel({
    label: state.label,
    agentId: state.agentId,
  });
  try {
    await sendSlackSubagentThreadMessage({
      api,
      state,
      text: `Subagent ${label} started. I will post progress updates here every 5 minutes.`,
    });
  } catch {}
  maybeStartSlackSubagentTicker({
    api,
    state,
    label,
  });
}
function handleSlackSubagentDeliveryTarget(event) {
  if (!event.expectsCompletionMessage) return;
  const cached = slackSubagentStateBySessionKey.get(event.childSessionKey);
  if (cached)
    return {
      origin: {
        channel: "slack",
        accountId: cached.origin.accountId,
        to: cached.origin.to,
        ...(cached.origin.threadId ? { threadId: cached.origin.threadId } : {}),
      },
    };
  const fallback = resolveSlackOriginFromRequester({ requester: event.requesterOrigin });
  if (!fallback) return;
  return {
    origin: {
      channel: "slack",
      accountId: fallback.accountId,
      to: fallback.to,
      ...(fallback.threadId ? { threadId: fallback.threadId } : {}),
    },
  };
}
async function handleSlackSubagentEnded(api, event) {
  const resolved = resolveSlackSubagentEndedState(event);
  if (!resolved) return;
  const state = removeSlackSubagentStateBySessionKey(resolved.sessionKey);
  if (!state) return;
  const label = buildSubagentLabel({
    label: state.label,
    agentId: state.agentId,
  });
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
  } catch {}
}
const __testing = {
  resetSlackSubagentHooksState() {
    for (const state of slackSubagentStateBySessionKey.values()) clearSlackSubagentTicker(state);
    slackSubagentStateBySessionKey.clear();
    slackSubagentSessionKeyByRunId.clear();
  },
};
//#endregion
export {
  __testing,
  handleSlackSubagentDeliveryTarget,
  handleSlackSubagentEnded,
  handleSlackSubagentSpawned,
  handleSlackSubagentSpawning,
};
