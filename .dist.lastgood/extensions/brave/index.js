import { t as createBraveWebSearchProvider } from "../../brave-web-search-provider-DE2lReAR.js";
import { t as definePluginEntry } from "../../plugin-entry-Yc8_SbjU.js";
//#region extensions/brave/index.ts
var brave_default = definePluginEntry({
  id: "brave",
  name: "Brave Plugin",
  description: "Bundled Brave plugin",
  register(api) {
    api.registerWebSearchProvider(createBraveWebSearchProvider());
  },
});
//#endregion
export { brave_default as default };
