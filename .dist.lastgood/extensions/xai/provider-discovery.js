import { n as resolveFallbackXaiAuth } from "../../tool-auth-shared-BOFO0dZD.js";
import "../../provider-web-search-C9K0OI1i.js";
import { p as readProviderEnvValue } from "../../web-search-provider-common-DvgMsTTY.js";
//#region extensions/xai/provider-discovery.ts
const PROVIDER_ID = "xai";
function resolveXaiSyntheticAuth(config) {
  const apiKey = resolveFallbackXaiAuth(config)?.apiKey || readProviderEnvValue(["XAI_API_KEY"]);
  return apiKey
    ? {
        apiKey,
        source: "xAI plugin config",
        mode: "api-key",
      }
    : void 0;
}
const xaiProviderDiscovery = {
  id: PROVIDER_ID,
  label: "xAI",
  docsPath: "/providers/models",
  auth: [],
  resolveSyntheticAuth: ({ config }) => resolveXaiSyntheticAuth(config),
};
//#endregion
export { xaiProviderDiscovery as default };
