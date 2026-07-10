import { t as definePluginEntry } from "../../plugin-entry-Yc8_SbjU.js";
import { t as registerBedrockMantlePlugin } from "../../register.sync.runtime-OE_asisv.js";
//#region extensions/amazon-bedrock-mantle/index.ts
var amazon_bedrock_mantle_default = definePluginEntry({
  id: "amazon-bedrock-mantle",
  name: "Amazon Bedrock Mantle Provider",
  description: "Bundled Amazon Bedrock Mantle (OpenAI-compatible) provider plugin",
  register(api) {
    registerBedrockMantlePlugin(api);
  },
});
//#endregion
export { amazon_bedrock_mantle_default as default };
