import { readStringParam } from "../../agents/tools/common.js";
import type {
  ChannelId,
  ChannelMessageActionName,
  ChannelThreadingAdapter,
  ChannelThreadingToolContext,
} from "../../channels/plugins/types.public.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { isTruthyEnvValue } from "../../infra/env.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalString,
} from "../../shared/string-coerce.js";
import type {
  OutboundSessionRoute,
  ResolveOutboundSessionRouteParams,
} from "./outbound-session.js";
import type { ResolvedMessagingTarget } from "./target-resolver.js";

type ResolveAutoThreadId = NonNullable<ChannelThreadingAdapter["resolveAutoThreadId"]>;

const log = createSubsystemLogger("outbound/thread-bind-guard");
const SLACK_THREAD_BIND_GUARD_ENV = "OPENCLAW_SLACK_AUTO_BIND_INBOUND_THREAD";

function isSlackThreadBindGuardEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env[SLACK_THREAD_BIND_GUARD_ENV];
  if (typeof raw !== "string" || !raw.trim()) {
    return true;
  }
  return isTruthyEnvValue(raw);
}

function resolveInboundTurnThreadId(toolContext?: ChannelThreadingToolContext): {
  threadId?: string;
  source?: "topic_id" | "reply_to_id" | "thread_ts";
} {
  const turnThreadContext = toolContext?.turnThreadContext;
  if (!turnThreadContext?.isInboundThreadedTurn) {
    return {};
  }
  const topicId = normalizeOptionalString(turnThreadContext.topicId);
  if (topicId) {
    return { threadId: topicId, source: "topic_id" };
  }
  const replyToId = normalizeOptionalString(turnThreadContext.replyToId);
  if (replyToId) {
    return { threadId: replyToId, source: "reply_to_id" };
  }
  const threadTs = normalizeOptionalString(turnThreadContext.threadTs);
  if (threadTs) {
    return { threadId: threadTs, source: "thread_ts" };
  }
  return {};
}

function isTopLevelOverride(raw: unknown): boolean {
  if (raw === true) {
    return true;
  }
  return typeof raw === "string" && isTruthyEnvValue(raw);
}

export function resolveAndApplyOutboundThreadId(
  actionParams: Record<string, unknown>,
  context: {
    cfg: OpenClawConfig;
    channel: ChannelId;
    action: ChannelMessageActionName;
    to: string;
    accountId?: string | null;
    toolContext?: ChannelThreadingToolContext;
    resolveAutoThreadId?: ResolveAutoThreadId;
  },
): string | undefined {
  const threadId = readStringParam(actionParams, "threadId");
  const topLevel = isTopLevelOverride(actionParams.topLevel);
  if (Object.hasOwn(actionParams, "topLevel")) {
    delete actionParams.topLevel;
  }
  if (threadId) {
    return threadId;
  }
  if (topLevel) {
    return undefined;
  }
  const isSlackSendAction =
    context.action === "send" && normalizeLowercaseStringOrEmpty(context.channel) === "slack";
  const guardEnabled = isSlackSendAction && isSlackThreadBindGuardEnabled();
  const guard = guardEnabled ? resolveInboundTurnThreadId(context.toolContext) : {};
  const resolved = guardEnabled
    ? (guard.threadId ??
      context.resolveAutoThreadId?.({
        cfg: context.cfg,
        accountId: context.accountId,
        to: context.to,
        toolContext: context.toolContext,
        replyToId: readStringParam(actionParams, "replyTo"),
      }))
    : context.resolveAutoThreadId?.({
        cfg: context.cfg,
        accountId: context.accountId,
        to: context.to,
        toolContext: context.toolContext,
        replyToId: readStringParam(actionParams, "replyTo"),
      });
  if (resolved && !actionParams.threadId) {
    actionParams.threadId = resolved;
  }
  if (guard.threadId && resolved === guard.threadId) {
    log.warn("Slack thread-bind guard auto-attached inbound thread.", {
      event: "slack_thread_bind_guard_auto_attached",
      envFlag: SLACK_THREAD_BIND_GUARD_ENV,
      source: guard.source,
      threadId: guard.threadId,
      channel: context.channel,
      to: context.to,
    });
  }
  return resolved ?? undefined;
}

