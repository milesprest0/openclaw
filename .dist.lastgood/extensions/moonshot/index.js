import { t as createKimiWebSearchProvider } from "../../kimi-web-search-provider-DUlqOgOL.js";
import { n as moonshotMediaUnderstandingProvider } from "../../media-understanding-provider-CMDqkryj.js";
import {
  n as applyMoonshotConfig,
  r as applyMoonshotConfigCn,
  t as MOONSHOT_DEFAULT_MODEL_REF,
} from "../../onboard-DoPQi8b8.js";
import "../../provider-stream-family-D6uaWTED.js";
import {
  a as buildMoonshotProvider,
  i as applyMoonshotNativeStreamingUsageCompat,
} from "../../provider-catalog-Bp4KtP00.js";
import { t as defineSingleProviderPluginEntry } from "../../provider-entry-C_PdVEwP.js";
import "../../api-BcS2ZmoY.js";
import { a as buildProviderReplayFamilyHooks } from "../../provider-model-shared-CmD-CscC.js";
import { i as MOONSHOT_THINKING_STREAM_HOOKS } from "../../provider-stream-BeWZvrLX.js";
var moonshot_default = defineSingleProviderPluginEntry({
  id: "moonshot",
  name: "Moonshot Provider",
  description: "Bundled Moonshot provider plugin",
  provider: {
    label: "Moonshot",
    docsPath: "/providers/moonshot",
    auth: [
      {
        methodId: "api-key",
        label: "Kimi API key (.ai)",
        hint: "Kimi K2.6 + Kimi",
        optionKey: "moonshotApiKey",
        flagName: "--moonshot-api-key",
        envVar: "MOONSHOT_API_KEY",
        promptMessage: "Enter Moonshot API key",
        defaultModel: MOONSHOT_DEFAULT_MODEL_REF,
        applyConfig: (cfg) => applyMoonshotConfig(cfg),
        wizard: { groupLabel: "Moonshot AI (Kimi K2.6)" },
      },
      {
        methodId: "api-key-cn",
        label: "Kimi API key (.cn)",
        hint: "Kimi K2.6 + Kimi",
        optionKey: "moonshotApiKey",
        flagName: "--moonshot-api-key",
        envVar: "MOONSHOT_API_KEY",
        promptMessage: "Enter Moonshot API key (.cn)",
        defaultModel: MOONSHOT_DEFAULT_MODEL_REF,
        applyConfig: (cfg) => applyMoonshotConfigCn(cfg),
        wizard: { groupLabel: "Moonshot AI (Kimi K2.6)" },
      },
    ],
    catalog: {
      buildProvider: buildMoonshotProvider,
      buildStaticProvider: buildMoonshotProvider,
      allowExplicitBaseUrl: true,
    },
    applyNativeStreamingUsageCompat: ({ providerConfig }) =>
      applyMoonshotNativeStreamingUsageCompat(providerConfig),
    ...buildProviderReplayFamilyHooks({
      family: "openai-compatible",
      sanitizeToolCallIds: false,
    }),
    ...MOONSHOT_THINKING_STREAM_HOOKS,
    resolveThinkingProfile: () => ({
      levels: [
        {
          id: "off",
          label: "off",
        },
        {
          id: "low",
          label: "on",
        },
      ],
      defaultLevel: "off",
    }),
  },
  register(api) {
    api.registerMediaUnderstandingProvider(moonshotMediaUnderstandingProvider);
    api.registerWebSearchProvider(createKimiWebSearchProvider());
  },
});
//#endregion
export { moonshot_default as default };
