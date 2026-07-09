import { afterEach, describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { setActivePluginRegistry } from "../../plugins/runtime.js";
import {
  createChannelTestPluginBase,
  createTestRegistry,
} from "../../test-utils/channel-plugins.js";
import { resolveConversationBindingContextFromMessage } from "./conversation-binding-input.js";
import { resolveReplyToModeWithThreading } from "./reply-threading.js";
import {
  resolveSourceReplyDeliveryMode,
  resolveSourceReplyVisibilityPolicy,
} from "./source-reply-delivery-mode.js";

const emptyConfig = {} as OpenClawConfig;

type FocusedBindingContext = {
  MessageThreadId?: string | number | null;
  From?: string | null;
  To?: string | null;
};

function registerThreadScopedDiscordPlugin() {
  setActivePluginRegistry(
    createTestRegistry([
      {
        pluginId: "discord",
        source: "test",
        plugin: {
          ...createChannelTestPluginBase({
            id: "discord",
            label: "Discord",
            capabilities: { chatTypes: ["direct", "group", "channel"] },
          }),
          bindings: {
            compileConfiguredBinding: () => null,
            matchInboundConversation: () => null,
            resolveCommandConversation: () => null,
          },
          threading: {
            resolveFocusedBinding: ({
              accountId,
              context,
            }: {
              accountId?: string;
              context: FocusedBindingContext;
            }) => {
              const threadId =
                context?.MessageThreadId != null ? String(context.MessageThreadId).trim() : "";
              const participant =
                typeof context?.From === "string" ? context.From.trim().toLowerCase() : "";
              const parent =
                typeof context?.To === "string" ? context.To.replace(/^discord:/iu, "").trim() : "";
              if (!threadId || !participant || !parent) {
                return null;
              }
              return {
                conversationId: `${accountId ?? "default"}:${participant}:${threadId}`,
                parentConversationId: parent,
              };
            },
            resolveReplyToMode: ({ chatType }: { chatType?: string | null }) =>
              chatType === "channel" ? "first" : "all",
          },
        },
      },
    ]),
  );
}

describe("group threading regression matrix", () => {
  afterEach(() => {
    setActivePluginRegistry(createTestRegistry());
  });

  it("scenario A: isolates thread anchoring for two users in one account", () => {
    registerThreadScopedDiscordPlugin();
    const alice = resolveConversationBindingContextFromMessage({
      cfg: emptyConfig,
      ctx: {
        OriginatingChannel: "discord",
        ChatType: "channel",
        AccountId: "shared",
        From: "alice",
        OriginatingTo: "discord:channel:team-room",
        MessageThreadId: "thread-101",
      },
    });
    const bob = resolveConversationBindingContextFromMessage({
      cfg: emptyConfig,
      ctx: {
        OriginatingChannel: "discord",
        ChatType: "channel",
        AccountId: "shared",
        From: "bob",
        OriginatingTo: "discord:channel:team-room",
        MessageThreadId: "thread-101",
      },
    });

    expect(alice).toEqual({
      channel: "discord",
      accountId: "shared",
      conversationId: "shared:alice:thread-101",
      parentConversationId: "channel:team-room",
      threadId: "thread-101",
    });
    expect(bob).toEqual({
      channel: "discord",
      accountId: "shared",
      conversationId: "shared:bob:thread-101",
      parentConversationId: "channel:team-room",
      threadId: "thread-101",
    });
    expect(alice?.conversationId).not.toBe(bob?.conversationId);
  });

  it("scenario B: isolates account+participant threading across separate accounts", () => {
    registerThreadScopedDiscordPlugin();
    const work = resolveConversationBindingContextFromMessage({
      cfg: emptyConfig,
      ctx: {
        OriginatingChannel: "discord",
        ChatType: "channel",
        AccountId: "work",
        From: "alice",
        OriginatingTo: "discord:channel:team-room",
        MessageThreadId: "thread-202",
      },
    });
    const personal = resolveConversationBindingContextFromMessage({
      cfg: emptyConfig,
      ctx: {
        OriginatingChannel: "discord",
        ChatType: "channel",
        AccountId: "personal",
        From: "alice",
        OriginatingTo: "discord:channel:team-room",
        MessageThreadId: "thread-202",
      },
    });

    expect(work).toEqual({
      channel: "discord",
      accountId: "work",
      conversationId: "work:alice:thread-202",
      parentConversationId: "channel:team-room",
      threadId: "thread-202",
    });
    expect(personal).toEqual({
      channel: "discord",
      accountId: "personal",
      conversationId: "personal:alice:thread-202",
      parentConversationId: "channel:team-room",
      threadId: "thread-202",
    });
    expect(work?.conversationId).not.toBe(personal?.conversationId);
  });

  it("scenario C: stable control keeps deterministic same-thread anchoring", () => {
    const turn = {
      OriginatingChannel: "discord",
      ChatType: "channel",
      OriginatingTo: "discord:channel:ops-room",
      MessageThreadId: 42.9,
    };
    const first = resolveConversationBindingContextFromMessage({ cfg: emptyConfig, ctx: turn });
    const second = resolveConversationBindingContextFromMessage({ cfg: emptyConfig, ctx: turn });

    expect(first).toEqual({
      channel: "discord",
      accountId: "default",
      conversationId: "42.9",
      parentConversationId: "ops-room",
      threadId: "42.9",
    });
    expect(second).toEqual(first);
  });

  it("drops stale thread ids after actor+destination switch and re-resolves each turn", () => {
    const threadedTurn = resolveConversationBindingContextFromMessage({
      cfg: emptyConfig,
      ctx: {
        OriginatingChannel: "discord",
        ChatType: "channel",
        From: "alice",
        OriginatingTo: "discord:channel:alpha-room",
        MessageThreadId: "thread-alpha",
      },
    });
    const switchedTurn = resolveConversationBindingContextFromMessage({
      cfg: emptyConfig,
      ctx: {
        OriginatingChannel: "discord",
        ChatType: "channel",
        From: "bob",
        OriginatingTo: "discord:channel:beta-room",
      },
    });

    expect(threadedTurn?.threadId).toBe("thread-alpha");
    expect(switchedTurn).toEqual({
      channel: "discord",
      accountId: "default",
      conversationId: "beta-room",
    });
    expect(switchedTurn?.threadId).toBeUndefined();
    expect(switchedTurn?.conversationId).not.toBe(threadedTurn?.conversationId);
  });

  it("fails closed when user/thread metadata is missing or conflicting", () => {
    const missingAll = resolveConversationBindingContextFromMessage({
      cfg: emptyConfig,
      ctx: {
        OriginatingChannel: "",
        OriginatingTo: "",
      },
    });
    const conflicting = resolveConversationBindingContextFromMessage({
      cfg: emptyConfig,
      ctx: {
        OriginatingChannel: "discord",
        OriginatingTo: "discord:",
        MessageThreadId: " ",
      },
    });

    expect(missingAll).toBeNull();
    expect(conflicting).toBeNull();
  });

  it("keeps channel thread-target normalization stable for reply-to policy lookup", () => {
    const mode = resolveReplyToModeWithThreading(
      emptyConfig,
      {
        resolveReplyToMode: ({ chatType }: { chatType?: string | null }) =>
          chatType === "channel" ? "first" : "all",
      },
      {
        channel: "discord",
        accountId: "default",
        chatType: "channel",
      },
    );

    expect(mode).toBe("first");
  });

  it("regression #1 dispatch_silent: group/channel mentions stay visible when visibleReplies is unset", () => {
    expect(
      resolveSourceReplyDeliveryMode({
        cfg: emptyConfig,
        ctx: { ChatType: "group", WasMentioned: true },
      }),
    ).toBe("automatic");
    expect(
      resolveSourceReplyDeliveryMode({
        cfg: emptyConfig,
        ctx: { ChatType: "channel", WasMentioned: true },
      }),
    ).toBe("automatic");
    expect(
      resolveSourceReplyVisibilityPolicy({
        cfg: emptyConfig,
        ctx: { ChatType: "channel", WasMentioned: true },
        sendPolicy: "allow",
      }),
    ).toMatchObject({
      sourceReplyDeliveryMode: "automatic",
      suppressAutomaticSourceDelivery: false,
      suppressDelivery: false,
      suppressHookUserDelivery: false,
      deliverySuppressionReason: "",
    });
  });
});
