import {
  c as resolveEffectiveEnableState,
  s as normalizePluginsConfig,
} from "./config-state-BF1r9Z0v.js";
import {
  C as planProviderIndexModelCatalogRows,
  E as loadOpenClawProviderIndex,
} from "./discovery-bnS95tO3.js";
import { i as normalizeModelCatalogProviderId } from "./normalize-C7P1Ynu1.js";
//#region src/commands/models/list.provider-index-catalog.ts
function loadProviderIndexCatalogRowsForList(params) {
  const providerFilter = params.providerFilter
    ? normalizeModelCatalogProviderId(params.providerFilter)
    : void 0;
  return planProviderIndexModelCatalogRows({
    index: loadOpenClawProviderIndex(),
    ...(providerFilter ? { providerFilter } : {}),
  })
    .entries.filter(
      (entry) =>
        resolveEffectiveEnableState({
          id: entry.pluginId,
          origin: "bundled",
          config: normalizePluginsConfig(params.cfg.plugins),
          rootConfig: params.cfg,
          enabledByDefault: true,
        }).enabled,
    )
    .flatMap((entry) => entry.rows);
}
//#endregion
export { loadProviderIndexCatalogRowsForList };
