import { t as DEFAULT_ACCOUNT_ID } from "../../account-id-BGKP_Par.js";
import { i as resolveIMessageAccount } from "../../accounts-BAZkARPH.js";
import { p as formatTrimmedAllowFromEntries } from "../../channel-config-helpers-DVht29vx.js";
import { r as buildChannelConfigSchema } from "../../config-schema-BPiFZhPG.js";
import { c as getChatChannelMeta } from "../../core-BCeD7oMO.js";
import {
  n as resolveIMessageGroupToolPolicy,
  r as imessageMessageActions,
  t as resolveIMessageGroupRequireMention,
} from "../../group-policy-wISQ36Or.js";
import { a as resolveChannelMediaMaxBytes } from "../../media-runtime-Cj72foO4.js";
import { n as sendMessageIMessage, t as monitorIMessageProvider } from "../../monitor-CUEfmuTc.js";
import { t as PAIRING_APPROVED_MESSAGE } from "../../pairing-message-DzMpS8d3.js";
import { t as probeIMessage } from "../../probe-JOVG8hRm.js";
import "../../channel-status-BLgpG3VN.js";
import { t as createPluginRuntimeStore } from "../../runtime-store-Df1JvWZn.js";
import {
  o as looksLikeIMessageTargetId,
  s as normalizeIMessageMessagingTarget,
} from "../../sanitize-outbound-CHQ-Gh9b.js";
import {
  c as collectStatusIssuesFromLastError,
  r as buildComputedAccountStatusSnapshot,
} from "../../status-helpers-SQEITAo1.js";
import { t as chunkTextForOutbound } from "../../text-chunking--YCa2npP.js";
import "../../config-api-BbfkCLP7.js";
import { i as IMessageConfigSchema } from "../../zod-schema.providers-whatsapp-O9hejQx6.js";
//#region extensions/imessage/src/config-accessors.ts
function resolveIMessageConfigAllowFrom(params) {
  return (resolveIMessageAccount(params).config.allowFrom ?? []).map((entry) => String(entry));
}
function resolveIMessageConfigDefaultTo(params) {
  const defaultTo = resolveIMessageAccount(params).config.defaultTo;
  if (defaultTo == null) return;
  return defaultTo.trim() || void 0;
}
//#endregion
//#region extensions/imessage/src/runtime.ts
const { setRuntime: setIMessageRuntime } = createPluginRuntimeStore({
  pluginId: "imessage",
  errorMessage: "iMessage runtime not initialized",
});
//#endregion
export {
  DEFAULT_ACCOUNT_ID,
  IMessageConfigSchema,
  PAIRING_APPROVED_MESSAGE,
  buildChannelConfigSchema,
  buildComputedAccountStatusSnapshot,
  chunkTextForOutbound,
  collectStatusIssuesFromLastError,
  formatTrimmedAllowFromEntries,
  getChatChannelMeta,
  imessageMessageActions,
  looksLikeIMessageTargetId,
  monitorIMessageProvider,
  normalizeIMessageMessagingTarget,
  probeIMessage,
  resolveChannelMediaMaxBytes,
  resolveIMessageConfigAllowFrom,
  resolveIMessageConfigDefaultTo,
  resolveIMessageGroupRequireMention,
  resolveIMessageGroupToolPolicy,
  sendMessageIMessage,
  setIMessageRuntime,
};
