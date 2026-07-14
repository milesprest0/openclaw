import { describe, expect, it, vi } from "vitest";
import {
  BUSY_ACK_MARKER,
  BUSY_ACK_TEXT,
  createSlackReconciler,
  resolveBusyAckMs,
  resolveReconcilePeriodMs,
} from "./reconcile.js";

const BOT = "U0AKLRW2NHH";
const NOW_SEC = Math.floor(Date.now() / 1000);
const ts = (secAgo: number, frac = "000100") => `${NOW_SEC - secAgo}.${frac}`;

function makeReconciler(overrides: {
  history?: unknown[];
  replies?: Record<string, unknown[]>;
  periodMs?: number | null;
  pending?: () => boolean;
  maxDeferMs?: number;
  busyAckMs?: number | null;
  postMessage?: ReturnType<typeof vi.fn>;
}) {
  const handler = vi.fn().mockResolvedValue(undefined);
  const postMessage = overrides.postMessage ?? vi.fn().mockResolvedValue({ ok: true });
  const client = {
    conversations: {
      history: vi.fn().mockResolvedValue({ messages: overrides.history ?? [] }),
      replies: vi.fn(async (args: { ts: string }) => ({
        messages: overrides.replies?.[args.ts] ?? [],
      })),
    },
    chat: { postMessage },
  };
  const reconciler = createSlackReconciler({
    client: client as never,
    runtime: { log: vi.fn(), error: vi.fn() },
    handleSlackMessage: handler as never,
    getBotUserId: () => BOT,
    getChannelIds: () => ["C0TEAMCENTER"],
    periodMs: overrides.periodMs ?? null,
    isThreadWorkPending: overrides.pending,
    maxDeferMs: overrides.maxDeferMs,
    busyAckMs: overrides.busyAckMs,
  });
  return { reconciler, handler, client, postMessage };
}

describe("resolveReconcilePeriodMs", () => {
  it("defaults to 120s when unset/blank/garbage", () => {
    expect(resolveReconcilePeriodMs(undefined)).toBe(120_000);
    expect(resolveReconcilePeriodMs("")).toBe(120_000);
    expect(resolveReconcilePeriodMs("nope")).toBe(120_000);
  });
  it("0 disables; small values clamp to the 15s floor", () => {
    expect(resolveReconcilePeriodMs("0")).toBeNull();
    expect(resolveReconcilePeriodMs("1000")).toBe(15_000);
    expect(resolveReconcilePeriodMs("300000")).toBe(300_000);
  });
});

describe("resolveBusyAckMs (PATCH-022C)", () => {
  it("defaults to 240s when unset/blank/garbage", () => {
    expect(resolveBusyAckMs(undefined)).toBe(240_000);
    expect(resolveBusyAckMs("")).toBe(240_000);
    expect(resolveBusyAckMs("nope")).toBe(240_000);
  });
  it("0 disables; small values clamp to the 60s floor", () => {
    expect(resolveBusyAckMs("0")).toBeNull();
    expect(resolveBusyAckMs("1000")).toBe(60_000);
    expect(resolveBusyAckMs("300000")).toBe(300_000);
  });
});

