import { n as defineBundledChannelSetupEntry } from "../../channel-entry-contract-D352Et04.js";
//#region extensions/imessage/setup-entry.ts
var setup_entry_default = defineBundledChannelSetupEntry({
  importMetaUrl: import.meta.url,
  plugin: {
    specifier: "./api.js",
    exportName: "imessageSetupPlugin",
  },
});
//#endregion
export { setup_entry_default as default };
