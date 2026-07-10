import { t as buildOpenAICodexCliBackend } from "../../cli-backend-R2uY1YH7.js";
import { t as buildOpenAIImageGenerationProvider } from "../../image-generation-provider-DDKwSjUY.js";
import {
  n as openaiMediaUnderstandingProvider,
  t as openaiCodexMediaUnderstandingProvider,
} from "../../media-understanding-provider-DtMcdVa2.js";
import { t as openAiMemoryEmbeddingProviderAdapter } from "../../memory-embedding-adapter-CCPfMaRd.js";
import { t as buildOpenAICodexProviderPlugin } from "../../openai-codex-provider-Djx0GaFT.js";
import { t as buildOpenAIProvider } from "../../openai-provider-BjVku3GV.js";
import { r as resolvePluginConfigObject } from "../../plugin-config-runtime-OXf9zy-H.js";
import { t as definePluginEntry } from "../../plugin-entry-Yc8_SbjU.js";
import {
  a as resolveOpenAISystemPromptContribution,
  i as resolveOpenAIPromptOverlayMode,
} from "../../prompt-overlay-DrYTO_09.js";
import { a as buildProviderToolCompatFamilyHooks } from "../../provider-tools-Br0qcNYr.js";
import { t as buildOpenAIRealtimeTranscriptionProvider } from "../../realtime-transcription-provider-r-__xKu2.js";
import { t as buildOpenAIRealtimeVoiceProvider } from "../../realtime-voice-provider-CwB8wbuk.js";
import { t as buildOpenAISpeechProvider } from "../../speech-provider-RvdEoE8U.js";
import { t as buildOpenAIVideoGenerationProvider } from "../../video-generation-provider-CqNpTtxx.js";
//#region extensions/openai/index.ts
var openai_default = definePluginEntry({
  id: "openai",
  name: "OpenAI Provider",
  description: "Bundled OpenAI provider plugins",
  register(api) {
    const openAIToolCompatHooks = buildProviderToolCompatFamilyHooks("openai");
    const buildProviderWithPromptContribution = (provider) => ({
      ...provider,
      ...openAIToolCompatHooks,
      resolveSystemPromptContribution: (ctx) => {
        const pluginConfig =
          resolvePluginConfigObject(ctx.config, "openai") ??
          (ctx.config ? void 0 : api.pluginConfig);
        return resolveOpenAISystemPromptContribution({
          config: ctx.config,
          legacyPluginConfig: pluginConfig,
          mode: resolveOpenAIPromptOverlayMode(pluginConfig),
          modelProviderId: provider.id,
          modelId: ctx.modelId,
          trigger: ctx.trigger,
        });
      },
    });
    api.registerCliBackend(buildOpenAICodexCliBackend());
    api.registerProvider(buildProviderWithPromptContribution(buildOpenAIProvider()));
    api.registerProvider(buildProviderWithPromptContribution(buildOpenAICodexProviderPlugin()));
    api.registerMemoryEmbeddingProvider(openAiMemoryEmbeddingProviderAdapter);
    api.registerImageGenerationProvider(buildOpenAIImageGenerationProvider());
    api.registerRealtimeTranscriptionProvider(buildOpenAIRealtimeTranscriptionProvider());
    api.registerRealtimeVoiceProvider(buildOpenAIRealtimeVoiceProvider());
    api.registerSpeechProvider(buildOpenAISpeechProvider());
    api.registerMediaUnderstandingProvider(openaiMediaUnderstandingProvider);
    api.registerMediaUnderstandingProvider(openaiCodexMediaUnderstandingProvider);
    api.registerVideoGenerationProvider(buildOpenAIVideoGenerationProvider());
  },
});
//#endregion
export { openai_default as default };
