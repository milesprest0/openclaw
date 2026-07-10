import { t as modelCatalog } from "./openclaw.plugin-or595FuT.js";
import { n as buildManifestModelProviderConfig } from "./provider-catalog-shared-DUixNfPI.js";
//#region extensions/mistral/provider-catalog.ts
function buildMistralProvider() {
  return buildManifestModelProviderConfig({
    providerId: "mistral",
    catalog: modelCatalog.providers.mistral,
  });
}
//#endregion
export { buildMistralProvider as t };
