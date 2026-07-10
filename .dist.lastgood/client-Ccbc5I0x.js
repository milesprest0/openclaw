import {
  i as resolveMatrixConfigForAccount,
  n as resolveMatrixAuth,
  r as resolveMatrixAuthContext,
  t as backfillMatrixAuthDeviceIdAfterStartup,
} from "./config-HHHAstzN.js";
import { t as createMatrixClient } from "./create-client-7BQFdA6A.js";
import {
  i as resolveScopedMatrixEnvConfig,
  r as resolveMatrixEnvAuthReadiness,
  t as hasReadyMatrixEnvAuth,
} from "./env-auth-CkkG1Yqg.js";
import { t as getMatrixScopedEnvVarNames } from "./env-vars-BpOQ0Y9N.js";
import { t as isBunRuntime } from "./runtime-BKy1ze1L.js";
import {
  i as resolveSharedMatrixClient,
  n as releaseSharedClientInstance,
  o as stopSharedClientForAccount,
  r as removeSharedClientInstance,
  s as stopSharedClientInstance,
  t as acquireSharedMatrixClient,
} from "./shared-Dm7O4FiT.js";
import {
  n as validateMatrixHomeserverUrl,
  t as resolveValidatedMatrixHomeserverUrl,
} from "./url-validation-CQyhdjpI.js";
import "./client-BZL_DUpm.js";
export {
  acquireSharedMatrixClient,
  backfillMatrixAuthDeviceIdAfterStartup,
  createMatrixClient,
  getMatrixScopedEnvVarNames,
  hasReadyMatrixEnvAuth,
  isBunRuntime,
  releaseSharedClientInstance,
  removeSharedClientInstance,
  resolveMatrixAuth,
  resolveMatrixAuthContext,
  resolveMatrixConfigForAccount,
  resolveMatrixEnvAuthReadiness,
  resolveScopedMatrixEnvConfig,
  resolveSharedMatrixClient,
  resolveValidatedMatrixHomeserverUrl,
  stopSharedClientForAccount,
  stopSharedClientInstance,
  validateMatrixHomeserverUrl,
};
