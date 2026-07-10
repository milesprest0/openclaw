import { t as buildVydraImageGenerationProvider } from "../../image-generation-provider-3AxuJbCn.js";
import {
  n as applyVydraConfig,
  t as VYDRA_DEFAULT_IMAGE_MODEL_REF,
} from "../../onboard-Dp0UTVzz.js";
import "../../provider-auth-api-key-DmWri2xS.js";
import { t as definePluginEntry } from "../../plugin-entry-Yc8_SbjU.js";
import { t as createProviderApiKeyAuthMethod } from "../../provider-api-key-auth-Bt32jqgH.js";
import { t as buildVydraSpeechProvider } from "../../speech-provider-ZxlswKaV.js";
import { t as buildVydraVideoGenerationProvider } from "../../video-generation-provider-DrJC3abg.js";
//#region extensions/vydra/index.ts
const PROVIDER_ID = "vydra";
var vydra_default = definePluginEntry({
  id: PROVIDER_ID,
  name: "Vydra Provider",
  description: "Bundled Vydra image, video, and speech provider",
  register(api) {
    api.registerProvider({
      id: PROVIDER_ID,
      label: "Vydra",
      docsPath: "/providers/vydra",
      envVars: ["VYDRA_API_KEY"],
      auth: [
        createProviderApiKeyAuthMethod({
          providerId: PROVIDER_ID,
          methodId: "api-key",
          label: "Vydra API key",
          hint: "Image, video, and speech API key",
          optionKey: "vydraApiKey",
          flagName: "--vydra-api-key",
          envVar: "VYDRA_API_KEY",
          promptMessage: "Enter Vydra API key",
          defaultModel: VYDRA_DEFAULT_IMAGE_MODEL_REF,
          expectedProviders: [PROVIDER_ID],
          applyConfig: (cfg) => applyVydraConfig(cfg),
          wizard: {
            choiceId: "vydra-api-key",
            choiceLabel: "Vydra API key",
            choiceHint: "Image, video, and speech API key",
            groupId: "vydra",
            groupLabel: "Vydra",
            groupHint: "Image, video, and speech",
            onboardingScopes: ["image-generation"],
          },
        }),
      ],
    });
    api.registerSpeechProvider(buildVydraSpeechProvider());
    api.registerImageGenerationProvider(buildVydraImageGenerationProvider());
    api.registerVideoGenerationProvider(buildVydraVideoGenerationProvider());
  },
});
//#endregion
export { vydra_default as default };
