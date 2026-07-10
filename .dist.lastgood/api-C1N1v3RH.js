import { t as parseGeminiAuth } from "./gemini-auth-C2VlSIex.js";
import "./provider-http-C6-kkFY-.js";
import "./thinking-api-CXh3cOOB.js";
import "./gemini-cli-provider-BaNsvIhb.js";
import "./onboard-BYmWCHEe.js";
import {
  i as normalizeGoogleGenerativeAiBaseUrl,
  t as DEFAULT_GOOGLE_API_BASE_URL,
} from "./provider-policy-D9HYNve_.js";
import { u as resolveProviderHttpRequestConfig } from "./shared-DqfWqGL5.js";
import "./transport-stream-Cv3xkoMt.js";
import "./provider-registration-CJ_D9YbM.js";
//#region extensions/google/api.ts
function resolveTrustedGoogleGenerativeAiBaseUrl(baseUrl) {
  const normalized =
    normalizeGoogleGenerativeAiBaseUrl(
      baseUrl ?? "https://generativelanguage.googleapis.com/v1beta",
    ) ?? "https://generativelanguage.googleapis.com/v1beta";
  let url;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error(
      "Google Generative AI baseUrl must be a valid https URL on generativelanguage.googleapis.com",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "generativelanguage.googleapis.com"
  )
    throw new Error(
      "Google Generative AI baseUrl must use https://generativelanguage.googleapis.com",
    );
  return normalized;
}
function resolveGoogleGenerativeAiHttpRequestConfig(params) {
  return resolveProviderHttpRequestConfig({
    baseUrl: resolveTrustedGoogleGenerativeAiBaseUrl(params.baseUrl),
    defaultBaseUrl: DEFAULT_GOOGLE_API_BASE_URL,
    allowPrivateNetwork: params.request?.allowPrivateNetwork,
    headers: params.headers,
    request: params.request,
    defaultHeaders: parseGeminiAuth(params.apiKey).headers,
    provider: "google",
    api: "google-generative-ai",
    capability: params.capability,
    transport: params.transport,
  });
}
//#endregion
export { resolveGoogleGenerativeAiHttpRequestConfig as t };
