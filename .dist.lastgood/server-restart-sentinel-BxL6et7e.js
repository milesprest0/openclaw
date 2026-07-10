import { createHash } from "node:crypto";
import path from "node:path";
import { p as resolveSessionAgentId } from "./agent-scope-9AmhTwki.js";
import { n as timestampOptsFromConfig, t as injectTimestamp } from "./agent-timestamp-DpnyyyKB.js";
import { l as recordChannelMessageReplyDispatch } from "./channel-message-Do1b_D-M.js";
import { h as stringifyRouteThreadId } from "./channel-route-B9olp3tt.js";
import { t as deliverOutboundPayloads } from "./deliver-Dz9Dpt9U.js";
import {
  r as mergeDeliveryContext,
  t as deliveryContextFromSession,
} from "./delivery-context.shared-mj-12Z6_.js";
import {
  C as moveJsonDurableQueueEntryToFailed,
  E as writeJsonDurableQueueEntry,
  S as loadPendingJsonDurableQueueEntries,
  T as resolveJsonDurableQueueEntryPaths,
  b as jsonDurableQueueEntryExists,
  c as enqueueDelivery,
  s as ackDelivery,
  u as failDelivery,
  v as ackJsonDurableQueueEntry,
  w as readJsonDurableQueueEntry,
  x as loadJsonDurableQueueEntry,
  y as ensureJsonDurableQueueDirs,
} from "./delivery-queue-jB0MZzlm.js";
import "./plugins-Dn-pJrhh.js";
import { a as formatErrorMessage } from "./errors-DZMrVkYL.js";
import { o as requestHeartbeat } from "./heartbeat-wake-2F-mloyP.js";
import { t as finalizeInboundContext } from "./inbound-context-C2mdUiyz.js";
import { v as resolveStateDir } from "./paths-Cnwfh6dH.js";
import { t as dispatchReplyWithBufferedBlockDispatcher } from "./provider-dispatcher-BPV_KXNV.js";
import { a as normalizeChannelId, t as getChannelPlugin } from "./registry-D3zb3mnd.js";
import {
  c as resolveRestartSentinelPath,
  i as formatRestartSentinelMessage,
  l as summarizeRestartSentinel,
  n as finalizeUpdateRestartSentinelRunningVersion,
  o as readRestartSentinel,
  s as removeRestartSentinelFile,
} from "./restart-sentinel-CXl2NwhJ.js";
import { a as generateSecureUuid } from "./secure-random-Ck_jpq4r.js";
import { t as buildOutboundSessionContext } from "./session-context-FWAwbTTu.js";
import { t as recordInboundSession } from "./session-CUCa4TmV.js";
import { c as loadSessionEntry } from "./session-utils-Dhg586UW.js";
import { c as resolveMainSessionKeyFromConfig } from "./sessions-Bdy1wToU.js";
import { t as runStartupTasks } from "./startup-tasks-DOrSCK3I.js";
import { d as parseSessionThreadInfo } from "./store-load-BSFLPYqQ.js";
import { t as createSubsystemLogger } from "./subsystem-Bjz8a2fE.js";
import { a as enqueueSystemEvent } from "./system-events-CttxBeh2.js";
import { r as resolveOutboundTarget } from "./targets-BqvQ_FF9.js";
//#region src/infra/session-delivery-queue-storage.ts
const QUEUE_DIRNAME = "session-delivery-queue";
const FAILED_DIRNAME = "failed";
const TMP_SWEEP_MAX_AGE_MS = 5e3;
const QUEUE_TEMP_PREFIX = ".session-delivery-queue";
function buildEntryId(idempotencyKey) {
  if (!idempotencyKey) return generateSecureUuid();
  return createHash("sha256").update(idempotencyKey).digest("hex");
}
async function writeQueueEntry(filePath, entry) {
  await writeJsonDurableQueueEntry({
    filePath,
    entry,
    tempPrefix: QUEUE_TEMP_PREFIX,
  });
}
async function readQueueEntry(filePath) {
  return await readJsonDurableQueueEntry(filePath);
}
function resolveSessionDeliveryQueueDir(stateDir) {
  const base = stateDir ?? resolveStateDir();
  return path.join(base, QUEUE_DIRNAME);
}
function resolveFailedDir(stateDir) {
  return path.join(resolveSessionDeliveryQueueDir(stateDir), FAILED_DIRNAME);
}
function resolveQueueEntryPaths(id, stateDir) {
  return resolveJsonDurableQueueEntryPaths(resolveSessionDeliveryQueueDir(stateDir), id);
}
async function ensureSessionDeliveryQueueDir(stateDir) {
  const queueDir = resolveSessionDeliveryQueueDir(stateDir);
  await ensureJsonDurableQueueDirs({
    queueDir,
    failedDir: resolveFailedDir(stateDir),
  });
  return queueDir;
}
async function enqueueSessionDelivery(params, stateDir) {
  const queueDir = await ensureSessionDeliveryQueueDir(stateDir);
  const id = buildEntryId(params.idempotencyKey);
  const filePath = path.join(queueDir, `${id}.json`);
  if (params.idempotencyKey) {
    if (await jsonDurableQueueEntryExists(filePath)) return id;
  }
  await writeQueueEntry(filePath, {
    ...params,
    id,
    enqueuedAt: Date.now(),
    retryCount: 0,
  });
  return id;
}
async function ackSessionDelivery(id, stateDir) {
  await ackJsonDurableQueueEntry(resolveQueueEntryPaths(id, stateDir));
}
async function failSessionDelivery(id, error, stateDir) {
  const filePath = path.join(resolveSessionDeliveryQueueDir(stateDir), `${id}.json`);
  const entry = await readQueueEntry(filePath);
  entry.retryCount += 1;
  entry.lastAttemptAt = Date.now();
  entry.lastError = error;
  await writeQueueEntry(filePath, entry);
}
async function loadPendingSessionDelivery(id, stateDir) {
  return await loadJsonDurableQueueEntry({
    paths: resolveQueueEntryPaths(id, stateDir),
    tempPrefix: QUEUE_TEMP_PREFIX,
  });
}
async function loadPendingSessionDeliveries(stateDir) {
  return await loadPendingJsonDurableQueueEntries({
    queueDir: resolveSessionDeliveryQueueDir(stateDir),
    tempPrefix: QUEUE_TEMP_PREFIX,
    cleanupTmpMaxAgeMs: TMP_SWEEP_MAX_AGE_MS,
  });
}
async function moveSessionDeliveryToFailed(id, stateDir) {
  await moveJsonDurableQueueEntryToFailed({
    queueDir: resolveSessionDeliveryQueueDir(stateDir),
    failedDir: resolveFailedDir(stateDir),
    id,
  });
}
//#endregion
//#region src/infra/session-delivery-queue-recovery.ts
const MAX_SESSION_DELIVERY_RETRIES = 5;
const BACKOFF_MS = [5e3, 25e3, 12e4, 6e5];
const drainInProgress = /* @__PURE__ */ new Map();
const entriesInProgress = /* @__PURE__ */ new Set();
function getErrnoCode(err) {
  return err && typeof err === "object" && "code" in err ? String(err.code) : null;
}
function createEmptyRecoverySummary() {
  return {
    recovered: 0,
    failed: 0,
    skippedMaxRetries: 0,
    deferredBackoff: 0,
  };
}
function claimRecoveryEntry(entryId) {
  if (entriesInProgress.has(entryId)) return false;
  entriesInProgress.add(entryId);
  return true;
}
function releaseRecoveryEntry(entryId) {
  entriesInProgress.delete(entryId);
}
function computeSessionDeliveryBackoffMs(retryCount) {
  if (retryCount <= 0) return 0;
  return BACKOFF_MS[Math.min(retryCount - 1, BACKOFF_MS.length - 1)] ?? BACKOFF_MS.at(-1) ?? 0;
}
function isSessionDeliveryEligibleForRetry(entry, now) {
  const backoff = computeSessionDeliveryBackoffMs(entry.retryCount);
  if (backoff <= 0) return { eligible: true };
  if (entry.retryCount === 0 && entry.lastAttemptAt === void 0) return { eligible: true };
  const nextEligibleAt =
    (typeof entry.lastAttemptAt === "number" && entry.lastAttemptAt > 0
      ? entry.lastAttemptAt
      : entry.enqueuedAt) + backoff;
  if (now >= nextEligibleAt) return { eligible: true };
  return {
    eligible: false,
    remainingBackoffMs: nextEligibleAt - now,
  };
}
async function drainQueuedEntry(opts) {
  const { entry } = opts;
  try {
    await opts.deliver(entry);
    await ackSessionDelivery(entry.id, opts.stateDir);
    opts.onRecovered?.(entry);
    return "recovered";
  } catch (err) {
    const errMsg = formatErrorMessage(err);
    opts.onFailed?.(entry, errMsg);
    try {
      await failSessionDelivery(entry.id, errMsg, opts.stateDir);
      return "failed";
    } catch (failErr) {
      if (getErrnoCode(failErr) === "ENOENT") return "already-gone";
      return "failed";
    }
  }
}
async function drainPendingSessionDeliveries(opts) {
  if (drainInProgress.get(opts.drainKey)) {
    opts.log.info(`${opts.logLabel}: already in progress for ${opts.drainKey}, skipping`);
    return;
  }
  drainInProgress.set(opts.drainKey, true);
  try {
    const matchingEntries = (await loadPendingSessionDeliveries(opts.stateDir))
      .filter((entry) => opts.selectEntry(entry, Date.now()).match)
      .toSorted((a, b) => a.enqueuedAt - b.enqueuedAt);
    for (const entry of matchingEntries) {
      if (!claimRecoveryEntry(entry.id)) {
        opts.log.info(`${opts.logLabel}: entry ${entry.id} is already being recovered`);
        continue;
      }
      try {
        const currentEntry = await loadPendingSessionDelivery(entry.id, opts.stateDir);
        if (!currentEntry) continue;
        const currentDecision = opts.selectEntry(currentEntry, Date.now());
        if (!currentDecision.match) continue;
        if (currentEntry.retryCount >= MAX_SESSION_DELIVERY_RETRIES) {
          try {
            await moveSessionDeliveryToFailed(currentEntry.id, opts.stateDir);
          } catch (err) {
            if (getErrnoCode(err) !== "ENOENT") throw err;
          }
          opts.log.warn(
            `${opts.logLabel}: entry ${currentEntry.id} exceeded max retries and was moved to failed/`,
          );
          continue;
        }
        if (!currentDecision.bypassBackoff) {
          const retryEligibility = isSessionDeliveryEligibleForRetry(currentEntry, Date.now());
          if (!retryEligibility.eligible) {
            opts.log.info(
              `${opts.logLabel}: entry ${currentEntry.id} not ready for retry yet — backoff ${retryEligibility.remainingBackoffMs}ms remaining`,
            );
            continue;
          }
        }
        await drainQueuedEntry({
          entry: currentEntry,
          deliver: opts.deliver,
          stateDir: opts.stateDir,
          onFailed: (failedEntry, errMsg) => {
            opts.log.warn(`${opts.logLabel}: retry failed for entry ${failedEntry.id}: ${errMsg}`);
          },
        });
      } finally {
        releaseRecoveryEntry(entry.id);
      }
    }
  } finally {
    drainInProgress.delete(opts.drainKey);
  }
}
async function recoverPendingSessionDeliveries(opts) {
  const pending = (await loadPendingSessionDeliveries(opts.stateDir)).filter(
    (entry) => opts.maxEnqueuedAt == null || entry.enqueuedAt <= opts.maxEnqueuedAt,
  );
  if (pending.length === 0) return createEmptyRecoverySummary();
  pending.sort((a, b) => a.enqueuedAt - b.enqueuedAt);
  const summary = createEmptyRecoverySummary();
  const deadline = Date.now() + (opts.maxRecoveryMs ?? 6e4);
  for (const entry of pending) {
    if (Date.now() >= deadline) {
      opts.log.warn("Session delivery recovery time budget exceeded — remaining entries deferred");
      break;
    }
    if (!claimRecoveryEntry(entry.id)) continue;
    try {
      const currentEntry = await loadPendingSessionDelivery(entry.id, opts.stateDir);
      if (!currentEntry) continue;
      if (opts.maxEnqueuedAt != null && currentEntry.enqueuedAt > opts.maxEnqueuedAt) continue;
      if (currentEntry.retryCount >= MAX_SESSION_DELIVERY_RETRIES) {
        summary.skippedMaxRetries += 1;
        try {
          await moveSessionDeliveryToFailed(currentEntry.id, opts.stateDir);
        } catch (err) {
          if (getErrnoCode(err) !== "ENOENT") throw err;
        }
        continue;
      }
      if (!isSessionDeliveryEligibleForRetry(currentEntry, Date.now()).eligible) {
        summary.deferredBackoff += 1;
        continue;
      }
      if (
        (await drainQueuedEntry({
          entry: currentEntry,
          deliver: opts.deliver,
          stateDir: opts.stateDir,
          onRecovered: () => {
            summary.recovered += 1;
          },
          onFailed: (_failedEntry, errMsg) => {
            summary.failed += 1;
            opts.log.warn(`Session delivery retry failed: ${errMsg}`);
          },
        })) === "recovered"
      )
        opts.log.info(`Recovered session delivery ${currentEntry.id}`);
    } finally {
      releaseRecoveryEntry(entry.id);
    }
  }
  return summary;
}
//#endregion
//#region src/gateway/server-restart-sentinel.ts
const log = createSubsystemLogger("gateway/restart-sentinel");
const OUTBOUND_RETRY_DELAY_MS = 1e3;
const OUTBOUND_MAX_ATTEMPTS = 45;
let latestUpdateRestartSentinel = null;
function cloneRestartSentinelPayload(payload) {
  if (!payload) return null;
  return JSON.parse(JSON.stringify(payload));
}
function hasRoutableDeliveryContext(context) {
  return Boolean(context?.channel && context?.to);
}
function enqueueRestartSentinelWake(message, sessionKey, deliveryContext) {
  enqueueSystemEvent(message, {
    sessionKey,
    ...(deliveryContext ? { deliveryContext } : {}),
  });
  requestHeartbeat({
    source: "restart-sentinel",
    intent: "immediate",
    reason: "wake",
    sessionKey,
  });
}
async function waitForOutboundRetry(delayMs) {
  await new Promise((resolve) => {
    setTimeout(resolve, delayMs).unref?.();
  });
}
async function deliverRestartSentinelNotice(params) {
  const payloads = [{ text: params.message }];
  const queueId = await enqueueDelivery({
    channel: params.channel,
    to: params.to,
    accountId: params.accountId,
    replyToId: params.replyToId,
    threadId: params.threadId,
    payloads,
    bestEffort: false,
  }).catch(() => null);
  for (let attempt = 1; attempt <= OUTBOUND_MAX_ATTEMPTS; attempt += 1)
    try {
      if (
        (
          await deliverOutboundPayloads({
            cfg: params.cfg,
            channel: params.channel,
            to: params.to,
            accountId: params.accountId,
            replyToId: params.replyToId,
            threadId: params.threadId,
            payloads,
            session: params.session,
            deps: params.deps,
            bestEffort: false,
            skipQueue: true,
          })
        ).length > 0
      ) {
        if (queueId) await ackDelivery(queueId).catch(() => {});
        return;
      }
      throw new Error("outbound delivery returned no results");
    } catch (err) {
      const retrying = attempt < OUTBOUND_MAX_ATTEMPTS;
      const suffix = retrying ? `; retrying in ${OUTBOUND_RETRY_DELAY_MS}ms` : "";
      log.warn(`${params.summary}: outbound delivery failed${suffix}: ${String(err)}`, {
        channel: params.channel,
        to: params.to,
        sessionKey: params.sessionKey,
        attempt,
        maxAttempts: OUTBOUND_MAX_ATTEMPTS,
      });
      if (!retrying) {
        if (queueId) await failDelivery(queueId, formatErrorMessage(err)).catch(() => void 0);
        return;
      }
      await waitForOutboundRetry(OUTBOUND_RETRY_DELAY_MS);
    }
}
function buildRestartContinuationMessageId(params) {
  return `restart-sentinel:${params.sessionKey}:${params.kind}:${params.ts}`;
}
function resolveRestartContinuationRoute(params) {
  if (!params.channel || !params.to) return;
  return {
    channel: params.channel,
    to: params.to,
    ...(params.accountId ? { accountId: params.accountId } : {}),
    ...(params.replyToId ? { replyToId: params.replyToId } : {}),
    ...(params.threadId ? { threadId: params.threadId } : {}),
    chatType: params.chatType,
  };
}
function resolveRestartContinuationOutboundPayload(params) {
  if (params.payload.replyToId !== params.messageId) return params.payload;
  const payload = { ...params.payload };
  delete payload.replyToId;
  return params.replyToId
    ? {
        ...payload,
        replyToId: params.replyToId,
      }
    : payload;
}
function resolveQueuedSessionDeliveryContext(entry) {
  if (entry.kind === "agentTurn" && entry.route)
    return {
      channel: entry.route.channel,
      to: entry.route.to,
      ...(entry.route.accountId ? { accountId: entry.route.accountId } : {}),
      ...(entry.route.threadId ? { threadId: entry.route.threadId } : {}),
    };
  return entry.deliveryContext;
}
async function deliverQueuedSessionDelivery(params) {
  const { cfg, storePath, canonicalKey } = loadSessionEntry(params.entry.sessionKey);
  const queuedDeliveryContext = resolveQueuedSessionDeliveryContext(params.entry);
  if (params.entry.kind === "systemEvent") {
    enqueueSystemEvent(params.entry.text, {
      sessionKey: canonicalKey,
      ...(queuedDeliveryContext ? { deliveryContext: { ...queuedDeliveryContext } } : {}),
    });
    requestHeartbeat({
      source: "restart-sentinel",
      intent: "immediate",
      reason: "wake",
      sessionKey: canonicalKey,
    });
    return;
  }
  if (!params.entry.route) {
    enqueueSystemEvent(params.entry.message, {
      sessionKey: canonicalKey,
      ...(queuedDeliveryContext ? { deliveryContext: { ...queuedDeliveryContext } } : {}),
    });
    requestHeartbeat({
      source: "restart-sentinel",
      intent: "immediate",
      reason: "wake",
      sessionKey: canonicalKey,
    });
    return;
  }
  const route = params.entry.route;
  const messageId = params.entry.messageId;
  const userMessage = params.entry.message.trim();
  const agentId = resolveSessionAgentId({
    sessionKey: canonicalKey,
    config: cfg,
  });
  let dispatchError;
  await recordChannelMessageReplyDispatch({
    cfg,
    channel: route.channel,
    accountId: route.accountId,
    agentId,
    routeSessionKey: canonicalKey,
    storePath,
    ctxPayload: finalizeInboundContext(
      {
        Body: userMessage,
        BodyForAgent: injectTimestamp(userMessage, timestampOptsFromConfig(cfg)),
        BodyForCommands: "",
        RawBody: userMessage,
        CommandBody: "",
        SessionKey: canonicalKey,
        AccountId: route.accountId,
        MessageSid: messageId,
        Timestamp: Date.now(),
        Provider: route.channel,
        Surface: route.channel,
        ChatType: route.chatType,
        CommandAuthorized: false,
        ReplyToId: route.replyToId,
        OriginatingChannel: route.channel,
        OriginatingTo: route.to,
        ExplicitDeliverRoute: true,
        MessageThreadId: route.threadId,
      },
      {
        forceBodyForCommands: true,
        forceChatType: true,
      },
    ),
    recordInboundSession,
    dispatchReplyWithBufferedBlockDispatcher,
    deliver: async (payload) => {
      const outboundPayload = resolveRestartContinuationOutboundPayload({
        payload,
        messageId,
        replyToId: route.replyToId,
      });
      if (
        (
          await deliverOutboundPayloads({
            cfg,
            channel: route.channel,
            to: route.to,
            accountId: route.accountId,
            replyToId: route.replyToId,
            threadId: route.threadId,
            payloads: [outboundPayload],
            session: buildOutboundSessionContext({
              cfg,
              sessionKey: canonicalKey,
            }),
            deps: params.deps,
            bestEffort: false,
          })
        ).length === 0
      )
        throw new Error("restart continuation delivery returned no results");
    },
    onRecordError: (err) => {
      log.warn(`restart continuation failed to record inbound session metadata: ${String(err)}`, {
        sessionKey: canonicalKey,
      });
    },
    onDispatchError: (err) => {
      dispatchError ??= err;
    },
  });
  if (dispatchError) throw dispatchError;
}
function buildQueuedRestartContinuation(params) {
  const idempotencyKey = buildRestartContinuationMessageId({
    sessionKey: params.sessionKey,
    kind: params.continuation.kind,
    ts: params.ts,
  });
  if (params.continuation.kind === "systemEvent")
    return {
      kind: "systemEvent",
      sessionKey: params.sessionKey,
      text: params.continuation.text,
      ...(params.deliveryContext ? { deliveryContext: params.deliveryContext } : {}),
      idempotencyKey,
    };
  return {
    kind: "agentTurn",
    sessionKey: params.sessionKey,
    message: params.continuation.message,
    messageId: idempotencyKey,
    ...(params.route ? { route: params.route } : {}),
    ...(params.deliveryContext ? { deliveryContext: params.deliveryContext } : {}),
    idempotencyKey,
  };
}
async function drainRestartContinuationQueue(params) {
  await drainPendingSessionDeliveries({
    drainKey: `restart-continuation:${params.entryId}`,
    logLabel: "restart continuation",
    log: params.log,
    deliver: (entry) =>
      deliverQueuedSessionDelivery({
        deps: params.deps,
        entry,
      }),
    selectEntry: (entry) => ({
      match: entry.id === params.entryId,
      bypassBackoff: true,
    }),
  });
}
async function recoverPendingRestartContinuationDeliveries(params) {
  await recoverPendingSessionDeliveries({
    deliver: (entry) =>
      deliverQueuedSessionDelivery({
        deps: params.deps,
        entry,
      }),
    log: params.log ?? log,
    maxEnqueuedAt: params.maxEnqueuedAt,
  });
}
async function loadRestartSentinelStartupTask(params) {
  const sentinel = await readRestartSentinel();
  if (!sentinel) return null;
  const sentinelPath = resolveRestartSentinelPath();
  const payload = sentinel.payload;
  const sessionKey = payload.sessionKey?.trim();
  const message = formatRestartSentinelMessage(payload);
  const summary = summarizeRestartSentinel(payload);
  const wakeDeliveryContext = mergeDeliveryContext(
    payload.threadId != null
      ? {
          ...payload.deliveryContext,
          threadId: payload.threadId,
        }
      : payload.deliveryContext,
    void 0,
  );
  const run = async () => {
    if (!sessionKey) {
      const mainSessionKey = resolveMainSessionKeyFromConfig();
      enqueueSystemEvent(message, { sessionKey: mainSessionKey });
      if (payload.continuation)
        log.warn(`${summary}: continuation skipped: restart sentinel sessionKey unavailable`, {
          sessionKey: mainSessionKey,
          continuationKind: payload.continuation.kind,
        });
      await removeRestartSentinelFile(sentinelPath);
      return { status: "ran" };
    }
    const { baseSessionKey, threadId: sessionThreadId } = parseSessionThreadInfo(sessionKey);
    const { cfg, entry, canonicalKey } = loadSessionEntry(sessionKey);
    const sentinelContext = payload.deliveryContext;
    let sessionDeliveryContext = deliveryContextFromSession(entry);
    let chatType = entry?.origin?.chatType ?? "direct";
    if (
      !hasRoutableDeliveryContext(sessionDeliveryContext) &&
      baseSessionKey &&
      baseSessionKey !== sessionKey
    ) {
      const { entry: baseEntry } = loadSessionEntry(baseSessionKey);
      chatType = entry?.origin?.chatType ?? baseEntry?.origin?.chatType ?? "direct";
      sessionDeliveryContext = mergeDeliveryContext(
        sessionDeliveryContext,
        deliveryContextFromSession(baseEntry),
      );
    }
    const origin = mergeDeliveryContext(sentinelContext, sessionDeliveryContext);
    const channelRaw = origin?.channel;
    const channel = channelRaw ? normalizeChannelId(channelRaw) : null;
    const to = origin?.to;
    const threadId =
      payload.threadId ??
      sessionThreadId ??
      (origin?.threadId != null ? stringifyRouteThreadId(origin.threadId) : void 0);
    let resolvedTo;
    let replyToId;
    let resolvedThreadId = threadId;
    let continuationQueueId;
    if (channel && to) {
      const resolved = resolveOutboundTarget({
        channel,
        to,
        cfg,
        accountId: origin?.accountId,
        mode: "implicit",
      });
      if (resolved.ok) {
        resolvedTo = resolved.to;
        const replyTransport =
          getChannelPlugin(channel)?.threading?.resolveReplyTransport?.({
            cfg,
            accountId: origin?.accountId,
            threadId,
          }) ?? null;
        replyToId = replyTransport?.replyToId ?? void 0;
        resolvedThreadId =
          replyTransport && Object.hasOwn(replyTransport, "threadId")
            ? replyTransport.threadId != null
              ? stringifyRouteThreadId(replyTransport.threadId)
              : void 0
            : threadId;
      }
    }
    if (payload.continuation)
      continuationQueueId = await enqueueSessionDelivery(
        buildQueuedRestartContinuation({
          sessionKey: canonicalKey,
          continuation: payload.continuation,
          ts: payload.ts,
          route: resolveRestartContinuationRoute({
            channel: channel ?? void 0,
            to: resolvedTo,
            accountId: origin?.accountId,
            replyToId,
            threadId: resolvedThreadId,
            chatType,
          }),
          deliveryContext:
            resolvedTo && channel
              ? {
                  channel,
                  to: resolvedTo,
                  ...(origin?.accountId ? { accountId: origin.accountId } : {}),
                  ...(resolvedThreadId ? { threadId: resolvedThreadId } : {}),
                }
              : wakeDeliveryContext,
        }),
      );
    await removeRestartSentinelFile(sentinelPath);
    enqueueRestartSentinelWake(message, sessionKey, wakeDeliveryContext);
    if (resolvedTo && channel) {
      const outboundSession = buildOutboundSessionContext({
        cfg,
        sessionKey: canonicalKey,
      });
      await deliverRestartSentinelNotice({
        deps: params.deps,
        cfg,
        sessionKey: canonicalKey,
        summary,
        message,
        channel,
        to: resolvedTo,
        accountId: origin?.accountId,
        replyToId,
        threadId: resolvedThreadId,
        session: outboundSession,
      });
    }
    if (continuationQueueId)
      await drainRestartContinuationQueue({
        deps: params.deps,
        entryId: continuationQueueId,
        log,
      });
    return { status: "ran" };
  };
  return {
    source: "restart-sentinel",
    ...(sessionKey ? { sessionKey } : {}),
    run,
  };
}
async function scheduleRestartSentinelWake(params) {
  const task = await loadRestartSentinelStartupTask(params);
  if (!task) return;
  await runStartupTasks({
    tasks: [task],
    log,
  });
}
async function refreshLatestUpdateRestartSentinel() {
  const sentinel =
    (await finalizeUpdateRestartSentinelRunningVersion()) ?? (await readRestartSentinel());
  if (sentinel?.payload.kind === "update")
    latestUpdateRestartSentinel = cloneRestartSentinelPayload(sentinel.payload);
  return cloneRestartSentinelPayload(latestUpdateRestartSentinel);
}
function getLatestUpdateRestartSentinel() {
  return cloneRestartSentinelPayload(latestUpdateRestartSentinel);
}
function recordLatestUpdateRestartSentinel(payload) {
  latestUpdateRestartSentinel = cloneRestartSentinelPayload(payload);
}
//#endregion
export {
  scheduleRestartSentinelWake as a,
  refreshLatestUpdateRestartSentinel as i,
  recordLatestUpdateRestartSentinel as n,
  recoverPendingRestartContinuationDeliveries as r,
  getLatestUpdateRestartSentinel as t,
};
