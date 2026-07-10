import { r as normalizeProviderId } from "./provider-id-CG9pXYPs.js";
import { n as normalizeGooglePreviewModelId } from "./provider-model-id-normalize-DsIoZHHW.js";
import {
  a as normalizeLowercaseStringOrEmpty,
  c as normalizeOptionalString,
  p as resolvePrimaryStringValue,
} from "./string-coerce-BdEutqX5.js";
//#region src/config/model-input.ts
const GOOGLE_CONFIG_MODEL_PROVIDERS = new Set(["google", "google-gemini-cli", "google-vertex"]);
function modelKeyForConfig(provider, model) {
  const providerId = provider.trim();
  const modelId = model.trim();
  if (!providerId) return modelId;
  if (!modelId) return providerId;
  return normalizeLowercaseStringOrEmpty(modelId).startsWith(
    `${normalizeLowercaseStringOrEmpty(providerId)}/`,
  )
    ? modelId
    : `${providerId}/${modelId}`;
}
function resolveAgentModelPrimaryValue(model) {
  return resolvePrimaryStringValue(model);
}
function resolveAgentModelFallbackValues(model) {
  if (!model || typeof model !== "object") return [];
  return Array.isArray(model.fallbacks) ? model.fallbacks : [];
}
function resolveAgentModelTimeoutMsValue(model) {
  if (!model || typeof model !== "object") return;
  return typeof model.timeoutMs === "number" &&
    Number.isFinite(model.timeoutMs) &&
    model.timeoutMs > 0
    ? Math.floor(model.timeoutMs)
    : void 0;
}
function toAgentModelListLike(model) {
  if (typeof model === "string") {
    const primary = normalizeOptionalString(model);
    return primary ? { primary } : void 0;
  }
  if (!model || typeof model !== "object") return;
  return model;
}
function normalizeAgentModelRefForConfig(model) {
  const trimmed = model.trim();
  const slash = trimmed.indexOf("/");
  if (slash <= 0 || slash >= trimmed.length - 1) return trimmed;
  const provider = normalizeProviderId(trimmed.slice(0, slash));
  if (!GOOGLE_CONFIG_MODEL_PROVIDERS.has(provider)) return trimmed;
  return modelKeyForConfig(provider, normalizeGooglePreviewModelId(trimmed.slice(slash + 1)));
}
//#endregion
export {
  toAgentModelListLike as a,
  resolveAgentModelTimeoutMsValue as i,
  resolveAgentModelFallbackValues as n,
  resolveAgentModelPrimaryValue as r,
  normalizeAgentModelRefForConfig as t,
};
