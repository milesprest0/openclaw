import {
  a as resolveMatrixDefaultOrOnlyAccountId,
  i as resolveMatrixChannelConfig,
  n as requiresExplicitMatrixDefaultAccount,
  r as resolveConfiguredMatrixAccountIds,
  t as findMatrixAccountEntry,
} from "../../account-selection-CNo6bQGN.js";
import { t as matrixPlugin } from "../../channel-CtrbLX2-.js";
import {
  n as listMatrixEnvAccountIds,
  r as resolveMatrixEnvAccountToken,
  t as getMatrixScopedEnvVarNames,
} from "../../env-vars-BpOQ0Y9N.js";
import {
  n as matrixSetupAdapter,
  t as createMatrixSetupWizardProxy,
} from "../../setup-core-BtIr1_RT.js";
import { t as matrixOnboardingAdapter } from "../../setup-surface-BRkAF4fa.js";
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
import { t as createMatrixThreadBindingManager } from "../../thread-bindings-D6jdN3Zx.js";
import {
  d as setMatrixThreadBindingIdleTimeoutBySessionKey,
  n as getMatrixThreadBindingManager,
  p as setMatrixThreadBindingMaxAgeBySessionKey,
  s as resetMatrixThreadBindingsForTests,
} from "../../thread-bindings-shared-DCVzLQMh.js";
//#region extensions/matrix/api.ts
const matrixSessionBindingAdapterChannels = ["matrix"];
//#endregion
export {
  createMatrixSetupWizardProxy,
  createMatrixThreadBindingManager,
  findMatrixAccountEntry,
  getMatrixScopedEnvVarNames,
  getMatrixThreadBindingManager,
  hashMatrixAccessToken,
  listMatrixEnvAccountIds,
  matrixOnboardingAdapter,
  matrixOnboardingAdapter as matrixSetupWizard,
  matrixPlugin,
  matrixSessionBindingAdapterChannels,
  matrixSetupAdapter,
  requiresExplicitMatrixDefaultAccount,
  resetMatrixThreadBindingsForTests,
  resolveConfiguredMatrixAccountIds,
  resolveMatrixAccountStorageRoot,
  resolveMatrixChannelConfig,
  resolveMatrixCredentialsDir,
  resolveMatrixCredentialsFilename,
  resolveMatrixCredentialsPath,
  resolveMatrixDefaultOrOnlyAccountId,
  resolveMatrixEnvAccountToken,
  resolveMatrixHomeserverKey,
  resolveMatrixLegacyFlatStoragePaths,
  resolveMatrixLegacyFlatStoreRoot,
  sanitizeMatrixPathSegment,
  setMatrixThreadBindingIdleTimeoutBySessionKey,
  setMatrixThreadBindingMaxAgeBySessionKey,
};
