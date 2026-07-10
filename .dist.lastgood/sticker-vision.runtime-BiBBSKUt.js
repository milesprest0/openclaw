import { a as modelSupportsVision, r as loadModelCatalog } from "./model-catalog-CJYpfYgw.js";
import { s as resolveDefaultModelForAgent } from "./model-selection-CyVXHdEG.js";
import { S as findModelInCatalog } from "./model-selection-shared-D9oQINZ2.js";
import "./agent-runtime-CG9i2LmY.js";
//#region extensions/telegram/src/sticker-vision.runtime.ts
async function resolveStickerVisionSupportRuntime(params) {
  const catalog = await loadModelCatalog({ config: params.cfg });
  const defaultModel = resolveDefaultModelForAgent({
    cfg: params.cfg,
    agentId: params.agentId,
  });
  const entry = findModelInCatalog(catalog, defaultModel.provider, defaultModel.model);
  if (!entry) return false;
  return modelSupportsVision(entry);
}
//#endregion
export { resolveStickerVisionSupportRuntime };
