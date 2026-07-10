//#region extensions/slack/subagent-hooks-api.ts
let slackSubagentHooksPromise = null;
function loadSlackSubagentHooksModule() {
  slackSubagentHooksPromise ??= import("./subagent-hooks-CXJ_-9aa.js");
  return slackSubagentHooksPromise;
}
function registerSlackSubagentHooks(api) {
  api.on("subagent_spawning", async (event) => {
    const { handleSlackSubagentSpawning } = await loadSlackSubagentHooksModule();
    return await handleSlackSubagentSpawning(event);
  });
  api.on("subagent_spawned", async (event) => {
    const { handleSlackSubagentSpawned } = await loadSlackSubagentHooksModule();
    await handleSlackSubagentSpawned(api, event);
  });
  api.on("subagent_delivery_target", async (event) => {
    const { handleSlackSubagentDeliveryTarget } = await loadSlackSubagentHooksModule();
    return handleSlackSubagentDeliveryTarget(event);
  });
  api.on("subagent_ended", async (event) => {
    const { handleSlackSubagentEnded } = await loadSlackSubagentHooksModule();
    await handleSlackSubagentEnded(api, event);
  });
}
//#endregion
export { registerSlackSubagentHooks as t };
