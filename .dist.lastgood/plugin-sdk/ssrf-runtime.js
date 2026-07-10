import { a as formatErrorMessage } from "../errors-DZMrVkYL.js";
import { n as fetchWithSsrFGuard } from "../fetch-guard-jcadyt5o.js";
import { o as isPrivateOrLoopbackHost } from "../net-BQYp2xgJ.js";
import {
  _ as ssrfPolicyFromHttpBaseUrlAllowedHostname,
  a as createPinnedDispatcher,
  c as isBlockedHostnameOrIp,
  g as resolvePinnedHostnameWithPolicy,
  h as resolvePinnedHostname,
  i as closeDispatcher,
  t as SsrFBlockedError,
  u as isPrivateIpAddress,
} from "../ssrf-DO8eIXaD.js";
import {
  c as migrateLegacyFlatAllowPrivateNetworkAlias,
  d as ssrfPolicyFromDangerouslyAllowPrivateNetwork,
  f as ssrfPolicyFromPrivateNetworkOptIn,
  i as hasLegacyFlatAllowPrivateNetworkAlias,
  n as buildHostnameAllowlistPolicyFromSuffixAllowlist,
  o as isPrivateNetworkOptInEnabled,
  r as createLegacyPrivateNetworkDoctorContract,
  s as mergeSsrFPolicies,
  t as assertHttpUrlTargetsPrivateNetwork,
  u as ssrfPolicyFromAllowPrivateNetwork,
} from "../ssrf-policy-CLYqev3x.js";
import "../ssrf-runtime-BhFjkd3c.js";
export {
  SsrFBlockedError,
  assertHttpUrlTargetsPrivateNetwork,
  buildHostnameAllowlistPolicyFromSuffixAllowlist,
  closeDispatcher,
  createLegacyPrivateNetworkDoctorContract,
  createPinnedDispatcher,
  fetchWithSsrFGuard,
  formatErrorMessage,
  hasLegacyFlatAllowPrivateNetworkAlias,
  isBlockedHostnameOrIp,
  isPrivateIpAddress,
  isPrivateNetworkOptInEnabled,
  isPrivateOrLoopbackHost,
  mergeSsrFPolicies,
  migrateLegacyFlatAllowPrivateNetworkAlias,
  resolvePinnedHostname,
  resolvePinnedHostnameWithPolicy,
  ssrfPolicyFromAllowPrivateNetwork,
  ssrfPolicyFromDangerouslyAllowPrivateNetwork,
  ssrfPolicyFromHttpBaseUrlAllowedHostname,
  ssrfPolicyFromPrivateNetworkOptIn,
};
