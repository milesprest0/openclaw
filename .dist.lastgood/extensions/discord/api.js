import { t as inspectDiscordAccount } from "../../account-inspect-BuHX2gS-.js";
import {
  a as mergeDiscordAccountConfig,
  f as resolveDiscordMaxLinesPerMessage,
  i as listEnabledDiscordAccounts,
  l as resolveDiscordAccountConfig,
  o as resolveDefaultDiscordAccountId,
  r as listDiscordAccountIds,
  s as resolveDiscordAccount,
  t as createDiscordActionGate,
} from "../../accounts-Ctry1Kkb.js";
import {
  n as fetchDiscord,
  r as requestDiscord,
  t as DiscordApiError,
} from "../../api-CBB6yRJS.js";
import {
  a as shouldSuppressLocalDiscordExecApprovalPrompt,
  i as isDiscordExecApprovalClientEnabled,
  n as getDiscordExecApprovalApprovers,
  r as isDiscordExecApprovalApprover,
} from "../../approval-shared-vFvzyV_H.js";
import {
  i as resolveDiscordGroupToolPolicy,
  n as collectDiscordStatusIssues,
  r as resolveDiscordGroupRequireMention,
  t as discordPlugin,
} from "../../channel-D1RhczUq.js";
import { t as discordSetupPlugin } from "../../channel.setup-BR7vGtBo.js";
import {
  a as buildDiscordComponentMessageFlags,
  c as resolveDiscordComponentAttachmentName,
  d as buildDiscordComponentCustomId,
  f as buildDiscordModalCustomId,
  g as parseDiscordModalCustomIdForInteraction,
  h as parseDiscordModalCustomId,
  i as buildDiscordComponentMessage,
  l as DISCORD_COMPONENT_CUSTOM_ID_KEY,
  m as parseDiscordComponentCustomIdForInteraction,
  n as DiscordFormModal,
  o as DISCORD_COMPONENT_ATTACHMENT_PREFIX,
  p as parseDiscordComponentCustomId,
  r as createDiscordFormModal,
  s as readDiscordComponentSpec,
  t as formatDiscordComponentEventText,
  u as DISCORD_MODAL_CUSTOM_ID_KEY,
} from "../../components-3cQwWQpX.js";
import {
  n as listDiscordDirectoryPeersFromConfig,
  t as listDiscordDirectoryGroupsFromConfig,
} from "../../directory-config-BMAtJDb1.js";
import "../../targets-Ch0ooyYn.js";
import { t as tryHandleDiscordMessageActionGuildAdmin } from "../../handle-action.guild-admin-BEcLwpFr.js";
import {
  i as normalizeDiscordOutboundTarget,
  n as looksLikeDiscordTargetId,
  o as parseDiscordTarget,
  r as normalizeDiscordMessagingTarget,
  s as resolveDiscordChannelId,
} from "../../normalize-CwaFR3SN.js";
import { t as fetchPluralKitMessageInfo } from "../../pluralkit-Bw_McKxM.js";
import {
  a as resolveDiscordPrivilegedIntentsFromFlags,
  i as probeDiscord,
  n as fetchDiscordApplicationSummary,
  r as parseApplicationIdFromToken,
  t as fetchDiscordApplicationId,
} from "../../probe-C9hRGOwK.js";
import { i as resolveOpenProviderRuntimeGroupPolicy } from "../../runtime-group-policy-CmVBQMdo.js";
import { t as collectDiscordSecurityAuditFindings } from "../../security-audit-CHffWiZ_.js";
import {
  A as resolveDiscordTarget,
  j as parseDiscordSendTarget,
} from "../../send.shared-DW2ozbKR.js";
import { t as normalizeExplicitDiscordSessionKey } from "../../session-key-normalization-DTWQiNM2.js";
import { t as buildDiscordInteractiveComponents } from "../../shared-interactive-acA724sq.js";
import {
  n as handleDiscordSubagentEnded,
  r as handleDiscordSubagentSpawning,
  t as handleDiscordSubagentDeliveryTarget,
} from "../../subagent-hooks-hLxml8Ao.js";
import {
  a as mergeAbortSignals,
  i as DISCORD_DEFAULT_LISTENER_TIMEOUT_MS,
  n as DISCORD_ATTACHMENT_TOTAL_TIMEOUT_MS,
  r as DISCORD_DEFAULT_INBOUND_WORKER_TIMEOUT_MS,
  t as DISCORD_ATTACHMENT_IDLE_TIMEOUT_MS,
} from "../../timeouts-B4h4bmv9.js";
//#region extensions/discord/api.ts
const handleDiscordMessageAction = async (...args) =>
  (await import("../../channel-actions.runtime-BJUp2-e_.js")).handleDiscordMessageAction(...args);
