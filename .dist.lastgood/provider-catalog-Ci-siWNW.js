import { t as modelCatalog } from "./openclaw.plugin-PBaQ5oSk.js";
import { n as buildManifestModelProviderConfig } from "./provider-catalog-shared-DUixNfPI.js";
//#region extensions/together/provider-catalog.ts
function buildTogetherProvider() {
  return buildManifestModelProviderConfig({
    providerId: "together",
    catalog: modelCatalog.providers.together,
  });
}
//#endregion
export { buildTogetherProvider as t };
