/**
 * Slack missed-event reconciler — source port of fork dist-patches 007/011/016.
 *
 * WHY A SOURCE PORT: the dist patches targeted a build-hashed bundle filename;
 * a rebuild changed the hash and the appliers have been silently skipping ever
 * since (no `[slack:reconcile]` boot line in any 2026-07-02 journal). Source
 * survives rebuilds by construction.
 *
 * WHY IT EXISTS AT ALL: Slack Socket Mode does NOT replay events lost during
 * disconnects — and has been observed dropping events with no disconnect at
 * all (2026-05-07; again 2026-07-02 ~08:45 for a thread reply). So on every
 * (re)connect and on a periodic sweep we fetch recent history for allowlisted
 * channels and replay missed bot mentions through the normal pipeline.
 *
 * NEW vs the dist patches: THREAD coverage. conversations.history never
 * returns thread replies, so a mention inside a thread was invisible to every
 * prior sweep. Parents with recent reply activity get a bounded
 * conversations.replies scan.
 *
 * Dedup is structural: handleSlackMessage short-circuits already-seen
 * (channel, ts) pairs, so replaying a delivered message is a no-op.
 *
 * PATCH-022B pending-work suppression (2026-07-07 duplicate-subagent
 * incident): a mention is NOT "unresponded" just because no bot reply is
 * visible yet — a registered subagent run or in-flight turn may still be
 * working it, and handleSlackMessage's per-event dedup does not survive a
 * gateway restart (the observed dup class: restart → patch-021 resumes the
 * run AND the reconciler replays its mention → second subagent). Before
 * replaying, consult a pending-work probe (injectable; defaults to the
 * gateway-registered globalThis[Symbol.for("prest0n.pendingThreadWork")] —
 * registration contract in this patch's README) plus the thread's visible
 * bot replies. Pending mentions are DEFERRED and re-checked each sweep;
 * they replay only once the run has terminated with still no visible
 * reply. A wedged deferral expires loudly after maxDeferMs (default 30
 * min) and is DROPPED, never double-spawned.
 *
 * PATCH-022C busy-ack (2026-07-14 thread-busy-silence incident): a 022B
 * deferral was silent by design toward Slack — users pinging a thread whose
 * registered run was still working saw NOTHING until the run terminated and
 * their mentions replayed (2026-07-14 ~00:00Z: ~4 min of apparent deafness
 * while mission-fintech-to-financial ran to completion; users re-pinged and
 * concluded the bot was down). On the FIRST deferral in a thread, post one
 * short in-thread ack so humans know the mention was seen and queued.
 * Acks are rate-limited per thread and carry an invisible marker
 * (BUSY_ACK_MARKER) that the visible-bot-reply check IGNORES — a busy-ack
 * must never count as the reply that cancels the deferred replay it is
 * announcing.
 *
 * Config: env only — the old `channels.slack.reconcile*` keys are
 * schema-rejected and stripped by the boot config-fix.
 * `PREST0N_SLACK_RECONCILE_MS` overrides the sweep period
 * (default 120000ms; "0" disables the periodic sweep; floor 15000ms).
 * `PREST0N_SLACK_BUSY_ACK_MS` overrides the per-thread busy-ack minimum
 * interval (default 240000ms; "0" disables busy-acks; floor 60000ms).
 */
import type { SlackMessageHandler } from "./message-handler.js";

const DEFAULT_PERIOD_MS = 120_000;
const MIN_PERIOD_MS = 15_000;
const LOOKBACK_SEC = 600;
const MAX_THREAD_SCANS_PER_CHANNEL = 8;
const HISTORY_LIMIT = 50;
const DEFAULT_MAX_DEFER_MS = 30 * 60_000;
const DEFAULT_BUSY_ACK_MS = 240_000;
const MIN_BUSY_ACK_MS = 60_000;
const BUSY_ACK_MAP_PRUNE_SIZE = 512;
const BUSY_ACK_MAP_PRUNE_AGE_MS = 3_600_000;