//#endregion
export {
  DISCORD_ATTACHMENT_IDLE_TIMEOUT_MS,
  DISCORD_ATTACHMENT_TOTAL_TIMEOUT_MS,
  DISCORD_COMPONENT_ATTACHMENT_PREFIX,
  DISCORD_COMPONENT_CUSTOM_ID_KEY,
  DISCORD_DEFAULT_INBOUND_WORKER_TIMEOUT_MS,
  DISCORD_DEFAULT_LISTENER_TIMEOUT_MS,
  DISCORD_MODAL_CUSTOM_ID_KEY,
  DiscordApiError,
  DiscordFormModal,
  buildDiscordComponentCustomId,
  buildDiscordComponentMessage,
  buildDiscordComponentMessageFlags,
  buildDiscordInteractiveComponents,
  buildDiscordModalCustomId,
  collectDiscordSecurityAuditFindings,
  collectDiscordStatusIssues,
  createDiscordActionGate,
  createDiscordFormModal,
  discordPlugin,
  discordSetupPlugin,
  fetchDiscord,
  fetchDiscordApplicationId,
  fetchDiscordApplicationSummary,
  fetchPluralKitMessageInfo,
  formatDiscordComponentEventText,
  getDiscordExecApprovalApprovers,
  handleDiscordMessageAction,
  handleDiscordSubagentDeliveryTarget,
  handleDiscordSubagentEnded,
  handleDiscordSubagentSpawning,
  inspectDiscordAccount,
  isDiscordExecApprovalApprover,
  isDiscordExecApprovalClientEnabled,
  listDiscordAccountIds,
  listDiscordDirectoryGroupsFromConfig,
  listDiscordDirectoryPeersFromConfig,
  listEnabledDiscordAccounts,
  looksLikeDiscordTargetId,
  mergeAbortSignals,
  mergeDiscordAccountConfig,
  normalizeDiscordMessagingTarget,
  normalizeDiscordOutboundTarget,
  normalizeExplicitDiscordSessionKey,
  parseApplicationIdFromToken,
  parseDiscordComponentCustomId,
  parseDiscordComponentCustomIdForInteraction as parseDiscordComponentCustomIdForCarbon,
  parseDiscordComponentCustomIdForInteraction,
  parseDiscordModalCustomId,
  parseDiscordModalCustomIdForInteraction as parseDiscordModalCustomIdForCarbon,
  parseDiscordModalCustomIdForInteraction,
  parseDiscordSendTarget,
  parseDiscordTarget,
  probeDiscord,
  readDiscordComponentSpec,
  requestDiscord,
  resolveDefaultDiscordAccountId,
  resolveDiscordAccount,
  resolveDiscordAccountConfig,
  resolveDiscordChannelId,
  resolveDiscordComponentAttachmentName,
  resolveDiscordGroupRequireMention,
  resolveDiscordGroupToolPolicy,
  resolveDiscordMaxLinesPerMessage,
  resolveDiscordPrivilegedIntentsFromFlags,
  resolveOpenProviderRuntimeGroupPolicy as resolveDiscordRuntimeGroupPolicy,
  resolveDiscordTarget,
  shouldSuppressLocalDiscordExecApprovalPrompt,
  tryHandleDiscordMessageActionGuildAdmin,
};
