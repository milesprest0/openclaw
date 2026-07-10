import { a as resolveAgentDir, c as resolveDefaultAgentId } from "./agent-scope-config-CXZGyKMl.js";
import { r as externalCliDiscoveryForProviderAuth } from "./external-cli-discovery-DDK4LC8K.js";
import { t as loadModelsConfig } from "./load-config-CalVktbI.js";
import { i as setAuthProfileOrder } from "./profiles-B4Bcz6fY.js";
import "./agent-scope-9AmhTwki.js";
import { r as normalizeProviderId } from "./provider-id-CG9pXYPs.js";
import { r as writeRuntimeJson } from "./runtime-kqN0Yohi.js";
import { s as resolveKnownAgentId } from "./shared-BbHHdmwP.js";
import "./model-selection-CyVXHdEG.js";
import "./auth-profiles-BrCJ7JK3.js";
import { c as resolveAuthStatePathForDisplay } from "./source-check-DUt28S7k.js";
import { n as ensureAuthProfileStore } from "./store-9hg03xJO.js";
import { s as normalizeStringEntries } from "./string-normalization-B6JUy5-Y.js";
import { g as shortenHomePath } from "./utils-BGRcpLKt.js";
//#region src/commands/models/auth-order.ts
function resolveTargetAgent(cfg, raw) {
  const agentId =
    resolveKnownAgentId({
      cfg,
      rawAgentId: raw,
    }) ?? resolveDefaultAgentId(cfg);
  return {
    agentId,
    agentDir: resolveAgentDir(cfg, agentId),
  };
}
function describeOrder(store, provider) {
  const providerKey = normalizeProviderId(provider);
  const order = store.order?.[providerKey];
  return Array.isArray(order) ? order : [];
}
async function resolveAuthOrderContext(opts, runtime) {
  const rawProvider = opts.provider?.trim();
  if (!rawProvider) throw new Error("Missing --provider.");
  const provider = normalizeProviderId(rawProvider);
  const cfg = await loadModelsConfig({
    commandName: "models auth-order",
    runtime,
  });
  const { agentId, agentDir } = resolveTargetAgent(cfg, opts.agent);
  return {
    cfg,
    agentId,
    agentDir,
    provider,
  };
}
async function modelsAuthOrderGetCommand(opts, runtime) {
  const { cfg, agentId, agentDir, provider } = await resolveAuthOrderContext(opts, runtime);
  const order = describeOrder(
    ensureAuthProfileStore(agentDir, {
      externalCli: externalCliDiscoveryForProviderAuth({
        cfg,
        provider,
      }),
    }),
    provider,
  );
  if (opts.json) {
    writeRuntimeJson(runtime, {
      agentId,
      agentDir,
      provider,
      authStatePath: shortenHomePath(resolveAuthStatePathForDisplay(agentDir)),
      order: order.length > 0 ? order : null,
    });
    return;
  }
  runtime.log(`Agent: ${agentId}`);
  runtime.log(`Provider: ${provider}`);
  runtime.log(`Auth state file: ${shortenHomePath(resolveAuthStatePathForDisplay(agentDir))}`);
  runtime.log(order.length > 0 ? `Order override: ${order.join(", ")}` : "Order override: (none)");
}
async function modelsAuthOrderClearCommand(opts, runtime) {
  const { agentId, agentDir, provider } = await resolveAuthOrderContext(opts, runtime);
  if (
    !(await setAuthProfileOrder({
      agentDir,
      provider,
      order: null,
    }))
  )
    throw new Error("Failed to update auth-state.json (lock busy?).");
  runtime.log(`Agent: ${agentId}`);
  runtime.log(`Provider: ${provider}`);
  runtime.log("Cleared per-agent order override.");
}
async function modelsAuthOrderSetCommand(opts, runtime) {
  const { cfg, agentId, agentDir, provider } = await resolveAuthOrderContext(opts, runtime);
  const store = ensureAuthProfileStore(agentDir, {
    externalCli: externalCliDiscoveryForProviderAuth({
      cfg,
      provider,
    }),
  });
  const providerKey = provider;
  const requested = normalizeStringEntries(opts.order ?? []);
  if (requested.length === 0)
    throw new Error("Missing profile ids. Provide one or more profile ids.");
  for (const profileId of requested) {
    const cred = store.profiles[profileId];
    if (!cred) throw new Error(`Auth profile "${profileId}" not found in ${agentDir}.`);
    if (normalizeProviderId(cred.provider) !== providerKey)
      throw new Error(`Auth profile "${profileId}" is for ${cred.provider}, not ${provider}.`);
  }
  const updated = await setAuthProfileOrder({
    agentDir,
    provider,
    order: requested,
  });
  if (!updated) throw new Error("Failed to update auth-state.json (lock busy?).");
  runtime.log(`Agent: ${agentId}`);
  runtime.log(`Provider: ${provider}`);
  runtime.log(`Order override: ${describeOrder(updated, provider).join(", ")}`);
}
//#endregion
export { modelsAuthOrderClearCommand, modelsAuthOrderGetCommand, modelsAuthOrderSetCommand };
