import { t as FIRECRAWL_WEB_FETCH_PROVIDER_SHARED } from "../../firecrawl-fetch-provider-shared-DcyYIdFT.js";
import { t as enablePluginInConfig } from "../../provider-enable-config-DLmZHecn.js";
//#region extensions/firecrawl/web-fetch-contract-api.ts
function createFirecrawlWebFetchProvider() {
  return {
    ...FIRECRAWL_WEB_FETCH_PROVIDER_SHARED,
    applySelectionConfig: (config) => enablePluginInConfig(config, "firecrawl").config,
    createTool: () => null,
  };
}
//#endregion
export { createFirecrawlWebFetchProvider };
