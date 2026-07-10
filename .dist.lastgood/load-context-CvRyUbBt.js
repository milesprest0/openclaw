import {
  c as resolveDefaultAgentId,
  o as resolveAgentWorkspaceDir,
} from "./agent-scope-config-CXZGyKMl.js";
import "./agent-scope-9AmhTwki.js";
import { i as getRuntimeConfig } from "./io-CEQSCTGy.js";
import { x as resolvePluginActivationSourceConfig } from "./loader-BLowS1kl.js";
import "./config-CMOdcWpc.js";
import { t as applyPluginAutoEnable } from "./plugin-auto-enable-DBf3GcqW.js";
import { t as createSubsystemLogger } from "./subsystem-Bjz8a2fE.js";
import "./logging-CG1_glIK.js";
//#region src/plugins/runtime/load-context.ts
const log = createSubsystemLogger("plugins");
function createPluginRuntimeLoaderLogger() {
  return {
    info: (message) => log.info(message),
    warn: (message) => log.warn(message),
    error: (message) => log.error(message),
    debug: (message) => log.debug(message),
  };
}
function resolvePluginRuntimeLoadContext(options) {
  const env = options?.env ?? process.env;
  const rawConfig = options?.config ?? getRuntimeConfig();
  const activationSourceConfig = resolvePluginActivationSourceConfig({
    config: rawConfig,
    activationSourceConfig: options?.activationSourceConfig,
  });
  const autoEnabled = applyPluginAutoEnable({
    config: rawConfig,
    env,
    manifestRegistry: options?.manifestRegistry,
  });
  const config = autoEnabled.config;
  const workspaceDir =
    options?.workspaceDir ?? resolveAgentWorkspaceDir(config, resolveDefaultAgentId(config));
  return {
    rawConfig,
    config,
    activationSourceConfig,
    autoEnabledReasons: autoEnabled.autoEnabledReasons,
    workspaceDir,
    env,
    logger: options?.logger ?? createPluginRuntimeLoaderLogger(),
  };
}
function buildPluginRuntimeLoadOptions(context, overrides) {
  return buildPluginRuntimeLoadOptionsFromValues(context, overrides);
}
function buildPluginRuntimeLoadOptionsFromValues(values, overrides) {
  return {
    config: values.config,
    activationSourceConfig: values.activationSourceConfig,
    autoEnabledReasons: values.autoEnabledReasons,
    workspaceDir: values.workspaceDir,
    env: values.env,
    logger: values.logger,
    ...overrides,
  };
}
//#endregion
export {
  resolvePluginRuntimeLoadContext as i,
  buildPluginRuntimeLoadOptionsFromValues as n,
  createPluginRuntimeLoaderLogger as r,
  buildPluginRuntimeLoadOptions as t,
};
