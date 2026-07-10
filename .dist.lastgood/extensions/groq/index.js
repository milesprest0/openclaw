import { t as contributeGroqResolvedModelCompat } from "../../api-BjPossaS.js";
import { t as groqMediaUnderstandingProvider } from "../../media-understanding-provider-DPyYPK-h2.js";
import { t as definePluginEntry } from "../../plugin-entry-Yc8_SbjU.js";
//#region extensions/groq/index.ts
var groq_default = definePluginEntry({
  id: "groq",
  name: "Groq Provider",
  description: "Bundled Groq provider plugin",
  register(api) {
    api.registerProvider({
      id: "groq",
      label: "Groq",
      docsPath: "/providers/groq",
      envVars: ["GROQ_API_KEY"],
      auth: [],
      contributeResolvedModelCompat: ({ modelId, model }) =>
        contributeGroqResolvedModelCompat({
          modelId,
          model,
        }),
    });
    api.registerMediaUnderstandingProvider(groqMediaUnderstandingProvider);
  },
});
//#endregion
export { groq_default as default };
