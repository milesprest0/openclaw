import { n as normalizeAccountId, t as DEFAULT_ACCOUNT_ID } from "../../account-id-BGKP_Par.js";
import {
  a as resolveConfiguredFromCredentialStatuses,
  r as projectCredentialSnapshotFields,
} from "../../account-snapshot-fields-enMiz0m_.js";
import {
  n as collectTelegramUnmentionedGroupIds,
  t as auditTelegramGroupMembership,
} from "../../audit-5j7nP5Rj.js";
import { t as getChatChannelMeta } from "../../chat-meta-CUH0ZInO.js";
import {
  f as readNumberParam,
  g as readStringParam,
  h as readStringOrNumberParam,
  l as jsonResult,
  m as readStringArrayParam,
  p as readReactionParams,
} from "../../common-BPZLgNoA.js";
import { t as clearAccountEntryFields } from "../../config-helpers-DSIf-D9t.js";
import { r as emptyPluginConfigSchema } from "../../config-schema--9UsXYRo.js";
import { r as buildChannelConfigSchema } from "../../config-schema-BPiFZhPG.js";
import { n as AcpRuntimeError } from "../../errors-DxZLVXmo.js";
import {
  i as shouldRetryTelegramTransportFallback,
  n as resolveTelegramFetch,
  r as resolveTelegramTransport,
} from "../../fetch-BsuRcQog.js";
import { r as resolveTelegramRuntimeGroupPolicy } from "../../group-access-PQD8PP2f.js";
import { n as formatPairingApproveHint } from "../../helpers-BLJkDN4N.js";
import "../../channel-core-CYgk_8J6.js";
import { t as PAIRING_APPROVED_MESSAGE } from "../../pairing-message-DzMpS8d3.js";
import { t as resolveTelegramPollVisibility } from "../../poll-visibility-ClvX7bAD.js";
import "../../acp-runtime-Cj-HWKEt.js";
import { r as resolvePollMaxSelections } from "../../polls-CNbHLDT1.js";
import "../../channel-plugin-common-IgGI7KdH.js";
import {
  a as shouldSuppressTelegramExecApprovalForwardingFallback,
  i as buildTelegramExecApprovalPendingPayload,
  o as telegramMessageActions,
  r as monitorTelegramProvider,
  t as probeTelegram,
} from "../../probe-DwMlGujK.js";
import "../../channel-status-BLgpG3VN.js";
import "../../channel-actions-Ds3BuQCc.js";
import { r as makeProxyFetch } from "../../proxy-fetch-Dt1coO5G.js";
import { n as setTelegramRuntime } from "../../runtime--f86u1XL.js";
import {
  a as editMessageTelegram,
  c as renameForumTopicTelegram,
  d as sendPollTelegram,
  f as sendStickerTelegram,
  i as editMessageReplyMarkupTelegram,
  m as unpinMessageTelegram,
  n as deleteMessageTelegram,
  o as pinMessageTelegram,
  p as sendTypingTelegram,
  r as editForumTopicTelegram,
  s as reactMessageTelegram,
  t as createForumTopicTelegram,
  u as sendMessageTelegram,
} from "../../send-WFJDNput.js";
import { o as buildTokenChannelStatusSummary } from "../../status-helpers-SQEITAo1.js";
import "../../config-api-s1DDSpq7.js";
import {
  a as setTelegramThreadBindingMaxAgeBySessionKey,
  i as setTelegramThreadBindingIdleTimeoutBySessionKey,
  n as getTelegramThreadBindingManager,
  r as resetTelegramThreadBindingsForTests,
  t as createTelegramThreadBindingManager,
} from "../../thread-bindings-CUBC5yI2.js";
import { t as resolveTelegramToken } from "../../token-DARnFU4l.js";
import { t as parseTelegramTopicConversation } from "../../topic-conversation-NVQ8tgVC.js";
import { c as TelegramConfigSchema } from "../../zod-schema.providers-whatsapp-O9hejQx6.js";
export {
  AcpRuntimeError,
  DEFAULT_ACCOUNT_ID,
  PAIRING_APPROVED_MESSAGE,
  TelegramConfigSchema,
  auditTelegramGroupMembership,
  buildChannelConfigSchema,
  buildTelegramExecApprovalPendingPayload,
  buildTokenChannelStatusSummary,
  clearAccountEntryFields,
  collectTelegramUnmentionedGroupIds,
  createForumTopicTelegram,
  createTelegramThreadBindingManager,
  deleteMessageTelegram,
  editForumTopicTelegram,
  editMessageReplyMarkupTelegram,
  editMessageTelegram,
  emptyPluginConfigSchema,
  formatPairingApproveHint,
  getChatChannelMeta,
  getTelegramThreadBindingManager,
  jsonResult,
  makeProxyFetch,
  monitorTelegramProvider,
  normalizeAccountId,
  parseTelegramTopicConversation,
  pinMessageTelegram,
  probeTelegram,
  projectCredentialSnapshotFields,
  reactMessageTelegram,
  readNumberParam,
  readReactionParams,
  readStringArrayParam,
  readStringOrNumberParam,
  readStringParam,
  renameForumTopicTelegram,
  resetTelegramThreadBindingsForTests,
  resolveConfiguredFromCredentialStatuses,
  resolvePollMaxSelections,
  resolveTelegramFetch,
  resolveTelegramPollVisibility,
  resolveTelegramRuntimeGroupPolicy,
  resolveTelegramToken,
  resolveTelegramTransport,
  sendMessageTelegram,
  sendPollTelegram,
  sendStickerTelegram,
  sendTypingTelegram,
  setTelegramRuntime,
  setTelegramThreadBindingIdleTimeoutBySessionKey,
  setTelegramThreadBindingMaxAgeBySessionKey,
  shouldRetryTelegramTransportFallback,
  shouldSuppressTelegramExecApprovalForwardingFallback,
  telegramMessageActions,
  unpinMessageTelegram,
};
