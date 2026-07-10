import { r as normalizeProviderId } from "./provider-id-CG9pXYPs.js";
import { o as getModelProviderHint } from "./provider-model-shared-CmD-CscC.js";
import { f as readStringValue } from "./string-coerce-BdEutqX5.js";
import "./provider-tools-Br0qcNYr.js";
import "./text-runtime-lKuAtsoz.js";
import "./model-definitions-DAyHCwkm.js";
import "./provider-catalog-Dku39SnU.js";
import "./onboard-DP_hI7f6.js";
import "./image-generation-provider-B78TsvxQ.js";
import "./runtime-model-compat-BWoTtLX4.js";
import "./provider-models-0X11lDxR.js";
//#region extensions/xai/api.ts
const XAI_NATIVE_ENDPOINT_HOSTS = new Set(["api.x.ai", "api.grok.x.ai"]);
function resolveHostname(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return;
  }
}
function isXaiNativeEndpoint(baseUrl) {
  return (
    typeof baseUrl === "string" && XAI_NATIVE_ENDPOINT_HOSTS.has(resolveHostname(baseUrl) ?? "")
  );
}
function isXaiModelHint(modelId) {
  return getModelProviderHint(modelId) === "x-ai";
}
function shouldUseXaiResponsesTransport(params) {
  if (params.api !== "openai-completions") return false;
  if (isXaiNativeEndpoint(params.baseUrl)) return true;
  return normalizeProviderId(params.provider) === "xai" && !params.baseUrl;
}
function shouldContributeXaiCompat(params) {
  if (params.model.api !== "openai-completions") return false;
  return isXaiNativeEndpoint(params.model.baseUrl) || isXaiModelHint(params.modelId);
}
function resolveXaiTransport(params) {
  if (!shouldUseXaiResponsesTransport(params)) return;
  return {
    api: "openai-responses",
    baseUrl: readStringValue(params.baseUrl),
  };
}
function resolveXaiBaseUrl(baseUrlOrConfig) {
  let candidate = baseUrlOrConfig;
  if (
    baseUrlOrConfig &&
    typeof baseUrlOrConfig === "object" &&
    !Array.isArray(baseUrlOrConfig) &&
    "cfg" in baseUrlOrConfig
  )
    candidate = baseUrlOrConfig.cfg?.models?.providers?.xai?.baseUrl ?? baseUrlOrConfig;
  return readStringValue(candidate) || "https://api.x.ai/v1";
}
//#endregion
export {
  shouldContributeXaiCompat as i,
  resolveXaiBaseUrl as n,
  resolveXaiTransport as r,
  isXaiModelHint as t,
};
