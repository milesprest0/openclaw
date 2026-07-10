import {
  a as resolveMatrixDefaultOrOnlyAccountId,
  i as resolveMatrixChannelConfig,
  n as requiresExplicitMatrixDefaultAccount,
  o as resolveMatrixAccountStringValues,
  r as resolveConfiguredMatrixAccountIds,
  t as findMatrixAccountEntry,
} from "../../account-selection-CNo6bQGN.js";
import { n as ensureMatrixSdkInstalled, r as isMatrixSdkAvailable } from "../../deps-CSz6o0Ol.js";
import {
  n as listMatrixEnvAccountIds,
  r as resolveMatrixEnvAccountToken,
  t as getMatrixScopedEnvVarNames,
} from "../../env-vars-BpOQ0Y9N.js";
import { n as formatZonedTimestamp } from "../../format-datetime-Cd0s8Nxm.js";
import "../../ssrf-runtime-BhFjkd3c.js";
import { i as writeJsonFileAtomically } from "../../json-store-C6iFE4qW.js";
import { r as setMatrixRuntime } from "../../runtime-Brjuvs-E.js";
import {
  a as createPinnedDispatcher,
  g as resolvePinnedHostnameWithPolicy,
  i as closeDispatcher,
} from "../../ssrf-DO8eIXaD.js";
import {
  d as ssrfPolicyFromDangerouslyAllowPrivateNetwork,
  t as assertHttpUrlTargetsPrivateNetwork,
  u as ssrfPolicyFromAllowPrivateNetwork,
} from "../../ssrf-policy-CLYqev3x.js";
import {
  a as resolveMatrixCredentialsPath,
  c as resolveMatrixLegacyFlatStoreRoot,
  i as resolveMatrixCredentialsFilename,
  l as sanitizeMatrixPathSegment,
  n as resolveMatrixAccountStorageRoot,
  o as resolveMatrixHomeserverKey,
  r as resolveMatrixCredentialsDir,
  s as resolveMatrixLegacyFlatStoragePaths,
  t as hashMatrixAccessToken,
} from "../../storage-paths-ChdU6Z1j.js";
import {
  d as setMatrixThreadBindingIdleTimeoutBySessionKey,
  p as setMatrixThreadBindingMaxAgeBySessionKey,
} from "../../thread-bindings-shared-DCVzLQMh.js";
//#region extensions/matrix/runtime-api.ts
function chunkTextForOutbound(text, limit) {
  const chunks = [];
  let remaining = text;
  while (remaining.length > limit) {
    const window = remaining.slice(0, limit);
    const splitAt = Math.max(window.lastIndexOf("\n"), window.lastIndexOf(" "));
    const breakAt = splitAt > 0 ? splitAt : limit;
    chunks.push(remaining.slice(0, breakAt).trimEnd());
    remaining = remaining.slice(breakAt).trimStart();
  }
  if (remaining.length > 0 || text.length === 0) chunks.push(remaining);
  return chunks;
}
//#endregion
export {
  assertHttpUrlTargetsPrivateNetwork,
  chunkTextForOutbound,
  closeDispatcher,
  createPinnedDispatcher,
  ensureMatrixSdkInstalled,
  findMatrixAccountEntry,
  formatZonedTimestamp,
  getMatrixScopedEnvVarNames,
  hashMatrixAccessToken,
  isMatrixSdkAvailable,
  listMatrixEnvAccountIds,
  requiresExplicitMatrixDefaultAccount,
  resolveConfiguredMatrixAccountIds,
  resolveMatrixAccountStorageRoot,
  resolveMatrixAccountStringValues,
  resolveMatrixChannelConfig,
  resolveMatrixCredentialsDir,
  resolveMatrixCredentialsFilename,
  resolveMatrixCredentialsPath,
  resolveMatrixDefaultOrOnlyAccountId,
  resolveMatrixEnvAccountToken,
  resolveMatrixHomeserverKey,
  resolveMatrixLegacyFlatStoragePaths,
  resolveMatrixLegacyFlatStoreRoot,
  resolvePinnedHostnameWithPolicy,
  sanitizeMatrixPathSegment,
  setMatrixRuntime,
  setMatrixThreadBindingIdleTimeoutBySessionKey,
  setMatrixThreadBindingMaxAgeBySessionKey,
  ssrfPolicyFromAllowPrivateNetwork,
  ssrfPolicyFromDangerouslyAllowPrivateNetwork,
  writeJsonFileAtomically,
};
