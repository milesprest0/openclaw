import { t as definePluginEntry } from "../../plugin-entry-Yc8_SbjU.js";
import { t as registerAmazonBedrockPlugin } from "../../register.sync.runtime-BM1HCR_X.js";
//#region extensions/amazon-bedrock/index.ts
var amazon_bedrock_default = definePluginEntry({
  id: "amazon-bedrock",
  name: "Amazon Bedrock Provider",
  description: "Bundled Amazon Bedrock provider policy plugin",
  register(api) {
    registerAmazonBedrockPlugin(api);
  },
});
//#endregion
export { amazon_bedrock_default as default };
