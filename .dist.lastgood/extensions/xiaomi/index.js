import { n as applyXiaomiConfig, t as XIAOMI_DEFAULT_MODEL_REF } from "../../onboard-B6jBPQxk.js";
import { n as buildXiaomiProvider } from "../../provider-catalog-CjZU4h99.js";
import "../../provider-usage-DMzwZy0Z.js";
import { t as defineSingleProviderPluginEntry } from "../../provider-entry-C_PdVEwP.js";
import { n as PROVIDER_LABELS } from "../../provider-usage.shared-BhGN5s3U.js";
import { t as buildXiaomiSpeechProvider } from "../../speech-provider-Bc2rUqwJ.js";
var xiaomi_default = defineSingleProviderPluginEntry({
  id: "xiaomi",
  name: "Xiaomi Provider",
  description: "Bundled Xiaomi provider plugin",
  provider: {
    label: "Xiaomi",
    docsPath: "/providers/xiaomi",
    auth: [
      {
        methodId: "api-key",
        label: "Xiaomi API key",
        hint: "API key",
        optionKey: "xiaomiApiKey",
        flagName: "--xiaomi-api-key",
        envVar: "XIAOMI_API_KEY",
        promptMessage: "Enter Xiaomi API key",
        defaultModel: XIAOMI_DEFAULT_MODEL_REF,
        applyConfig: (cfg) => applyXiaomiConfig(cfg),
      },
    ],
    catalog: { buildProvider: buildXiaomiProvider },
    resolveUsageAuth: async (ctx) => {
      const apiKey = ctx.resolveApiKeyFromConfigAndStore({ envDirect: [ctx.env.XIAOMI_API_KEY] });
      return apiKey ? { token: apiKey } : null;
    },
    fetchUsageSnapshot: async () => ({
      provider: "xiaomi",
      displayName: PROVIDER_LABELS.xiaomi,
      windows: [],
    }),
  },
  register(api) {
    api.registerSpeechProvider(buildXiaomiSpeechProvider());
  },
});
//#endregion
export { xiaomi_default as default };
