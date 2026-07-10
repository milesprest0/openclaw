import { o as resolveRequiredHomeDir } from "../home-dir-iZwpu-40.js";
import { t as resolveEnvApiKey } from "../model-auth-env-BTZHFDkv.js";
import {
  _ as resolveOAuthApiKeyMarker,
  h as resolveNonEnvSecretRefApiKeyMarker,
  l as isKnownEnvApiKeyMarker,
  r as MINIMAX_OAUTH_MARKER,
  t as CUSTOM_LOCAL_AUTH_MARKER,
  u as isNonSecretApiKeyMarker,
} from "../model-auth-markers-CtsHE1k1.js";
import { r as normalizeApiKeyConfig } from "../models-config.providers.secrets-CquQMCVr.js";
import {
  n as normalizeSecretInput,
  t as normalizeOptionalSecretInput,
} from "../normalize-secret-input-B8M4cov-.js";
import { n as listProfilesForProvider } from "../profile-list-B8KC6zHZ.js";
import {
  a as upsertAuthProfile,
  o as upsertAuthProfileWithLock,
  r as removeProviderAuthProfilesWithLock,
} from "../profiles-B4Bcz6fY.js";
import { t as createProviderApiKeyAuthMethod } from "../provider-api-key-auth-Bt32jqgH.js";
import {
  a as DEFAULT_COPILOT_API_BASE_URL,
  c as isProviderApiKeyConfigured,
  d as resolveCopilotApiToken,
  f as resolveProviderAuthProfileApiKey,
  g as resolveOpenClawAgentDir,
  h as toFormUrlEncoded,
  i as COPILOT_USER_AGENT,
  l as isProviderAuthProfileConfigured,
  m as generatePkceVerifierChallenge,
  n as COPILOT_EDITOR_VERSION,
  o as buildCopilotIdeHeaders,
  p as generateHexPkceVerifierChallenge,
  r as COPILOT_GITHUB_API_VERSION,
  s as deriveCopilotApiBaseUrlFromToken,
  t as COPILOT_EDITOR_PLUGIN_VERSION,
  u as listUsableProviderAuthProfileIds,
} from "../provider-auth-D0H8jtwm.js";
import {
  i as writeOAuthCredentials,
  n as buildApiKeyCredential,
  r as upsertApiKeyProfile,
  t as applyAuthProfileConfig,
} from "../provider-auth-helpers-DWjbCNVf.js";
import {
  a as normalizeSecretInputModeInput,
  i as normalizeApiKeyInput,
  n as ensureApiKeyFromOptionEnvOrPrompt,
  r as formatApiKeyPreview,
  s as validateApiKeyInput,
  t as ensureApiKeyFromEnvOrPrompt,
} from "../provider-auth-input-kX7gel6j.js";
import { t as resolveSecretInputModeForEnvSelection } from "../provider-auth-mode-DkMt7nlo.js";
import { n as promptSecretRefForSetup } from "../provider-auth-ref-Bp_kITTG.js";
import { t as buildOauthProviderAuthResult } from "../provider-auth-result-BUtvWgsR.js";
import {
  n as validateAnthropicSetupToken,
  t as buildTokenProfileId,
} from "../provider-auth-token-C6AI0_h_.js";
import {
  i as omitEnvKeysCaseInsensitive,
  n as listKnownProviderAuthEnvVarNames,
} from "../provider-env-vars-DkmNxQP4.js";
import { l as resolveDefaultSecretProviderAlias } from "../ref-contract-PE7UucMZ.js";
import { n as suggestOAuthProfileIdForLegacyDefault } from "../repair-Dag1lBgW.js";
import {
  E as hasUsableOAuthCredential,
  M as CLAUDE_CLI_PROFILE_ID,
  N as CODEX_CLI_PROFILE_ID,
  O as readClaudeCliCredentialsCached,
  n as ensureAuthProfileStore,
  p as updateAuthProfileStoreWithLock,
  r as ensureAuthProfileStoreForLocalUpdate,
  w as DEFAULT_OAUTH_REFRESH_MARGIN_MS,
} from "../store-9hg03xJO.js";
import { o as coerceSecretRef, s as hasConfiguredSecretInput } from "../types.secrets-CaNC1eIn.js";
export {
  CLAUDE_CLI_PROFILE_ID,
  CODEX_CLI_PROFILE_ID,
  COPILOT_EDITOR_PLUGIN_VERSION,
  COPILOT_EDITOR_VERSION,
  COPILOT_GITHUB_API_VERSION,
  COPILOT_USER_AGENT,
  CUSTOM_LOCAL_AUTH_MARKER,
  DEFAULT_COPILOT_API_BASE_URL,
  DEFAULT_OAUTH_REFRESH_MARGIN_MS,
  MINIMAX_OAUTH_MARKER,
  applyAuthProfileConfig,
  buildApiKeyCredential,
  buildCopilotIdeHeaders,
  buildOauthProviderAuthResult,
  buildTokenProfileId,
  coerceSecretRef,
  createProviderApiKeyAuthMethod,
  deriveCopilotApiBaseUrlFromToken,
  ensureApiKeyFromEnvOrPrompt,
  ensureApiKeyFromOptionEnvOrPrompt,
  ensureAuthProfileStore,
  ensureAuthProfileStoreForLocalUpdate,
  formatApiKeyPreview,
  generateHexPkceVerifierChallenge,
  generatePkceVerifierChallenge,
  hasConfiguredSecretInput,
  hasUsableOAuthCredential,
  isKnownEnvApiKeyMarker,
  isNonSecretApiKeyMarker,
  isProviderApiKeyConfigured,
  isProviderAuthProfileConfigured,
  listKnownProviderAuthEnvVarNames,
  listProfilesForProvider,
  listUsableProviderAuthProfileIds,
  normalizeApiKeyConfig,
  normalizeApiKeyInput,
  normalizeOptionalSecretInput,
  normalizeSecretInput,
  normalizeSecretInputModeInput,
  omitEnvKeysCaseInsensitive,
  promptSecretRefForSetup,
  readClaudeCliCredentialsCached,
  removeProviderAuthProfilesWithLock,
  resolveCopilotApiToken,
  resolveDefaultSecretProviderAlias,
  resolveEnvApiKey,
  resolveNonEnvSecretRefApiKeyMarker,
  resolveOAuthApiKeyMarker,
  resolveOpenClawAgentDir,
  resolveProviderAuthProfileApiKey,
  resolveRequiredHomeDir,
  resolveSecretInputModeForEnvSelection,
  suggestOAuthProfileIdForLegacyDefault,
  toFormUrlEncoded,
  updateAuthProfileStoreWithLock,
  upsertApiKeyProfile,
  upsertAuthProfile,
  upsertAuthProfileWithLock,
  validateAnthropicSetupToken,
  validateApiKeyInput,
  writeOAuthCredentials,
};
