import { i as VLLM_PROVIDER_LABEL } from "./defaults-B_0J_3sY.js";
import "./provider-setup-Da7A3Mys.js";
import { r as discoverOpenAICompatibleLocalModels } from "./provider-self-hosted-setup-5iusi84x.js";
//#region extensions/vllm/models.ts
async function buildVllmProvider(params) {
  const baseUrl = (params?.baseUrl?.trim() || "http://127.0.0.1:8000/v1").replace(/\/+$/, "");
  return {
    baseUrl,
    api: "openai-completions",
    models: await discoverOpenAICompatibleLocalModels({
      baseUrl,
      apiKey: params?.apiKey,
      label: VLLM_PROVIDER_LABEL,
    }),
  };
}
//#endregion
export { buildVllmProvider as t };
