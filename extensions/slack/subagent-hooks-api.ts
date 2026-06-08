import type { OpenClawPluginApi } from "openclaw/plugin-sdk/channel-entry-contract";

type SlackSubagentHooksModule = typeof import("./src/subagent-hooks.js");

let slackSubagentHooksPromise: Promise<SlackSubagentHooksModule> | null = null;

function loadSlackSubagentHooksModule() {
  slackSubagentHooksPromise ??= import("./src/subagent-hooks.js");
  return slackSubagentHooksPromise;
}

export function registerSlackSubagentHooks(api: OpenClawPluginApi): void {
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