function isSameConversationTarget(
  actionParams: Record<string, unknown>,
  channel: ChannelId,
  toolContext?: ChannelThreadingToolContext,
): boolean {
  const currentChannelId = toolContext?.currentChannelId?.trim();
  if (!currentChannelId) {
    return false;
  }
  const currentChannelProvider = toolContext?.currentChannelProvider?.trim();
  if (currentChannelProvider && currentChannelProvider !== channel) {
    return false;
  }
  const explicitTarget =
    readStringParam(actionParams, "target") ??
    readStringParam(actionParams, "to") ??
    readStringParam(actionParams, "channelId");
  if (!explicitTarget) {
    return true;
  }
  return explicitTarget.trim() === currentChannelId;
}

export function resolveAndApplyOutboundReplyToId(
  actionParams: Record<string, unknown>,
  context: {
    channel: ChannelId;
    toolContext?: ChannelThreadingToolContext;
  },
): string | undefined {
  const explicitReplyToId = readStringParam(actionParams, "replyTo");
  if (explicitReplyToId) {
    if (context.toolContext?.replyToMode === "first") {
      const hasRepliedRef = context.toolContext.hasRepliedRef;
      if (hasRepliedRef) {
        hasRepliedRef.value = true;
      }
    }
    return explicitReplyToId;
  }
  if (!isSameConversationTarget(actionParams, context.channel, context.toolContext)) {
    return undefined;
  }

  const currentMessageId = context.toolContext?.currentMessageId;
  if (currentMessageId == null) {
    return undefined;
  }

  const mode = context.toolContext?.replyToMode ?? "off";
  if (mode === "off" || mode === "batched") {
    return undefined;
  }

  if (mode === "first") {
    const hasRepliedRef = context.toolContext?.hasRepliedRef;
    if (hasRepliedRef?.value) {
      return undefined;
    }
    if (hasRepliedRef) {
      hasRepliedRef.value = true;
    }
  }

  const resolvedReplyToId =
    typeof currentMessageId === "number" ? String(currentMessageId) : currentMessageId.trim();
  if (!resolvedReplyToId) {
    return undefined;
  }
  actionParams.replyTo = resolvedReplyToId;
  return resolvedReplyToId;
}

export async function prepareOutboundMirrorRoute(params: {
  cfg: OpenClawConfig;
  channel: ChannelId;
  to: string;
  actionParams: Record<string, unknown>;
  accountId?: string | null;
  toolContext?: ChannelThreadingToolContext;
  agentId?: string;
  currentSessionKey?: string;
  dryRun?: boolean;
  resolvedTarget?: ResolvedMessagingTarget;
  resolveAutoThreadId?: ResolveAutoThreadId;
  resolveOutboundSessionRoute: (
    params: ResolveOutboundSessionRouteParams,
  ) => Promise<OutboundSessionRoute | null>;
  ensureOutboundSessionEntry: (params: {
    cfg: OpenClawConfig;
    channel: ChannelId;
    accountId?: string | null;
    route: OutboundSessionRoute;
  }) => Promise<void>;
}): Promise<{
  resolvedThreadId?: string;
  outboundRoute: OutboundSessionRoute | null;
}> {
  const replyToId = readStringParam(params.actionParams, "replyTo");
  const resolvedThreadId = resolveAndApplyOutboundThreadId(params.actionParams, {
    cfg: params.cfg,
    channel: params.channel,
    action: "send",
    to: params.to,
    accountId: params.accountId,
    toolContext: params.toolContext,
    resolveAutoThreadId: params.resolveAutoThreadId,
  });
  const outboundRoute =
    params.agentId && !params.dryRun
      ? await params.resolveOutboundSessionRoute({
          cfg: params.cfg,
          channel: params.channel,
          agentId: params.agentId,
          accountId: params.accountId,
          target: params.to,
          currentSessionKey: params.currentSessionKey,
          resolvedTarget: params.resolvedTarget,
          replyToId,
          threadId: resolvedThreadId,
        })
      : null;
  if (outboundRoute && params.agentId && !params.dryRun) {
    await params.ensureOutboundSessionEntry({
      cfg: params.cfg,
      channel: params.channel,
      accountId: params.accountId,
      route: outboundRoute,
    });
  }
  if (outboundRoute && !params.dryRun) {
    params.actionParams.__sessionKey = outboundRoute.sessionKey;
  }
  if (params.agentId) {
    params.actionParams.__agentId = params.agentId;
  }
  return {
    resolvedThreadId,
    outboundRoute,
  };
}