/**
 * PATCH-022C: invisible marker appended to every busy-ack. The
 * visible-bot-reply check ignores messages carrying it, so an ack can never
 * be mistaken for the actual reply and silently cancel a deferred replay.
 * (ZWSP + INVISIBLE SEPARATOR + ZWSP — survives Slack round-trips, never
 * produced by agent-authored replies.)
 */
export const BUSY_ACK_MARKER = "\u200b\u2063\u200b";

/** PATCH-022C: the one message a deferral is allowed to say out loud. */
export const BUSY_ACK_TEXT =
  "⏳ Still working on this thread's background task — your message is queued and I'll reply as soon as it wraps up." +
  BUSY_ACK_MARKER;

/**
 * PATCH-022B: well-known global slot where the gateway core registers the
 * pending-thread-work probe (see README for the registration contract).
 */
export const PENDING_WORK_PROBE_SYMBOL = Symbol.for("prest0n.pendingThreadWork");

/**
 * PATCH-022B: returns true while a registered subagent run or in-flight turn
 * exists for the given channel/thread — i.e. the mention is being worked and
 * must NOT be replayed yet.
 */
export type PendingThreadWorkProbe = (q: {
  channel: string;
  threadTs?: string;
  ts: string;
}) => boolean;

type ReconcileRuntime = {
  log?: (msg: string) => void;
  error?: (msg: string) => void;
};

type SlackHistoryMessage = {
  ts?: string;
  text?: string;
  user?: string;
  reply_count?: number;
  latest_reply?: string;
  thread_ts?: string;
} & Record<string, unknown>;

type SlackConversationsClient = {
  conversations: {
    history: (args: {
      channel: string;
      oldest: string;
      limit: number;
    }) => Promise<{ messages?: SlackHistoryMessage[] } | undefined>;
    replies: (args: {
      channel: string;
      ts: string;
      oldest: string;
      limit: number;
    }) => Promise<{ messages?: SlackHistoryMessage[] } | undefined>;
  };
  /** PATCH-022C: optional — a client without chat simply never busy-acks. */
  chat?: {
    postMessage: (args: { channel: string; thread_ts?: string; text: string }) => Promise<unknown>;
  };
};

/** Exported for tests. "0" disables; blank/invalid -> default; floor 15s. */
export function resolveReconcilePeriodMs(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_PERIOD_MS;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return DEFAULT_PERIOD_MS;
  }
  if (n === 0) {
    return null;
  }
  return Math.max(MIN_PERIOD_MS, Math.floor(n));
}

/** PATCH-022C. Exported for tests. "0" disables; blank/invalid -> default; floor 60s. */
export function resolveBusyAckMs(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_BUSY_ACK_MS;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return DEFAULT_BUSY_ACK_MS;
  }
  if (n === 0) {
    return null;
  }
  return Math.max(MIN_BUSY_ACK_MS, Math.floor(n));
}

