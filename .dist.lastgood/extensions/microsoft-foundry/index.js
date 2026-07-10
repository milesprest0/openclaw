import { t as definePluginEntry } from "../../plugin-entry-Yc8_SbjU.js";
import { t as buildMicrosoftFoundryProvider } from "../../provider-DV806EcD.js";
//#region extensions/microsoft-foundry/index.ts
var microsoft_foundry_default = definePluginEntry({
  id: "microsoft-foundry",
  name: "Microsoft Foundry Provider",
  description: "Microsoft Foundry provider with Entra ID and API key auth",
  register(api) {
    api.registerProvider(buildMicrosoftFoundryProvider());
  },
});
//#endregion
export { microsoft_foundry_default as default };
