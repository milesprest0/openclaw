import { n as logConfigUpdated } from "./logging-DT4KjV2F.js";
import { r as resolveAgentModelPrimaryValue } from "./model-input-C-vWoAxX.js";
import { t as applyDefaultModelPrimaryUpdate, u as updateConfig } from "./shared-BbHHdmwP.js";
//#region src/commands/models/set-image.ts
async function modelsSetImageCommand(modelRaw, runtime) {
  const updated = await updateConfig((cfg) => {
    return applyDefaultModelPrimaryUpdate({
      cfg,
      modelRaw,
      field: "imageModel",
    });
  });
  logConfigUpdated(runtime);
  runtime.log(
    `Image model: ${resolveAgentModelPrimaryValue(updated.agents?.defaults?.imageModel) ?? modelRaw}`,
  );
}
//#endregion
export { modelsSetImageCommand };