export function createSlackReconciler(params: {
  client: SlackConversationsClient;
  runtime: ReconcileRuntime;
  handleSlackMessage: SlackMessageHandler;
  getBotUserId: () => string;
  getChannelIds: () => string[];
  periodMs: number | null;
  /** PATCH-022B: overrides the globalThis probe (tests / explicit wiring). */
  isThreadWorkPending?: PendingThreadWorkProbe;
  /** PATCH-022B: max suppression age before a wedged deferral is dropped. */
  maxDeferMs?: number;
  /** PATCH-022C: per-thread busy-ack min interval; null disables; undefined = default. */
  busyAckMs?: number | null;
}) {
  const { client, runtime, handleSlackMessage, getBotUserId, getChannelIds } = params;
  const lastTsByChannel = new Map<string, string>();
  let sweepInFlight = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  // ── PATCH-022B pending-work suppression state ──
  const maxDeferMs = params.maxDeferMs ?? DEFAULT_MAX_DEFER_MS;
  const pendingProbe: PendingThreadWorkProbe = (q) => {
    try {
      if (params.isThreadWorkPending) {
        return Boolean(params.isThreadWorkPending(q));
      }
      const probe = (globalThis as Record<PropertyKey, unknown>)[PENDING_WORK_PROBE_SYMBOL];
      return typeof probe === "function" ? Boolean((probe as PendingThreadWorkProbe)(q)) : false;
    } catch {
      return false; // a broken probe must never mute the reconciler forever
    }
  };
  const deferred = new Map<
    string,
    {
      m: SlackHistoryMessage;
      channelId: string;
      threadTs?: string;
      firstDeferredAtMs: number;
    }
  >();
  // ── PATCH-022C busy-ack state ──
  const busyAckMs = params.busyAckMs === undefined ? DEFAULT_BUSY_ACK_MS : params.busyAckMs;
  const busyAckAtByThread = new Map<string, number>();
  /**
   * PATCH-022C: a busy-ack is bookkeeping, not an answer — it must never
   * satisfy the visible-bot-reply check, or the ack would cancel the very
   * replay it announces.
   */
  const isBusyAck = (r: SlackHistoryMessage): boolean =>
    typeof r?.text === "string" && r.text.includes(BUSY_ACK_MARKER);
  const botRepliedAfter = (
    mentionTs: string,
    msgs: SlackHistoryMessage[] | undefined,
    botUserId: string,
  ): boolean =>
    Array.isArray(msgs) &&
    msgs.some(
      (r) =>
        Boolean(r?.ts) && r.user === botUserId && String(r.ts) > String(mentionTs) && !isBusyAck(r),
    );

  /**
   * PATCH-022C: one short in-thread ack when a mention is deferred behind a
   * registered run — a silent deferral reads as a dead bot (2026-07-14).
   * Rate-limited per thread; posting failures are contained and retried by
   * the next deferral in that thread; never affects replay bookkeeping.
   */
  const maybePostBusyAck = async (
    channelId: string,
    threadTs: string | undefined,
    mentionTs: string,
  ): Promise<void> => {
    if (busyAckMs === null) {
      return;
    }
    const chat = client.chat;
    if (!chat || typeof chat.postMessage !== "function") {
      return;
    }
    const anchor = threadTs ?? mentionTs;
    const threadKey = `${channelId}:${anchor}`;
    const now = Date.now();
    const last = busyAckAtByThread.get(threadKey);
    if (last !== undefined && now - last < busyAckMs) {
      return;
    }
    if (busyAckAtByThread.size > BUSY_ACK_MAP_PRUNE_SIZE) {
      for (const [k, at] of busyAckAtByThread) {
        if (now - at > BUSY_ACK_MAP_PRUNE_AGE_MS) {
          busyAckAtByThread.delete(k);
        }
      }
    }
    // Stamp before the await: several deferrals in one sweep = one ack.
    busyAckAtByThread.set(threadKey, now);
    try {
      await chat.postMessage({ channel: channelId, thread_ts: anchor, text: BUSY_ACK_TEXT });
      runtime.log?.(
        `[slack:reconcile] busy-ack posted channel=${channelId} thread=${anchor} (PATCH-022C)`,
      );
    } catch (err) {
      busyAckAtByThread.delete(threadKey); // let the next deferral in this thread retry
      runtime.error?.(
        `[slack:reconcile] busy-ack post FAILED channel=${channelId} thread=${anchor}: ${String(err)} (PATCH-022C)`,
      );
    }
  };

  const replayMention = async (
    m: SlackHistoryMessage,
    channelId: string,
    threadTs: string | undefined,
  ): Promise<boolean> => {
    const synth = {
      ...m,
      type: "message",
      channel: channelId,
      event_ts: m.ts,
      ...(threadTs ? { thread_ts: m.thread_ts ?? threadTs } : {}),
    };
    try {
      await handleSlackMessage(synth as Parameters<SlackMessageHandler>[0], {
        source: "app_mention",
        wasMentioned: true,
      });
      runtime.log?.(
        `[slack:reconcile] replayed ${threadTs ? "THREAD " : ""}mention channel=${channelId}${threadTs ? ` thread=${threadTs}` : ""} ts=${m.ts}`,
      );
      return true;
    } catch (err) {
      runtime.error?.(
        `[slack:reconcile] dispatch failed channel=${channelId} ts=${m.ts}: ${String(err)}`,
      );
      return false;
    }
  };

  /**
   * PATCH-022B replay gate. responded (visible bot reply after the mention) →
   * drop; pending work registered for the thread → defer (re-checked each
   * sweep); otherwise replay now. Returns true iff a replay was dispatched.
   * PATCH-022C: the first deferral in a thread posts a rate-limited busy-ack.
   */
  const maybeReplayMention = async (
    m: SlackHistoryMessage,
    channelId: string,
    threadTs: string | undefined,
    threadMsgs: SlackHistoryMessage[] | undefined,
    botUserId: string,
  ): Promise<boolean> => {
    const key = `${channelId}:${m.ts}`;
    if (botRepliedAfter(String(m.ts), threadMsgs, botUserId)) {
      deferred.delete(key);
      return false;
    }
    if (pendingProbe({ channel: channelId, threadTs, ts: String(m.ts) })) {
      if (!deferred.has(key)) {
        deferred.set(key, { m, channelId, threadTs, firstDeferredAtMs: Date.now() });
        runtime.log?.(
          `[slack:reconcile] deferring replay channel=${channelId} ts=${m.ts}: pending work registered for this thread (PATCH-022B)`,
        );
        // PATCH-022C: tell the humans — a silent deferral reads as a dead bot.
        await maybePostBusyAck(channelId, threadTs, String(m.ts));
      }
      return false;
    }
    deferred.delete(key);
    return replayMention(m, channelId, threadTs);
  };

  /**
   * PATCH-022B: re-evaluate deferred mentions — replay only once the pending
   * run has terminated AND the thread still shows no bot reply. Wedged
   * deferrals (probe never clears) expire loudly and are dropped: the run
   * registry says the work exists, and a duplicate subagent is exactly the
   * incident this suppression prevents.
   */
  const processDeferred = async (botUserId: string): Promise<number> => {
    let replayed = 0;
    for (const [key, d] of Array.from(deferred.entries())) {
      try {
        if (Date.now() - d.firstDeferredAtMs >= maxDeferMs) {
          deferred.delete(key);
          runtime.error?.(
            `[slack:reconcile] deferred mention EXPIRED after ${maxDeferMs}ms channel=${d.channelId} ts=${d.m.ts} — dropped, not replayed (pending-work probe never cleared; PATCH-022B)`,
          );
          continue;
        }
        if (pendingProbe({ channel: d.channelId, threadTs: d.threadTs, ts: String(d.m.ts) })) {
          continue; // still being worked — keep suppressing
        }
        const parentTs = d.threadTs ?? String(d.m.ts);
        let threadMsgs: SlackHistoryMessage[] | undefined;
        try {
          const rp = await client.conversations.replies({
            channel: d.channelId,
            ts: parentTs,
            oldest: String(Math.floor(d.firstDeferredAtMs / 1000) - LOOKBACK_SEC),
            limit: HISTORY_LIMIT,
          });
          threadMsgs = Array.isArray(rp?.messages) ? rp.messages : undefined;
        } catch {
          threadMsgs = undefined; // fetch failure → decide on the probe alone
        }
        deferred.delete(key);
        if (botRepliedAfter(String(d.m.ts), threadMsgs, botUserId)) {
          runtime.log?.(
            `[slack:reconcile] deferred mention resolved by visible bot reply channel=${d.channelId} ts=${d.m.ts} (PATCH-022B)`,
          );
          continue;
        }
        if (await replayMention(d.m, d.channelId, d.threadTs)) {
          replayed += 1;
        }
      } catch (err) {
        runtime.error?.(`[slack:reconcile] deferred re-check failed key=${key}: ${String(err)}`);
      }
    }
    return replayed;
  };

  const runSlackReconcile = async (reason: string): Promise<{ replayed: number }> => {
    if (sweepInFlight) {
      return { replayed: 0 };
    }
    sweepInFlight = true;
    let replayed = 0;
    try {
      const botUserId = getBotUserId();
      const mentionToken = botUserId ? `<@${botUserId}>` : "";
      const channels = getChannelIds();
      if (!mentionToken || channels.length === 0) {
        return { replayed };
      }
      replayed += await processDeferred(botUserId);
      const floorSec = Math.floor(Date.now() / 1000) - LOOKBACK_SEC;
      for (const channelId of channels) {
        try {
          const lastTs = lastTsByChannel.get(channelId);
          const oldest = lastTs && Number(lastTs) > floorSec ? lastTs : String(floorSec);
          const resp = await client.conversations.history({
            channel: channelId,
            oldest,
            limit: HISTORY_LIMIT,
          });
          const msgs = Array.isArray(resp?.messages) ? resp.messages : [];
          let maxTs = lastTs ?? "";
          let threadScans = 0;
          for (const m of msgs) {
            if (!m?.ts) {
              continue;
            }
            if (String(m.ts) > maxTs) {
              maxTs = String(m.ts);
            }
            const text = typeof m.text === "string" ? m.text : "";
            const isOwn = Boolean(m.user && m.user === botUserId);
            if (
              !isOwn &&
              text.includes(mentionToken) &&
              (!lastTs || String(m.ts) > String(lastTs))
            ) {
              if (await maybeReplayMention(m, channelId, undefined, undefined, botUserId)) {
                replayed += 1;
              }
            }
            // Thread coverage: history never returns replies; scan parents
            // whose latest reply falls inside our window.
            const replyCount = Number(m.reply_count ?? 0);
            const latestReply = typeof m.latest_reply === "string" ? m.latest_reply : "";
            if (
              replyCount > 0 &&
              latestReply &&
              Number(latestReply) > Number(oldest) &&
              threadScans < MAX_THREAD_SCANS_PER_CHANNEL
            ) {
              threadScans += 1;
              try {
                const rp = await client.conversations.replies({
                  channel: channelId,
                  ts: String(m.ts),
                  oldest,
                  limit: HISTORY_LIMIT,
                });
                for (const r of Array.isArray(rp?.messages) ? rp.messages : []) {
                  if (!r?.ts || r.ts === m.ts) {
                    continue;
                  }
                  if (String(r.ts) > maxTs) {
                    maxTs = String(r.ts);
                  }
                  const rText = typeof r.text === "string" ? r.text : "";
                  if (r.user && r.user === botUserId) {
                    continue;
                  }
                  if (!rText.includes(mentionToken)) {
                    continue;
                  }
                  if (lastTs && String(r.ts) <= String(lastTs)) {
                    continue;
                  }
                  if (
                    await maybeReplayMention(r, channelId, String(m.ts), rp?.messages, botUserId)
                  ) {
                    replayed += 1;
                  }
                }
              } catch (err) {
                runtime.error?.(
                  `[slack:reconcile] replies fetch failed channel=${channelId} thread=${m.ts}: ${String(err)}`,
                );
              }
            }
          }
          if (maxTs) {
            lastTsByChannel.set(channelId, maxTs);
          }
          if (replayed > 0) {
            runtime.log?.(
              `[slack:reconcile] channel=${channelId} replayed=${replayed} reason=${reason}`,
            );
          }
        } catch (err) {
          runtime.error?.(
            `[slack:reconcile] history fetch failed channel=${channelId}: ${String(err)}`,
          );
        }
      }
    } catch (err) {
      runtime.error?.(`[slack:reconcile] sweep failed: ${String(err)}`);
    } finally {
      sweepInFlight = false;
    }
    return { replayed };
  };

  /** Fire-and-forget — used from the socket onStarted hook. */
  const scheduleReconcile = (reason: string): void => {
    void runSlackReconcile(reason).catch(() => {});
  };

  const start = (abortSignal?: AbortSignal): void => {
    if (params.periodMs === null || timer) {
      if (params.periodMs === null) {
        runtime.log?.("[slack:reconcile] periodic sweep disabled (PREST0N_SLACK_RECONCILE_MS=0)");
      }
      return;
    }
    timer = setInterval(() => scheduleReconcile("periodic"), params.periodMs);
    timer.unref?.();
    abortSignal?.addEventListener("abort", () => stop(), { once: true });
    runtime.log?.(`[slack:reconcile] periodic sweep enabled interval=${params.periodMs}ms`);
  };

  const stop = (): void => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  return { runSlackReconcile, scheduleReconcile, start, stop };
}
