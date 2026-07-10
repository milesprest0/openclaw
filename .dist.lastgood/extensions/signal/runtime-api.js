import { n as normalizeAccountId, t as DEFAULT_ACCOUNT_ID } from "../../account-id-BGKP_Par.js";
import {
  i as resolveSignalAccount,
  n as listSignalAccountIds,
  r as resolveDefaultSignalAccountId,
  t as listEnabledSignalAccounts,
} from "../../accounts-D_lQP4AN.js";
import { a as chunkText } from "../../chunk-aBEwc7QQ.js";
import { t as formatCliCommand } from "../../command-format-yMavKibC.js";
import {
  n as deleteAccountFromConfigSection,
  r as setAccountEnabledInConfigSection,
} from "../../config-helpers-DSIf-D9t.js";
import { r as emptyPluginConfigSchema } from "../../config-schema--9UsXYRo.js";
import { r as buildChannelConfigSchema } from "../../config-schema-BPiFZhPG.js";
import { c as getChatChannelMeta } from "../../core-BCeD7oMO.js";
import { t as detectBinary } from "../../detect-binary-CYx-AdR4.js";
import "../../text-runtime-lKuAtsoz.js";
import { n as formatPairingApproveHint } from "../../helpers-BLJkDN4N.js";
import {
  d as looksLikeSignalTargetId,
  f as normalizeSignalMessagingTarget,
} from "../../identity-SjtKqjbq.js";
import { r as installSignalCli } from "../../install-signal-cli-DNvH6LuZ.js";
import { t as formatDocsLink } from "../../links-CNfoPWBd.js";
import { a as resolveChannelMediaMaxBytes } from "../../media-runtime-Cj72foO4.js";
import {
  n as resolveSignalReactionLevel,
  t as signalMessageActions,
} from "../../message-actions-DRVRGu6E.js";
import "../../setup-tools-DDTPMDaU.js";
import "../../reply-runtime-hpCIwmwh.js";
import { t as monitorSignalProvider } from "../../monitor-CwJqYH_w.js";
import { t as PAIRING_APPROVED_MESSAGE } from "../../pairing-message-DzMpS8d3.js";
import { t as probeSignal } from "../../probe-Bwwzx16R.js";
import "../../channel-status-BLgpG3VN.js";
import {
  n as sendReactionSignal,
  t as removeReactionSignal,
} from "../../reaction-runtime-api-DOA1HtxY.js";
import {
  n as resolveAllowlistProviderRuntimeGroupPolicy,
  r as resolveDefaultGroupPolicy,
} from "../../runtime-group-policy-CmVBQMdo.js";
import { t as createPluginRuntimeStore } from "../../runtime-store-Df1JvWZn.js";
import { t as sendMessageSignal } from "../../send-C89dSUdS.js";
import "../../config-api-w5Ce1Drz.js";
import {
  s as migrateBaseNameToDefaultAccount,
  t as applyAccountNameToChannelSection,
} from "../../setup-helpers-BWYI0iQf.js";
import {
  c as collectStatusIssuesFromLastError,
  d as createDefaultChannelRuntimeState,
  n as buildBaseChannelStatusSummary,
  t as buildBaseAccountStatusSnapshot,
} from "../../status-helpers-SQEITAo1.js";
import { l as normalizeE164 } from "../../utils-BGRcpLKt.js";
import { o as SignalConfigSchema } from "../../zod-schema.providers-whatsapp-O9hejQx6.js";
//#region extensions/signal/src/runtime.ts
const { setRuntime: setSignalRuntime, clearRuntime: clearSignalRuntime } = createPluginRuntimeStore(
  {
    pluginId: "signal",
    errorMessage: "Signal runtime not initialized",
  },
);
//#endregion
export {
  DEFAULT_ACCOUNT_ID,
  PAIRING_APPROVED_MESSAGE,
  SignalConfigSchema,
  applyAccountNameToChannelSection,
  buildBaseAccountStatusSnapshot,
  buildBaseChannelStatusSummary,
  buildChannelConfigSchema,
  chunkText,
  collectStatusIssuesFromLastError,
  createDefaultChannelRuntimeState,
  deleteAccountFromConfigSection,
  detectBinary,
  emptyPluginConfigSchema,
  formatCliCommand,
  formatDocsLink,
  formatPairingApproveHint,
  getChatChannelMeta,
  installSignalCli,
  listEnabledSignalAccounts,
  listSignalAccountIds,
  looksLikeSignalTargetId,
  migrateBaseNameToDefaultAccount,
  monitorSignalProvider,
  normalizeAccountId,
  normalizeE164,
  normalizeSignalMessagingTarget,
  probeSignal,
  removeReactionSignal,
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveChannelMediaMaxBytes,
  resolveDefaultGroupPolicy,
  resolveDefaultSignalAccountId,
  resolveSignalAccount,
  resolveSignalReactionLevel,
  sendMessageSignal,
  sendReactionSignal,
  setAccountEnabledInConfigSection,
  setSignalRuntime,
  signalMessageActions,
};
