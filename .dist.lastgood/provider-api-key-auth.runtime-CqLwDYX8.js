import {
  n as buildApiKeyCredential,
  t as applyAuthProfileConfig,
} from "./provider-auth-helpers-DWjbCNVf.js";
import {
  i as normalizeApiKeyInput,
  n as ensureApiKeyFromOptionEnvOrPrompt,
  s as validateApiKeyInput,
} from "./provider-auth-input-kX7gel6j.js";
import { t as applyPrimaryModel } from "./provider-model-primary-CapHfLfo.js";
//#region src/plugins/provider-api-key-auth.runtime.ts
const providerApiKeyAuthRuntime = {
  applyAuthProfileConfig,
  applyPrimaryModel,
  buildApiKeyCredential,
  ensureApiKeyFromOptionEnvOrPrompt,
  normalizeApiKeyInput,
  validateApiKeyInput,
};
//#endregion
export { providerApiKeyAuthRuntime };
