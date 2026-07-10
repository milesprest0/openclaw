import { n as normalizeAccountId } from "../account-id-BGKP_Par.js";
import {
  a as mapAllowlistResolutionInputs,
  n as formatNormalizedAllowFromEntries,
  t as formatAllowFromLowercase,
} from "../allow-from-BNON_Q4N.js";
import {
  a as createHybridChannelConfigBase,
  c as createScopedChannelConfigBase,
  d as createTopLevelChannelConfigBase,
  i as createHybridChannelConfigAdapter,
  l as createScopedDmSecurityResolver,
  m as mapAllowFromEntries,
  o as createScopedAccountConfigAccessors,
  s as createScopedChannelConfigAdapter,
  u as createTopLevelChannelConfigAdapter,
} from "../channel-config-helpers-DVht29vx.js";
import { t as createAccountStatusSink } from "../channel-lifecycle.core-8qluSzTD.js";
import {
  C as createOpenProviderGroupPolicyWarningCollector,
  D as projectConfigWarningCollector,
  E as projectConfigAccountIdWarningCollector,
  O as projectWarningCollector,
  S as createOpenProviderConfiguredRouteWarningCollector,
  T as projectAccountWarningCollector,
  _ as createAllowlistProviderOpenWarningCollector,
  a as buildOpenGroupPolicyConfigureRouteAllowlistWarning,
  b as createConditionalWarningCollector,
  c as collectAllowlistProviderGroupPolicyWarnings,
  d as collectOpenGroupPolicyRestrictSendersWarnings,
  f as collectOpenGroupPolicyRouteAllowlistWarnings,
  g as createAllowlistProviderGroupPolicyWarningCollector,
  h as composeWarningCollectors,
  i as normalizeAllowFromList,
  l as collectAllowlistProviderRestrictSendersWarnings,
  m as composeAccountWarningCollectors,
  n as createDangerousNameMatchingMutableAllowlistWarningCollector,
  o as buildOpenGroupPolicyRestrictSendersWarning,
  p as collectOpenProviderGroupPolicyWarnings,
  r as createRestrictSendersChannelSecurity,
  s as buildOpenGroupPolicyWarning,
  t as coerceNativeSetting,
  u as collectOpenGroupPolicyConfiguredRouteWarnings,
  v as createAllowlistProviderRestrictSendersWarningCollector,
  w as projectAccountConfigWarningCollector,
  x as createOpenGroupPolicyRestrictSendersWarningCollector,
  y as createAllowlistProviderRouteAllowlistWarningCollector,
} from "../channel-policy-y8E9wmaa.js";
import { n as resolveControlCommandGate } from "../command-gating-BAZRoOCR.js";
import { r as emptyPluginConfigSchema } from "../config-schema--9UsXYRo.js";
import {
  a as buildNestedDmConfigSchema,
  i as buildJsonChannelConfigSchema,
  n as buildCatchallMultiAccountChannelSchema,
  r as buildChannelConfigSchema,
  t as AllowFromListSchema,
} from "../config-schema-BPiFZhPG.js";
import {
  n as delegateCompactionToRuntime,
  t as buildMemorySystemPromptAddition,
} from "../delegate-Bl1cR2e_.js";
import { o as onDiagnosticEvent } from "../diagnostic-events-9isI4hMq.js";
import "../temp-path-DRiyUI5S.js";
import {
  a as listDirectoryEntriesFromSources,
  c as listDirectoryUserEntriesFromAllowFrom,
  d as listResolvedDirectoryEntriesFromSources,
  f as listResolvedDirectoryGroupEntriesFromMapKeys,
  i as createResolvedDirectoryEntriesLister,
  l as listDirectoryUserEntriesFromAllowFromAndMapKeys,
  m as toDirectoryEntries,
  n as collectNormalizedDirectoryIds,
  o as listDirectoryGroupEntriesFromMapKeys,
  p as listResolvedDirectoryUserEntriesFromAllowFrom,
  r as createInspectedDirectoryEntriesLister,
  s as listDirectoryGroupEntriesFromMapKeysAndAllowFrom,
  t as applyDirectoryQueryAndLimit,
  u as listInspectedDirectoryEntriesFromSources,
} from "../directory-config-helpers-3wMHaUCs.js";
import {
  i as nullChannelDirectorySelf,
  n as createEmptyChannelDirectoryAdapter,
  r as emptyChannelDirectoryList,
  t as createChannelDirectoryAdapter,
} from "../directory-runtime-B764p6cP.js";
import {
  a as resolveDmGroupAccessWithCommandGate,
  c as resolveOpenDmAllowlistAccess,
  n as readStoreAllowFromForDmPolicy,
  o as resolveDmGroupAccessWithLists,
  s as resolveEffectiveAllowFromLists,
  t as DM_GROUP_ACCESS_REASON,
} from "../dm-policy-shared-COpbJNwP.js";
import {
  a as resolveSenderScopedGroupPolicy,
  i as evaluateSenderGroupAccessForPolicy,
  t as evaluateGroupRouteAccessForPolicy,
} from "../group-access-CdIgeyPS.js";
import {
  i as resolveToolsBySender,
  n as resolveChannelGroupRequireMention,
  r as resolveChannelGroupToolsPolicy,
  t as resolveChannelGroupPolicy,
} from "../group-policy-DuzLZrql.js";
import { t as buildAccountScopedDmSecurityPolicy } from "../helpers-BLJkDN4N.js";
import {
  a as buildHistoryContextFromMap,
  c as clearHistoryEntriesIfEnabled,
  d as recordPendingHistoryEntryIfEnabled,
  i as buildHistoryContextFromEntries,
  l as evictOldHistoryKeys,
  n as HISTORY_CONTEXT_MARKER,
  o as buildPendingHistoryContextFromMap,
  r as buildHistoryContext,
  s as clearHistoryEntries,
  t as DEFAULT_GROUP_HISTORY_LIMIT,
  u as recordPendingHistoryEntry,
} from "../history-CiK0qvRj.js";
import { t as KeyedAsyncQueue } from "../keyed-async-queue-CKWHZK1l.js";
import {
  i as writeOAuthCredentials,
  n as buildApiKeyCredential,
  r as upsertApiKeyProfile,
  t as applyAuthProfileConfig,
} from "../provider-auth-helpers-DWjbCNVf.js";
import { t as inspectReadOnlyChannelAccount } from "../read-only-account-inspect-BHBr3X3O.js";
import "../channel-reply-core-6nsO9OCs.js";
import { n as registerContextEngine } from "../registry-sQP5dNFn.js";
import {
  n as resolveChannelSourceReplyDeliveryMode$1,
  t as createChannelReplyPipeline$1,
} from "../reply-pipeline-BZPcIR_E.js";
import {
  n as createReplyPrefixOptions$1,
  t as createReplyPrefixContext$1,
} from "../reply-prefix-B_htGII3.js";
import "../channel-config-schema-Bi-kEWa4.js";
import { t as createRuntimeDirectoryLiveAdapter } from "../runtime-forwarders-zg2wxLcy.js";
import { t as createPluginRuntimeStore } from "../runtime-store-Df1JvWZn.js";
import { n as resolvePreferredOpenClawTmpDir } from "../tmp-openclaw-dir-B4r8YQhH.js";
import "../reply-history-BYCu-BJA.js";
import { i as stringEnum, r as optionalStringEnum } from "../typebox-DifzaH7c.js";
import { t as createTypingCallbacks$1 } from "../typing-Cye5G_6W.js";
import { l as ToolPolicySchema } from "../zod-schema.agent-runtime-8YQcymYE.js";
import {
  I as requireAllowlistAllowFrom,
  L as requireOpenAllowFrom,
  a as DmConfigSchema,
  b as ReplyRuntimeConfigSchemaShape,
  h as MarkdownConfigSchema,
  i as ContextVisibilityModeSchema,
  l as GroupPolicySchema,
  n as BlockStreamingCoalesceSchema,
  o as DmPolicySchema,
} from "../zod-schema.core-CkFaNmbg.js";
//#region src/plugin-sdk/compat.ts
/**
 * @deprecated Legacy compat surface for external plugins that still depend on
 * older broad plugin-sdk imports. Use focused openclaw/plugin-sdk subpaths
 * instead.
 */
