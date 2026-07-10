import { a as buildMoonshotProvider } from "../../provider-catalog-Bp4KtP00.js";
//#region extensions/moonshot/provider-discovery.ts
const moonshotProviderDiscovery = {
  id: "moonshot",
  label: "Moonshot",
  docsPath: "/providers/moonshot",
  auth: [],
  staticCatalog: {
    order: "simple",
    run: async () => ({ provider: buildMoonshotProvider() }),
  },
};
//#endregion
export { moonshotProviderDiscovery as default };
