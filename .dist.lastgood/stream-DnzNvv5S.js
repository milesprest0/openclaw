import { streamSimple } from "@mariozechner/pi-ai";
import { t as isFireworksKimiModelId } from "./model-id-V75EZ-P6.js";
import "./provider-stream-shared-wxMuvsGy.js";
import { r as normalizeProviderId } from "./provider-id-CG9pXYPs.js";
import { _ as streamWithPayloadPatch } from "./provider-model-shared-CmD-CscC.js";
//#region extensions/fireworks/stream.ts
function isFireworksProviderId(providerId) {
  const normalized = normalizeProviderId(providerId);
  return normalized === "fireworks" || normalized === "fireworks-ai";
}
function createFireworksKimiThinkingDisabledWrapper(baseStreamFn) {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) =>
    streamWithPayloadPatch(underlying, model, context, options, (payloadObj) => {
      payloadObj.thinking = { type: "disabled" };
      delete payloadObj.reasoning;
      delete payloadObj.reasoning_effort;
      delete payloadObj.reasoningEffort;
    });
}
function wrapFireworksProviderStream(ctx) {
  if (
    !isFireworksProviderId(ctx.provider) ||
    ctx.model?.api !== "openai-completions" ||
    !isFireworksKimiModelId(ctx.modelId)
  )
    return;
  return createFireworksKimiThinkingDisabledWrapper(ctx.streamFn);
}
//#endregion
export { wrapFireworksProviderStream as n, createFireworksKimiThinkingDisabledWrapper as t };
