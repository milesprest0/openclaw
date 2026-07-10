import { n as repairCodexRuntimePluginInstallForModelSelection } from "./codex-runtime-plugin-install-fX0yW1gf.js";
import { n as logConfigUpdated } from "./logging-DT4KjV2F.js";
import { r as resolveAgentModelPrimaryValue } from "./model-input-C-vWoAxX.js";
import { t as applyDefaultModelPrimaryUpdate, u as updateConfig } from "./shared-BbHHdmwP.js";
//#region src/commands/models/set.ts
async function modelsSetCommand(modelRaw, runtime) {
  const updated = await updateConfig((cfg) => {
    return applyDefaultModelPrimaryUpdate({
      cfg,
      modelRaw,
      field: "model",
    });
  });
  const repaired = await repairCodexRuntimePluginInstallForModelSelection({
    cfg: updated,
    model: resolveAgentModelPrimaryValue(updated.agents?.defaults?.model) ?? modelRaw,
  });
  for (const warning of repaired.warnings) runtime.error?.(warning);
  logConfigUpdated(runtime);
  runtime.log(
    `Default model: ${resolveAgentModelPrimaryValue(updated.agents?.defaults?.model) ?? modelRaw}`,
  );
}
//#endregion
export { modelsSetCommand };
