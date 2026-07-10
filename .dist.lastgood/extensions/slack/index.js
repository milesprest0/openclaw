import {
  r as loadBundledEntryExportSync,
  t as defineBundledChannelEntry,
} from "../../channel-entry-contract-D352Et04.js";
import { t as registerSlackSubagentHooks } from "../../subagent-hooks-api-CGE7XI3o.js";
//#region extensions/slack/index.ts
function registerSlackPluginHttpRoutes(api) {
  loadBundledEntryExportSync(import.meta.url, {
    specifier: "./http-routes-api.js",
    exportName: "registerSlackPluginHttpRoutes",
  })(api);
}
var slack_default = defineBundledChannelEntry({
  id: "slack",
  name: "Slack",
  description: "Slack channel plugin",
  importMetaUrl: import.meta.url,
  plugin: {
    specifier: "./channel-plugin-api.js",
    exportName: "slackPlugin",
  },
  secrets: {
    specifier: "./secret-contract-api.js",
    exportName: "channelSecrets",
  },
  runtime: {
    specifier: "./runtime-setter-api.js",
    exportName: "setSlackRuntime",
  },
  accountInspect: {
    specifier: "./account-inspect-api.js",
    exportName: "inspectSlackReadOnlyAccount",
  },
  registerFull(api) {
    registerSlackSubagentHooks(api);
    registerSlackPluginHttpRoutes(api);
  },
});
//#endregion
export { slack_default as default };
