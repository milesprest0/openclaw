import { Type } from "typebox";
import { f as readNumberParam, g as readStringParam } from "./common-BPZLgNoA.js";
import { n as OLLAMA_DEFAULT_BASE_URL } from "./defaults-ciZsiUQe.js";
import { t as enablePluginInConfig } from "./enable-C5STWQsp.js";
import { a as wrapWebContent } from "./external-content-BCW9yxs8.js";
import "./provider-auth-D0H8jtwm.js";
import { n as fetchWithSsrFGuard } from "./fetch-guard-jcadyt5o.js";
import { t as resolveEnvApiKey } from "./model-auth-env-BTZHFDkv.js";
import { u as isNonSecretApiKeyMarker } from "./model-auth-markers-CtsHE1k1.js";
import { t as normalizeOptionalSecretInput } from "./normalize-secret-input-B8M4cov-.js";
import {
  n as buildOllamaBaseUrlSsrFPolicy,
  o as fetchOllamaModels,
  t as readProviderBaseUrl,
  u as resolveOllamaApiBase,
} from "./provider-base-url-DeaEElgH.js";
import { t as checkOllamaCloudAuth } from "./setup-hwOhFTfS.js";
import "./text-runtime-lKuAtsoz.js";
import "./ssrf-runtime-BhFjkd3c.js";
import "./provider-auth-runtime-CXnsTkLQ.js";
import { c as normalizeOptionalString } from "./string-coerce-BdEutqX5.js";
import "./provider-web-search-C9K0OI1i.js";
import { a as truncateText } from "./web-fetch-utils-Bpv806jB.js";
import {
  _ as resolveSiteName,
  h as resolveSearchCount,
} from "./web-search-provider-common-DvgMsTTY.js";
import { i as resolveProviderWebSearchPluginConfig } from "./web-search-provider-config-DGGjdfk5.js";
import { a as readResponseText } from "./web-shared-MM6C0FoP.js";
//#region extensions/ollama/src/web-search-provider.ts
const OLLAMA_WEB_SEARCH_SCHEMA = Type.Object(
  {
    query: Type.String({ description: "Search query string." }),
    count: Type.Optional(
      Type.Number({
        description: "Number of results to return (1-10).",
        minimum: 1,
        maximum: 10,
      }),
    ),
  },
  { additionalProperties: false },
);
const OLLAMA_HOSTED_WEB_SEARCH_PATH = "/api/web_search";
const OLLAMA_LOCAL_WEB_SEARCH_PROXY_PATH = "/api/experimental/web_search";
const OLLAMA_CLOUD_BASE_URL = "https://ollama.com";
const DEFAULT_OLLAMA_WEB_SEARCH_COUNT = 5;
const DEFAULT_OLLAMA_WEB_SEARCH_TIMEOUT_MS = 15e3;
const OLLAMA_WEB_SEARCH_SNIPPET_MAX_CHARS = 300;
function isOllamaCloudBaseUrl(baseUrl) {
  try {
    const parsed = new URL(baseUrl);
    return parsed.protocol === "https:" && parsed.hostname === "ollama.com";
  } catch {
    return false;
  }
}
function resolveConfiguredOllamaWebSearchApiKey(config) {
  const providerApiKey = normalizeOptionalSecretInput(config?.models?.providers?.ollama?.apiKey);
  if (providerApiKey && !isNonSecretApiKeyMarker(providerApiKey)) return providerApiKey;
}
function resolveEnvOllamaWebSearchApiKey() {
  return resolveEnvApiKey("ollama")?.apiKey;
}
function resolveOllamaWebSearchBaseUrl(config) {
  const pluginBaseUrl = normalizeOptionalString(
    resolveProviderWebSearchPluginConfig(config, "ollama")?.baseUrl,
  );
  if (pluginBaseUrl) return resolveOllamaApiBase(pluginBaseUrl);
  const configuredBaseUrl = readProviderBaseUrl(config?.models?.providers?.ollama);
  if (configuredBaseUrl) return resolveOllamaApiBase(configuredBaseUrl);
  return OLLAMA_DEFAULT_BASE_URL;
}
function normalizeOllamaWebSearchResult(result) {
  const url = normalizeOptionalString(result.url) ?? "";
  if (!url) return null;
  return {
    title: normalizeOptionalString(result.title) ?? "",
    url,
    content: normalizeOptionalString(result.content) ?? "",
  };
}
function buildOllamaWebSearchAttempts(params) {
  if (isOllamaCloudBaseUrl(params.baseUrl))
    return [
      {
        baseUrl: params.baseUrl,
        path: OLLAMA_HOSTED_WEB_SEARCH_PATH,
        apiKey: params.configuredApiKey ?? params.envApiKey,
      },
    ];
  const attempts = [
    {
      baseUrl: params.baseUrl,
      path: OLLAMA_LOCAL_WEB_SEARCH_PROXY_PATH,
      apiKey: params.configuredApiKey,
    },
    {
      baseUrl: params.baseUrl,
      path: OLLAMA_HOSTED_WEB_SEARCH_PATH,
      apiKey: params.configuredApiKey,
    },
  ];
  if (params.envApiKey)
    attempts.push({
      baseUrl: OLLAMA_CLOUD_BASE_URL,
      path: OLLAMA_HOSTED_WEB_SEARCH_PATH,
      apiKey: params.envApiKey,
    });
  return attempts;
}
async function runOllamaWebSearch(params) {
  const query = params.query.trim();
  if (!query) throw new Error("query parameter is required");
  const baseUrl = resolveOllamaWebSearchBaseUrl(params.config);
  const configuredApiKey = resolveConfiguredOllamaWebSearchApiKey(params.config);
  const envApiKey = resolveEnvOllamaWebSearchApiKey();
  const count = resolveSearchCount(params.count, DEFAULT_OLLAMA_WEB_SEARCH_COUNT);
  const startedAt = Date.now();
  const body = JSON.stringify({
    query,
    max_results: count,
  });
  const attempts = buildOllamaWebSearchAttempts({
    baseUrl,
    configuredApiKey,
    envApiKey,
  });
  let payload;
  let lastError;
  for (const attempt of attempts) {
    const headers = { "Content-Type": "application/json" };
    if (attempt.apiKey) headers.Authorization = `Bearer ${attempt.apiKey}`;
    const { response, release } = await fetchWithSsrFGuard({
      url: `${attempt.baseUrl}${attempt.path}`,
      init: {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(DEFAULT_OLLAMA_WEB_SEARCH_TIMEOUT_MS),
      },
      policy: buildOllamaBaseUrlSsrFPolicy(attempt.baseUrl),
      auditContext: "ollama-web-search.search",
    });
    try {
      if (response.status === 401)
        throw new Error("Ollama web search authentication failed. Run `ollama signin`.");
      if (response.status === 403)
        throw new Error(
          "Ollama web search is unavailable. Ensure cloud-backed web search is enabled on the Ollama host.",
        );
      if (!response.ok) {
        const detail = await readResponseText(response, { maxBytes: 64e3 });
        const message =
          `Ollama web search failed (${response.status}): ${detail.text || ""}`.trim();
        if (response.status === 404) {
          lastError = new Error(message);
          continue;
        }
        throw new Error(message);
      }
      payload = await response.json();
      break;
    } catch (error) {
      if (error instanceof Error) lastError = error;
      else lastError = new Error(String(error));
      throw lastError;
    } finally {
      await release();
    }
  }
  if (!payload) throw lastError ?? /* @__PURE__ */ new Error("Ollama web search failed");
  const results = Array.isArray(payload.results)
    ? payload.results
        .map(normalizeOllamaWebSearchResult)
        .filter((result) => result !== null)
        .slice(0, count)
    : [];
  return {
    query,
    provider: "ollama",
    count: results.length,
    tookMs: Date.now() - startedAt,
    externalContent: {
      untrusted: true,
      source: "web_search",
      provider: "ollama",
      wrapped: true,
    },
    results: results.map((result) => {
      const snippet = truncateText(result.content, OLLAMA_WEB_SEARCH_SNIPPET_MAX_CHARS).text;
      return {
        title: result.title ? wrapWebContent(result.title, "web_search") : "",
        url: result.url,
        snippet: snippet ? wrapWebContent(snippet, "web_search") : "",
        siteName: resolveSiteName(result.url) || void 0,
      };
    }),
  };
}
async function warnOllamaWebSearchPrereqs(params) {
  const baseUrl = resolveOllamaWebSearchBaseUrl(params.config);
  const { reachable } = await fetchOllamaModels(baseUrl);
  if (!reachable) {
    await params.prompter.note(
      [
        "Ollama Web Search requires Ollama to be running.",
        `Expected host: ${baseUrl}`,
        "Start Ollama before using this provider.",
      ].join("\n"),
      "Ollama Web Search",
    );
    return params.config;
  }
  const auth = await checkOllamaCloudAuth(baseUrl);
  if (!auth.signedIn)
    await params.prompter.note(
      [
        "Ollama Web Search requires `ollama signin`.",
        ...(auth.signinUrl ? [auth.signinUrl] : ["Run `ollama signin`."]),
      ].join("\n"),
      "Ollama Web Search",
    );
  return params.config;
}
function createOllamaWebSearchProvider() {
  return {
    id: "ollama",
    label: "Ollama Web Search",
    hint: "Local Ollama host · requires ollama signin",
    onboardingScopes: ["text-inference"],
    requiresCredential: false,
    envVars: [],
    placeholder: "(run ollama signin)",
    signupUrl: "https://ollama.com/",
    docsUrl: "https://docs.openclaw.ai/tools/web",
    autoDetectOrder: 110,
    credentialPath: "",
    getCredentialValue: () => void 0,
    setCredentialValue: () => {},
    applySelectionConfig: (config) => enablePluginInConfig(config, "ollama").config,
    runSetup: async (ctx) =>
      await warnOllamaWebSearchPrereqs({
        config: ctx.config,
        prompter: ctx.prompter,
      }),
    createTool: (ctx) => ({
      description:
        "Search the web using Ollama's web search API. Returns titles, URLs, and snippets from the configured Ollama host.",
      parameters: OLLAMA_WEB_SEARCH_SCHEMA,
      execute: async (args) =>
        await runOllamaWebSearch({
          config: ctx.config,
          query: readStringParam(args, "query", { required: true }),
          count: readNumberParam(args, "count", { integer: true }),
        }),
    }),
  };
}
//#endregion
export { createOllamaWebSearchProvider as t };
