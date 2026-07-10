import {
  n as applyVercelAiGatewayConfig,
  t as VERCEL_AI_GATEWAY_DEFAULT_MODEL_REF,
} from "../../onboard-DJWMDi_r.js";
import {
  n as buildVercelAiGatewayProvider,
  t as buildStaticVercelAiGatewayProvider,
} from "../../provider-catalog-CuUAWvyQ.js";
import { t as defineSingleProviderPluginEntry } from "../../provider-entry-C_PdVEwP.js";
import { t as resolveVercelAiGatewayThinkingProfile } from "../../thinking-DwZ0XdWK.js";
var vercel_ai_gateway_default = defineSingleProviderPluginEntry({
  id: "vercel-ai-gateway",
  name: "Vercel AI Gateway Provider",
  description: "Bundled Vercel AI Gateway provider plugin",
  provider: {
    label: "Vercel AI Gateway",
    docsPath: "/providers/vercel-ai-gateway",
    auth: [
      {
        methodId: "api-key",
        label: "Vercel AI Gateway API key",
        hint: "API key",
        optionKey: "aiGatewayApiKey",
        flagName: "--ai-gateway-api-key",
        envVar: "AI_GATEWAY_API_KEY",
        promptMessage: "Enter Vercel AI Gateway API key",
        defaultModel: VERCEL_AI_GATEWAY_DEFAULT_MODEL_REF,
        applyConfig: (cfg) => applyVercelAiGatewayConfig(cfg),
        wizard: {
          choiceId: "ai-gateway-api-key",
          groupId: "ai-gateway",
        },
      },
    ],
    catalog: {
      buildProvider: buildVercelAiGatewayProvider,
      buildStaticProvider: buildStaticVercelAiGatewayProvider,
    },
    resolveThinkingProfile: ({ modelId }) => resolveVercelAiGatewayThinkingProfile(modelId),
  },
});
//#endregion
export { vercel_ai_gateway_default as default };
