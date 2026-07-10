import {
  i as shouldAckReaction,
  n as removeAckReactionAfterReply,
  r as removeAckReactionHandleAfterReply,
  t as createAckReactionHandle,
} from "./ack-reactions-Chyt3s4c.js";
import {
  n as recordChannelActivity,
  t as getChannelActivity,
} from "./channel-activity-C42T8R8o.js";
import "./sessions-Bdy1wToU.js";
import { t as createChannelRuntimeContextRegistry } from "./channel-runtime-contexts-DSsrl6mi.js";
import {
  a as chunkText,
  c as resolveTextChunkLimit,
  i as chunkMarkdownTextWithMode,
  o as chunkTextWithMode,
  r as chunkMarkdownText,
  s as resolveChunkMode,
  t as chunkByNewline,
} from "./chunk-aBEwc7QQ.js";
import {
  i as shouldComputeCommandAuthorized,
  r as isControlCommandMessage,
  t as hasControlCommand,
} from "./command-detection-CTqIeWA8.js";
import { t as resolveCommandAuthorizedFromAuthorizers } from "./command-gating-BAZRoOCR.js";
import { n as shouldHandleTextCommands } from "./commands-text-routing-0lCkiXVx.js";
import {
  n as setChannelConversationBindingMaxAgeBySessionKey,
  t as setChannelConversationBindingIdleTimeoutBySessionKey,
} from "./conversation-bindings-BD5DS7vC.js";
import {
  a as createReplyDispatcherWithTyping,
  c as withReplyDispatcher,
  o as dispatchReplyFromConfig,
  s as settleReplyDispatcher,
} from "./dispatch-24GR7qbj.js";
import {
  a as resolveEnvelopeFormatOptions,
  r as formatInboundEnvelope,
  t as formatAgentEnvelope,
} from "./envelope-DWEYsyXr.js";
import { r as fetchRemoteMedia } from "./fetch-CIuHGNdE.js";
import "./commands-registry-8mCZwy9x.js";
import {
  n as resolveChannelGroupRequireMention,
  t as resolveChannelGroupPolicy,
} from "./group-policy-DuzLZrql.js";
import {
  i as resolveHumanDelayConfig,
  r as resolveEffectiveMessagesConfig,
} from "./identity-BfuOtf2o.js";
import { t as finalizeInboundContext } from "./inbound-context-C2mdUiyz.js";
import {
  n as resolveInboundDebounceMs,
  t as createInboundDebouncer,
} from "./inbound-debounce-A6RXlMbt.js";
import {
  a as runPreparedChannelTurn,
  i as runChannelTurn,
  o as runResolvedChannelTurn,
  r as dispatchAssembledChannelTurn,
  s as buildChannelTurnContext,
} from "./kernel-DgPXdKXQ.js";
import { t as loadChannelOutboundAdapter } from "./load-K0ejV97A.js";
import { t as resolveMarkdownTableMode } from "./markdown-tables-BjMHBbxn.js";
import {
  n as resolveInboundMentionDecision,
  t as implicitMentionKindWhen,
} from "./mention-gating-DJ8J7HbK.js";
import {
  i as matchesMentionWithExplicit,
  n as buildMentionRegexes,
  r as matchesMentionPatterns,
} from "./mentions-CX9MvOD0.js";
import { t as buildPairingReply } from "./pairing-messages-DiT6kq25.js";
import {
  a as readChannelAllowFromStore,
  d as upsertChannelPairingRequest,
} from "./pairing-store-CzWw0BEc.js";
import { u as resolveStorePath } from "./paths-CfeECf6Z.js";
import { t as dispatchReplyWithBufferedBlockDispatcher } from "./provider-dispatcher-BPV_KXNV.js";
import { i as resolveAgentRoute, t as buildAgentSessionKey } from "./resolve-route-mwkm9MN4.js";
import { t as recordInboundSession } from "./session-CUCa4TmV.js";
import {
  n as readSessionUpdatedAt,
  o as updateLastRoute,
  r as recordSessionMetaFromInbound,
} from "./store-BpWdoYPF.js";
import { u as saveMediaBuffer } from "./store-N2etmi9e.js";
import { t as convertMarkdownTables } from "./tables-Dey9v5zf.js";
//#region src/plugins/runtime/runtime-channel.ts
function createRuntimeChannel() {
  return {
    text: {
      chunkByNewline,
      chunkMarkdownText,
      chunkMarkdownTextWithMode,
      chunkText,
      chunkTextWithMode,
      resolveChunkMode,
      resolveTextChunkLimit,
      hasControlCommand,
      resolveMarkdownTableMode,
      convertMarkdownTables,
    },
    reply: {
      dispatchReplyWithBufferedBlockDispatcher,
      createReplyDispatcherWithTyping,
      resolveEffectiveMessagesConfig,
      resolveHumanDelayConfig,
      dispatchReplyFromConfig,
      withReplyDispatcher,
      settleReplyDispatcher,
      finalizeInboundContext,
      formatAgentEnvelope,
      /** @deprecated Prefer `BodyForAgent` + structured user-context blocks (do not build plaintext envelopes for prompts). */
      formatInboundEnvelope,
      resolveEnvelopeFormatOptions,
    },
    routing: {
      buildAgentSessionKey,
      resolveAgentRoute,
    },
    pairing: {
      buildPairingReply,
      readAllowFromStore: ({ channel, accountId, env }) =>
        readChannelAllowFromStore(channel, env, accountId),
      upsertPairingRequest: ({ channel, id, accountId, meta, env, pairingAdapter }) =>
        upsertChannelPairingRequest({
          channel,
          id,
          accountId,
          meta,
          env,
          pairingAdapter,
        }),
    },
    media: {
      fetchRemoteMedia,
      saveMediaBuffer,
    },
    activity: {
      record: recordChannelActivity,
      get: getChannelActivity,
    },
    session: {
      resolveStorePath,
      readSessionUpdatedAt,
      recordSessionMetaFromInbound,
      recordInboundSession,
      updateLastRoute,
    },
    mentions: {
      buildMentionRegexes,
      matchesMentionPatterns,
      matchesMentionWithExplicit,
      implicitMentionKindWhen,
      resolveInboundMentionDecision,
    },
    reactions: {
      createAckReactionHandle,
      shouldAckReaction,
      removeAckReactionAfterReply,
      removeAckReactionHandleAfterReply,
    },
    groups: {
      resolveGroupPolicy: resolveChannelGroupPolicy,
      resolveRequireMention: resolveChannelGroupRequireMention,
    },
    debounce: {
      createInboundDebouncer,
      resolveInboundDebounceMs,
    },
    commands: {
      resolveCommandAuthorizedFromAuthorizers,
      isControlCommandMessage,
      shouldComputeCommandAuthorized,
      shouldHandleTextCommands,
    },
    outbound: { loadAdapter: loadChannelOutboundAdapter },
    turn: {
      run: runChannelTurn,
      runResolved: runResolvedChannelTurn,
      buildContext: buildChannelTurnContext,
      runPrepared: runPreparedChannelTurn,
      dispatchAssembled: dispatchAssembledChannelTurn,
    },
    threadBindings: {
      setIdleTimeoutBySessionKey: ({ channelId, targetSessionKey, accountId, idleTimeoutMs }) =>
        setChannelConversationBindingIdleTimeoutBySessionKey({
          channelId,
          targetSessionKey,
          accountId,
          idleTimeoutMs,
        }),
      setMaxAgeBySessionKey: ({ channelId, targetSessionKey, accountId, maxAgeMs }) =>
        setChannelConversationBindingMaxAgeBySessionKey({
          channelId,
          targetSessionKey,
          accountId,
          maxAgeMs,
        }),
    },
    runtimeContexts: createChannelRuntimeContextRegistry(),
  };
}
//#endregion
export { createRuntimeChannel as t };
