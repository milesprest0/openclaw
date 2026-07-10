import {
  i as resolveIMessageAccount,
  n as listIMessageAccountIds,
  r as resolveDefaultIMessageAccountId,
  t as listEnabledIMessageAccounts,
} from "../../accounts-BAZkARPH.js";
import {
  n as createIMessagePluginBase,
  r as imessageSetupWizard,
  t as imessagePlugin,
} from "../../channel-C9UeYcda.js";
import {
  a as resolveServicePrefixedAllowTarget,
  c as resolveServicePrefixedTarget,
  i as parseChatTargetPrefixesOrThrow,
  o as resolveServicePrefixedChatTarget,
  r as parseChatAllowTargetPrefixes,
  s as resolveServicePrefixedOrChatAllowTarget,
  t as createAllowedChatSenderMatcher,
} from "../../chat-target-prefixes-BxhM8xE_.js";
import { n as DEFAULT_IMESSAGE_PROBE_TIMEOUT_MS } from "../../client-DjZEGIaL.js";
import {
  n as createIMessageConversationBindingManager,
  t as __testing,
} from "../../conversation-bindings-CUYjJDZd.js";
import {
  n as resolveIMessageGroupToolPolicy,
  t as resolveIMessageGroupRequireMention,
} from "../../group-policy-wISQ36Or.js";
import {
  n as IMESSAGE_ACTIONS,
  r as IMESSAGE_ACTION_NAMES,
} from "../../message-tool-api-CBtjCIoA.js";
import { t as IMESSAGE_LEGACY_OUTBOUND_SEND_DEP_KEYS } from "../../outbound-send-deps-D8Suivqw.js";
import { t as probeIMessage } from "../../probe-JOVG8hRm.js";
import {
  a as resolveIMessageConversationIdFromTarget,
  i as normalizeIMessageAcpConversationId,
  n as resolveIMessageInboundConversationId,
  o as looksLikeIMessageTargetId,
  r as matchIMessageAcpConversation,
  s as normalizeIMessageMessagingTarget,
} from "../../sanitize-outbound-CHQ-Gh9b.js";
import { a as imessageSetupAdapter } from "../../setup-core-BRm8DLgl.js";
import {
  a as normalizeIMessageHandle,
  i as looksLikeIMessageExplicitTargetId,
  n as inferIMessageTargetChatType,
  o as parseIMessageAllowTarget,
  r as isAllowedIMessageSender,
  s as parseIMessageTarget,
  t as formatIMessageChatTarget,
} from "../../targets-DXJ3lVEO.js";
//#region extensions/imessage/src/channel.setup.ts
const imessageSetupPlugin = {
  ...createIMessagePluginBase({
    setupWizard: imessageSetupWizard,
    setup: imessageSetupAdapter,
  }),
};
//#endregion
export {
  DEFAULT_IMESSAGE_PROBE_TIMEOUT_MS,
  IMESSAGE_ACTIONS,
  IMESSAGE_ACTION_NAMES,
  IMESSAGE_LEGACY_OUTBOUND_SEND_DEP_KEYS,
  __testing,
  createAllowedChatSenderMatcher,
  createIMessageConversationBindingManager,
  formatIMessageChatTarget,
  imessagePlugin,
  imessageSetupPlugin,
  inferIMessageTargetChatType,
  isAllowedIMessageSender,
  listEnabledIMessageAccounts,
  listIMessageAccountIds,
  looksLikeIMessageExplicitTargetId,
  looksLikeIMessageTargetId,
  matchIMessageAcpConversation,
  normalizeIMessageAcpConversationId,
  normalizeIMessageHandle,
  normalizeIMessageMessagingTarget,
  parseChatAllowTargetPrefixes,
  parseChatTargetPrefixesOrThrow,
  parseIMessageAllowTarget,
  parseIMessageTarget,
  probeIMessage,
  resolveDefaultIMessageAccountId,
  resolveIMessageAccount,
  resolveIMessageConversationIdFromTarget,
  resolveIMessageGroupRequireMention,
  resolveIMessageGroupToolPolicy,
  resolveIMessageInboundConversationId,
  resolveServicePrefixedAllowTarget,
  resolveServicePrefixedChatTarget,
  resolveServicePrefixedOrChatAllowTarget,
  resolveServicePrefixedTarget,
};
