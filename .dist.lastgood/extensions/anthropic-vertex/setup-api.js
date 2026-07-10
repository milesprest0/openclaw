import { t as definePluginEntry } from "../../plugin-entry-Yc8_SbjU.js";
import { i as resolveAnthropicVertexConfigApiKey } from "../../region-DbbVgbk-.js";
//#region extensions/anthropic-vertex/setup-api.ts
var setup_api_default = definePluginEntry({
  id: "anthropic-vertex",
  name: "Anthropic Vertex Setup",
  description: "Lightweight Anthropic Vertex setup hooks",
  register(api) {
    api.registerProvider({
      id: "anthropic-vertex",
      label: "Anthropic Vertex",
      auth: [],
      resolveConfigApiKey: ({ env }) => resolveAnthropicVertexConfigApiKey(env),
    });
  },
});
//#endregion
export { setup_api_default as default };
