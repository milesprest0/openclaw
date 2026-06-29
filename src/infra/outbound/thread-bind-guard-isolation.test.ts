import { describe, expect, it } from "vitest";
import type { ChannelThreadingToolContext } from "../../channels/plugins/types.public.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { resolveAndApplyOutboundThreadId } from "./message-action-threading.js";

// Regression test for the Slack thread-bind guard (commit bbb846bddc).
//
// The guard auto-attaches the inbound thread on the `message action=send`
// tool path when `turnThreadContext.isInboundThreadedTurn` is true. A prior
// live "control test" was inconclusive because the production config runs
// slack.replyToMode="all", which makes the channel fallback
// (resolveSlackAutoThreadId) thread EVERY same-channel reply regardless of the
// guard — masking it. These tests pin the guard's behavior in ISOLATION by
// setting replyToMode="off" so the fallback can never fire; only the guard can
// attach a thread.

const cfg = {} as OpenClawConfig;

// Mirrors the live #prest0n-development inbound turn metadata.
const LIVE_CHANNEL_ID = "C0AMX0ACS9K";
const LIVE_TOPIC_ID = "1782591889.218119";

function makeToolContext(
  overrides?: Partial<ChannelThreadingToolContext>,
): ChannelThreadingToolContext {
  return {
    currentChannelId: LIVE_CHANNEL_ID,
    currentChannelProvider: "slack",
    currentThreadTs: LIVE_TOPIC_ID,
    // replyToMode=off disables resolveSlackAutoThreadId so we isolate the guard.
    replyToMode: "off",
    turnThreadContext: {
      isInboundThreadedTurn: true,
      topicId: LIVE_TOPIC_ID,
      replyToId: LIVE_TOPIC_ID,
      threadTs: undefined,
    },
    ...overrides,
  } as ChannelThreadingToolContext;
}

// The Slack fallback resolver, used only to prove the guard does NOT depend on
// it. When replyToMode is "off" this returns undefined for every input.
function fallbackThatRequiresReplyToAll(args: {
  toolContext?: { currentThreadTs?: string; replyToMode?: string };
}): string | undefined {
  const ctx = args.toolContext;
  if (!ctx?.currentThreadTs) return undefined;
  if (ctx.replyToMode !== "all" && ctx.replyToMode !== "first") return undefined;
  return ctx.currentThreadTs;
}

describe("Slack thread-bind guard (isolated from replyToMode=all fallback)", () => {
  it("auto-attaches inbound topic_id even when the channel fallback is disabled", () => {
    const params: Record<string, unknown> = { message: "hi" };
    const resolved = resolveAndApplyOutboundThreadId(params, {
      cfg,
      channel: "slack",
      action: "send",
      to: LIVE_CHANNEL_ID,
      toolContext: makeToolContext(),
      resolveAutoThreadId: fallbackThatRequiresReplyToAll,
    });
    // Fallback would return undefined here (replyToMode=off), so a thread id
    // can ONLY come from the guard. Proves the guard fires.
    expect(resolved).toBe(LIVE_TOPIC_ID);
    expect(params.threadId).toBe(LIVE_TOPIC_ID);
  });

  it("does NOT attach a thread when the turn is not an inbound threaded turn", () => {
    const params: Record<string, unknown> = { message: "hi" };
    const resolved = resolveAndApplyOutboundThreadId(params, {
      cfg,
      channel: "slack",
      action: "send",
      to: LIVE_CHANNEL_ID,
      toolContext: makeToolContext({
        turnThreadContext: {
          isInboundThreadedTurn: false,
          topicId: LIVE_TOPIC_ID,
        },
      }),
      resolveAutoThreadId: fallbackThatRequiresReplyToAll,
    });
    // Guard is gated on isInboundThreadedTurn; fallback is off → no thread.
    // This is exactly the top-level-message scenario from the flawed prior test.
    expect(resolved).toBeUndefined();
    expect(params.threadId).toBeUndefined();
  });

  it("honors an explicit topLevel override (does not auto-bind)", () => {
    const params: Record<string, unknown> = { message: "hi", topLevel: true };
    const resolved = resolveAndApplyOutboundThreadId(params, {
      cfg,
      channel: "slack",
      action: "send",
      to: LIVE_CHANNEL_ID,
      toolContext: makeToolContext(),
      resolveAutoThreadId: fallbackThatRequiresReplyToAll,
    });
    expect(resolved).toBeUndefined();
  });

  it("prefers topic_id over reply_to_id and thread_ts (guard source precedence)", () => {
    const params: Record<string, unknown> = { message: "hi" };
    const resolved = resolveAndApplyOutboundThreadId(params, {
      cfg,
      channel: "slack",
      action: "send",
      to: LIVE_CHANNEL_ID,
      toolContext: makeToolContext({
        turnThreadContext: {
          isInboundThreadedTurn: true,
          topicId: "TOPIC",
          replyToId: "REPLY",
          threadTs: "TS",
        },
      }),
      resolveAutoThreadId: fallbackThatRequiresReplyToAll,
    });
    expect(resolved).toBe("TOPIC");
  });
});