describe("createSlackReconciler", () => {
  it("replays a missed top-level mention through the normal pipeline", async () => {
    const { reconciler, handler } = makeReconciler({
      history: [{ ts: ts(60), text: `hey <@${BOT}> ping`, user: "U0MILES" }],
    });
    const result = await reconciler.runSlackReconcile("test");
    expect(result.replayed).toBe(1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][1]).toEqual({ source: "app_mention", wasMentioned: true });
    expect(handler.mock.calls[0][0]).toMatchObject({ channel: "C0TEAMCENTER" });
  });

  it("replays a missed THREAD mention (2026-07-02 08:45 class) with thread_ts", async () => {
    const parentTs = ts(300);
    const { reconciler, handler } = makeReconciler({
      history: [
        {
          ts: parentTs,
          text: "notion access thread",
          user: "U0MILES",
          reply_count: 13,
          latest_reply: ts(30),
        },
      ],
      replies: {
        [parentTs]: [
          { ts: parentTs, text: "notion access thread", user: "U0MILES" },
          { ts: ts(30), text: `<@${BOT}> find all Malaika projects`, user: "U0MILES" },
        ],
      },
    });
    const result = await reconciler.runSlackReconcile("test");
    expect(result.replayed).toBe(1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({
      thread_ts: parentTs,
      channel: "C0TEAMCENTER",
    });
  });

  it("skips own messages, non-mentions, and thread parents themselves", async () => {
    const parentTs = ts(200);
    const { reconciler, handler } = makeReconciler({
      history: [
        { ts: ts(90), text: `<@${BOT}> from myself`, user: BOT },
        { ts: ts(80), text: "no mention here", user: "U0MILES" },
        {
          ts: parentTs,
          text: "parent thread starter — no mention",
          user: "U0MILES",
          reply_count: 2,
          latest_reply: ts(10),
        },
      ],
      replies: {
        [parentTs]: [
          { ts: parentTs, text: "parent again", user: "U0MILES" },
          { ts: ts(10), text: `reply without mention`, user: "U0MILES" },
        ],
      },
    });
    const result = await reconciler.runSlackReconcile("test");
    expect(result.replayed).toBe(0);
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not re-replay messages older than the advanced lastTs watermark", async () => {
    const mention = { ts: ts(60), text: `<@${BOT}> once only`, user: "U0MILES" };
    const { reconciler, handler } = makeReconciler({ history: [mention] });
    await reconciler.runSlackReconcile("first");
    await reconciler.runSlackReconcile("second");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("dispatch failures are contained and reported, not thrown", async () => {
    const { reconciler, handler } = makeReconciler({
      history: [{ ts: ts(45), text: `<@${BOT}> boom`, user: "U0MILES" }],
    });
    handler.mockRejectedValueOnce(new Error("lane full"));
    const result = await reconciler.runSlackReconcile("test");
    expect(result.replayed).toBe(0);
  });

  it("defers replay while pending work is registered for the thread (PATCH-022B)", async () => {
    const { reconciler, handler } = makeReconciler({
      history: [{ ts: ts(60), text: `hey <@${BOT}> ping`, user: "U0MILES" }],
      pending: () => true,
    });
    const result = await reconciler.runSlackReconcile("test");
    expect(result.replayed).toBe(0);
    expect(handler).not.toHaveBeenCalled();
  });

  it("replays a deferred mention once pending work terminates with no visible reply (PATCH-022B)", async () => {
    let pending = true;
    const { reconciler, handler } = makeReconciler({
      history: [{ ts: ts(60), text: `hey <@${BOT}> once`, user: "U0MILES" }],
      pending: () => pending,
    });
    await reconciler.runSlackReconcile("first");
    expect(handler).not.toHaveBeenCalled();
    pending = false;
    const second = await reconciler.runSlackReconcile("second");
    expect(second.replayed).toBe(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("resolves a deferred mention without replay when the bot visibly replied in-thread (PATCH-022B)", async () => {
    const mentionTs = ts(120);
    let pending = true;
    const { reconciler, handler } = makeReconciler({
      history: [
        {
          ts: mentionTs,
          text: `<@${BOT}> task`,
          user: "U0MILES",
          reply_count: 1,
          latest_reply: ts(30),
        },
      ],
      replies: {
        [mentionTs]: [
          { ts: mentionTs, text: `<@${BOT}> task`, user: "U0MILES" },
          { ts: ts(30), text: "on it — done", user: BOT },
        ],
      },
      pending: () => pending,
    });
    await reconciler.runSlackReconcile("first");
    pending = false;
    await reconciler.runSlackReconcile("second");
    expect(handler).not.toHaveBeenCalled();
  });

  it("expires a wedged deferral loudly instead of double-spawning (PATCH-022B)", async () => {
    const { reconciler, handler } = makeReconciler({
      history: [{ ts: ts(60), text: `<@${BOT}> wedge`, user: "U0MILES" }],
      pending: () => true,
      maxDeferMs: 0,
    });
    await reconciler.runSlackReconcile("first");
    await reconciler.runSlackReconcile("second");
    await reconciler.runSlackReconcile("third");
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("PATCH-022C busy-ack", () => {
  it("posts one busy-ack into the thread when a mention is first deferred, and never re-acks the same deferral", async () => {
    const { reconciler, handler, postMessage } = makeReconciler({
      history: [{ ts: ts(60), text: `hey <@${BOT}> ping`, user: "U0MILES" }],
      pending: () => true,
    });
    await reconciler.runSlackReconcile("first");
    await reconciler.runSlackReconcile("second");
    expect(handler).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage.mock.calls[0][0]).toMatchObject({
      channel: "C0TEAMCENTER",
      thread_ts: expect.any(String),
    });
    expect(postMessage.mock.calls[0][0].text).toContain(BUSY_ACK_MARKER);
  });

  it("rate-limits acks per thread — several deferred mentions in one thread produce one ack", async () => {
    const parentTs = ts(300);
    const { reconciler, handler, postMessage } = makeReconciler({
      history: [
        {
          ts: parentTs,
          text: "mission thread",
          user: "U0MILES",
          reply_count: 3,
          latest_reply: ts(10),
        },
      ],
      replies: {
        [parentTs]: [
          { ts: parentTs, text: "mission thread", user: "U0MILES" },
          { ts: ts(80), text: `<@${BOT}> u done?`, user: "U0JUSTIN" },
          { ts: ts(20), text: `<@${BOT}> respond`, user: "U0JUSTIN" },
        ],
      },
      pending: () => true,
    });
    await reconciler.runSlackReconcile("first");
    expect(handler).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage.mock.calls[0][0]).toMatchObject({ thread_ts: parentTs });
  });

  it("a busy-ack does NOT count as the visible bot reply — the deferred mention still replays once pending clears", async () => {
    const parentTs = ts(300);
    let pending = true;
    const { reconciler, handler } = makeReconciler({
      history: [
        {
          ts: parentTs,
          text: "mission thread",
          user: "U0MILES",
          reply_count: 2,
          latest_reply: ts(30),
        },
      ],
      replies: {
        [parentTs]: [
          { ts: parentTs, text: "mission thread", user: "U0MILES" },
          { ts: ts(30), text: `<@${BOT}> status?`, user: "U0JUSTIN" },
          { ts: ts(10), text: BUSY_ACK_TEXT, user: BOT },
        ],
      },
      pending: () => pending,
    });
    await reconciler.runSlackReconcile("first");
    expect(handler).not.toHaveBeenCalled();
    pending = false;
    const second = await reconciler.runSlackReconcile("second");
    expect(second.replayed).toBe(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("a REAL bot reply (no marker) still resolves the deferral without replay", async () => {
    const parentTs = ts(300);
    let pending = true;
    const { reconciler, handler } = makeReconciler({
      history: [
        {
          ts: parentTs,
          text: "mission thread",
          user: "U0MILES",
          reply_count: 2,
          latest_reply: ts(30),
        },
      ],
      replies: {
        [parentTs]: [
          { ts: parentTs, text: "mission thread", user: "U0MILES" },
          { ts: ts(30), text: `<@${BOT}> status?`, user: "U0JUSTIN" },
          { ts: ts(10), text: "done — merged, deploy is green", user: BOT },
        ],
      },
      pending: () => pending,
    });
    await reconciler.runSlackReconcile("first");
    pending = false;
    await reconciler.runSlackReconcile("second");
    expect(handler).not.toHaveBeenCalled();
  });

  it("busy-ack post failure is contained; a later deferral in the same thread retries", async () => {
    const postMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error("rate_limited"))
      .mockResolvedValue({ ok: true });
    const history: unknown[] = [{ ts: ts(60), text: `<@${BOT}> first`, user: "U0MILES" }];
    const { reconciler, handler } = makeReconciler({
      history,
      pending: () => true,
      postMessage,
    });
    await reconciler.runSlackReconcile("first");
    expect(postMessage).toHaveBeenCalledTimes(1);
    history.push({ ts: ts(5), text: `<@${BOT}> second`, user: "U0MILES" });
    await reconciler.runSlackReconcile("second");
    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(handler).not.toHaveBeenCalled();
  });

  it("busyAckMs null (env 0) disables acks without touching deferral semantics", async () => {
    let pending = true;
    const { reconciler, handler, postMessage } = makeReconciler({
      history: [{ ts: ts(60), text: `<@${BOT}> quiet`, user: "U0MILES" }],
      pending: () => pending,
      busyAckMs: null,
    });
    await reconciler.runSlackReconcile("first");
    expect(postMessage).not.toHaveBeenCalled();
    pending = false;
    const second = await reconciler.runSlackReconcile("second");
    expect(second.replayed).toBe(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("a client without chat.postMessage is tolerated (no ack, no crash)", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const client = {
      conversations: {
        history: vi.fn().mockResolvedValue({
          messages: [{ ts: ts(60), text: `<@${BOT}> chatless`, user: "U0MILES" }],
        }),
        replies: vi.fn(async () => ({ messages: [] })),
      },
    };
    const reconciler = createSlackReconciler({
      client: client as never,
      runtime: { log: vi.fn(), error: vi.fn() },
      handleSlackMessage: handler as never,
      getBotUserId: () => BOT,
      getChannelIds: () => ["C0TEAMCENTER"],
      periodMs: null,
      isThreadWorkPending: () => true,
    });
    const result = await reconciler.runSlackReconcile("test");
    expect(result.replayed).toBe(0);
    expect(handler).not.toHaveBeenCalled();
  });
});
