import { t as deepgramMediaUnderstandingProvider } from "../../media-understanding-provider-DYdOXyG6.js";
import { t as definePluginEntry } from "../../plugin-entry-Yc8_SbjU.js";
import { n as buildDeepgramRealtimeTranscriptionProvider } from "../../realtime-transcription-provider-B3Z5twud.js";
//#region extensions/deepgram/index.ts
var deepgram_default = definePluginEntry({
  id: "deepgram",
  name: "Deepgram Media Understanding",
  description: "Bundled Deepgram audio transcription provider",
  register(api) {
    api.registerMediaUnderstandingProvider(deepgramMediaUnderstandingProvider);
    api.registerRealtimeTranscriptionProvider(buildDeepgramRealtimeTranscriptionProvider());
  },
});
//#endregion
export { deepgram_default as default };