if (
  process.env.VITEST !== "true" &&
  process.env.OPENCLAW_SUPPRESS_PLUGIN_SDK_COMPAT_WARNING !== "1"
)
  process.emitWarning(
    "openclaw/plugin-sdk/compat is deprecated for new plugins. Migrate to focused openclaw/plugin-sdk/<subpath> imports. See https://docs.openclaw.ai/plugins/sdk-migration",
    {
      code: "OPENCLAW_PLUGIN_SDK_COMPAT_DEPRECATED",
      detail:
        "Bundled plugins must use scoped plugin-sdk subpaths. External plugins may keep compat temporarily while migrating. Migration guide: https://docs.openclaw.ai/plugins/sdk-migration",
    },
  );
/** @deprecated Use `openclaw/plugin-sdk/channel-message`. */
const createChannelReplyPipeline = createChannelReplyPipeline$1;
/** @deprecated Use `openclaw/plugin-sdk/channel-message`. */
const createReplyPrefixContext = createReplyPrefixContext$1;
/** @deprecated Use `openclaw/plugin-sdk/channel-message`. */
const createReplyPrefixOptions = createReplyPrefixOptions$1;
/** @deprecated Use `openclaw/plugin-sdk/channel-message`. */
const createTypingCallbacks = createTypingCallbacks$1;
/** @deprecated Use `openclaw/plugin-sdk/channel-message`. */
const resolveChannelSourceReplyDeliveryMode = resolveChannelSourceReplyDeliveryMode$1;
//#endregion
export {
  AllowFromListSchema,
  BlockStreamingCoalesceSchema,
  ContextVisibilityModeSchema,
  DEFAULT_GROUP_HISTORY_LIMIT,
  DM_GROUP_ACCESS_REASON,
  DmConfigSchema,
  DmPolicySchema,
  GroupPolicySchema,
  HISTORY_CONTEXT_MARKER,
  KeyedAsyncQueue,
  MarkdownConfigSchema,
  ReplyRuntimeConfigSchemaShape,
  ToolPolicySchema,
  applyAuthProfileConfig,
  applyDirectoryQueryAndLimit,
  buildAccountScopedDmSecurityPolicy,
  buildApiKeyCredential,
  buildCatchallMultiAccountChannelSchema,
  buildChannelConfigSchema,
  buildHistoryContext,
  buildHistoryContextFromEntries,
  buildHistoryContextFromMap,
  buildJsonChannelConfigSchema,
  buildMemorySystemPromptAddition,
  buildNestedDmConfigSchema,
  buildOpenGroupPolicyConfigureRouteAllowlistWarning,
  buildOpenGroupPolicyRestrictSendersWarning,
  buildOpenGroupPolicyWarning,
  buildPendingHistoryContextFromMap,
  clearHistoryEntries,
  clearHistoryEntriesIfEnabled,
  coerceNativeSetting,
  collectAllowlistProviderGroupPolicyWarnings,
  collectAllowlistProviderRestrictSendersWarnings,
  collectNormalizedDirectoryIds,
  collectOpenGroupPolicyConfiguredRouteWarnings,
  collectOpenGroupPolicyRestrictSendersWarnings,
  collectOpenGroupPolicyRouteAllowlistWarnings,
  collectOpenProviderGroupPolicyWarnings,
  composeAccountWarningCollectors,
  composeWarningCollectors,
  createAccountStatusSink,
  createAllowlistProviderGroupPolicyWarningCollector,
  createAllowlistProviderOpenWarningCollector,
  createAllowlistProviderRestrictSendersWarningCollector,
  createAllowlistProviderRouteAllowlistWarningCollector,
  createChannelDirectoryAdapter,
  createChannelReplyPipeline,
  createConditionalWarningCollector,
  createDangerousNameMatchingMutableAllowlistWarningCollector,
  createEmptyChannelDirectoryAdapter,
  createHybridChannelConfigAdapter,
  createHybridChannelConfigBase,
  createInspectedDirectoryEntriesLister,
  createOpenGroupPolicyRestrictSendersWarningCollector,
  createOpenProviderConfiguredRouteWarningCollector,
  createOpenProviderGroupPolicyWarningCollector,
  createPluginRuntimeStore,
  createReplyPrefixContext,
  createReplyPrefixOptions,
  createResolvedDirectoryEntriesLister,
  createRestrictSendersChannelSecurity,
  createRuntimeDirectoryLiveAdapter,
  createScopedAccountConfigAccessors,
  createScopedChannelConfigAdapter,
  createScopedChannelConfigBase,
  createScopedDmSecurityResolver,
  createTopLevelChannelConfigAdapter,
  createTopLevelChannelConfigBase,
  createTypingCallbacks,
  delegateCompactionToRuntime,
  emptyChannelDirectoryList,
  emptyPluginConfigSchema,
  evaluateGroupRouteAccessForPolicy,
  evaluateSenderGroupAccessForPolicy,
  evictOldHistoryKeys,
  formatAllowFromLowercase,
  formatNormalizedAllowFromEntries,
  inspectReadOnlyChannelAccount,
  listDirectoryEntriesFromSources,
  listDirectoryGroupEntriesFromMapKeys,
  listDirectoryGroupEntriesFromMapKeysAndAllowFrom,
  listDirectoryUserEntriesFromAllowFrom,
  listDirectoryUserEntriesFromAllowFromAndMapKeys,
  listInspectedDirectoryEntriesFromSources,
  listResolvedDirectoryEntriesFromSources,
  listResolvedDirectoryGroupEntriesFromMapKeys,
  listResolvedDirectoryUserEntriesFromAllowFrom,
  mapAllowFromEntries,
  mapAllowlistResolutionInputs,
  normalizeAccountId,
  normalizeAllowFromList,
  nullChannelDirectorySelf,
  onDiagnosticEvent,
  optionalStringEnum,
  projectAccountConfigWarningCollector,
  projectAccountWarningCollector,
  projectConfigAccountIdWarningCollector,
  projectConfigWarningCollector,
  projectWarningCollector,
  readStoreAllowFromForDmPolicy,
  recordPendingHistoryEntry,
  recordPendingHistoryEntryIfEnabled,
  registerContextEngine,
  requireAllowlistAllowFrom,
  requireOpenAllowFrom,
  resolveChannelGroupPolicy,
  resolveChannelGroupRequireMention,
  resolveChannelGroupToolsPolicy,
  resolveChannelSourceReplyDeliveryMode,
  resolveControlCommandGate,
  resolveDmGroupAccessWithCommandGate,
  resolveDmGroupAccessWithLists,
  resolveEffectiveAllowFromLists,
  resolveOpenDmAllowlistAccess,
  resolvePreferredOpenClawTmpDir,
  resolveSenderScopedGroupPolicy,
  resolveToolsBySender,
  stringEnum,
  toDirectoryEntries,
  upsertApiKeyProfile,
  writeOAuthCredentials,
};
