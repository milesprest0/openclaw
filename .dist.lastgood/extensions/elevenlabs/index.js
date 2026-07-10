import { t as elevenLabsMediaUnderstandingProvider } from "../../media-understanding-provider-Bz53vrbx.js";
import { t as definePluginEntry } from "../../plugin-entry-Yc8_SbjU.js";
import { n as buildElevenLabsRealtimeTranscriptionProvider } from "../../realtime-transcription-provider-BNfz_ajt.js";
import { t as buildElevenLabsSpeechProvider } from "../../speech-provider-CTiz9lxt.js";
//#region extensions/elevenlabs/index.ts
var elevenlabs_default = definePluginEntry({
  id: "elevenlabs",
  name: "ElevenLabs Speech",
  description: "Bundled ElevenLabs speech provider",
  register(api) {
    api.registerSpeechProvider(buildElevenLabsSpeechProvider());
    api.registerMediaUnderstandingProvider(elevenLabsMediaUnderstandingProvider);
    api.registerRealtimeTranscriptionProvider(buildElevenLabsRealtimeTranscriptionProvider());
  },
});
//#endregion
export { elevenlabs_default as default };
