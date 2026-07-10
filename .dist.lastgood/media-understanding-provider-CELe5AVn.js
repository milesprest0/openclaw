import {
  r as describeImagesWithModel,
  t as describeImageWithModel,
} from "./image-runtime-DLf9RXbB.js";
import "./media-understanding-Br1KJ1Ub.js";
//#region extensions/opencode-go/media-understanding-provider.ts
const opencodeGoMediaUnderstandingProvider = {
  id: "opencode-go",
  capabilities: ["image"],
  defaultModels: { image: "kimi-k2.6" },
  describeImage: describeImageWithModel,
  describeImages: describeImagesWithModel,
};
//#endregion
export { opencodeGoMediaUnderstandingProvider as t };
