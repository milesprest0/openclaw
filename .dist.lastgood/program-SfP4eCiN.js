import process$1 from "node:process";
import { Command } from "commander";
import { s as getVerboseFlag, u as isHelpOrVersionInvocation } from "./argv-DQxa_OA3.js";
import { t as resolveCliArgvInvocation } from "./argv-invocation-Bc25Z788.js";
import { n as resolveCliChannelOptions } from "./channel-options-BYvssXYN.js";
import { n as resolveCliName } from "./cli-name-DXjaVgxu.js";
import "./globals-BdfwDi2E.js";
import {
  n as ensureCliExecutionBootstrap,
  r as resolveCliExecutionStartupContext,
  t as applyCliExecutionStartupPresentation,
} from "./command-execution-startup-GAKzX7nL.js";
import { t as registerProgramCommands } from "./command-registry-DMjKRLWG.js";
import { n as shouldBypassConfigGuardForCommandPath } from "./command-startup-policy-CK203Oy0.js";
import { t as configureProgramHelp } from "./help-9GNAJbWz.js";
import { t as isCommandJsonOutputMode } from "./json-mode-YCvmk_ys.js";
import { C as setVerbose } from "./logger-BU4ooQvN.js";
import { n as isParentDefaultHelpAction } from "./parent-default-help-DJ8ruS_z.js";
import {
  n as resolvePluginInstallPreactionRequest,
  t as resolvePluginInstallInvalidConfigPolicy,
} from "./plugin-install-config-policy-D-Web6qy.js";
import { t as forceFreePort } from "./ports-D4ZqYd9C.js";
import { n as setProgramContext } from "./program-context-qVxfT0Ao.js";
import { n as defaultRuntime } from "./runtime-kqN0Yohi.js";
import { n as VERSION } from "./version-BZr74W_5.js";
//#region src/cli/program/context.ts
function createProgramContext() {
  let cachedChannelOptions;
  const getChannelOptions = () => {
    if (cachedChannelOptions === void 0) cachedChannelOptions = resolveCliChannelOptions();
    return cachedChannelOptions;
  };
  return {
    programVersion: VERSION,
    get channelOptions() {
      return getChannelOptions();
    },
    get messageChannelOptions() {
      return getChannelOptions().join("|");
    },
    get agentChannelOptions() {
      return ["last", ...getChannelOptions()].join("|");
    },
  };
}
//#endregion
//#region src/cli/program/preaction.ts
function setProcessTitleForCommand(actionCommand) {
  let current = actionCommand;
  while (current.parent && current.parent.parent) current = current.parent;
  const name = current.name();
  const cliName = resolveCliName();
  if (!name || name === cliName) return;
  process.title = `${cliName}-${name}`;
}
function shouldAllowInvalidConfigForAction(actionCommand, commandPath) {
  return (
    resolvePluginInstallInvalidConfigPolicy(
      resolvePluginInstallPreactionRequest({
        actionCommand,
        commandPath,
        argv: process.argv,
      }),
    ) === "allow-plugin-recovery"
  );
}
function getRootCommand(command) {
  let current = command;
  while (current.parent) current = current.parent;
  return current;
}
function getCliLogLevel(actionCommand) {
  const root = getRootCommand(actionCommand);
  if (typeof root.getOptionValueSource !== "function") return;
  if (root.getOptionValueSource("logLevel") !== "cli") return;
  const logLevel = root.opts().logLevel;
  return typeof logLevel === "string" ? logLevel : void 0;
}
function isBareParentDefaultHelpInvocation(actionCommand, argv) {
  if (!isParentDefaultHelpAction(actionCommand)) return false;
  const { commandPath } = resolveCliArgvInvocation(argv);
  const [primary, extra] = commandPath;
  if (extra !== void 0 || !primary) return false;
  return primary === actionCommand.name() || actionCommand.aliases().includes(primary);
}
function registerPreActionHooks(program, programVersion) {
  program.hook("preAction", async (_thisCommand, actionCommand) => {
    setProcessTitleForCommand(actionCommand);
    const argv = process.argv;
    if (isHelpOrVersionInvocation(argv) || isBareParentDefaultHelpInvocation(actionCommand, argv))
      return;
    const { commandPath, startupPolicy } = resolveCliExecutionStartupContext({
      argv,
      jsonOutputMode: isCommandJsonOutputMode(actionCommand, argv),
      env: process.env,
    });
    await applyCliExecutionStartupPresentation({
      startupPolicy,
      version: programVersion,
    });
    const verbose = getVerboseFlag(argv, { includeDebug: true });
    setVerbose(verbose);
    const cliLogLevel = getCliLogLevel(actionCommand);
    if (cliLogLevel) process.env.OPENCLAW_LOG_LEVEL = cliLogLevel;
    if (!verbose) process.env.NODE_NO_WARNINGS ??= "1";
    if (shouldBypassConfigGuardForCommandPath(commandPath)) return;
    await ensureCliExecutionBootstrap({
      runtime: defaultRuntime,
      commandPath,
      startupPolicy,
      allowInvalid: shouldAllowInvalidConfigForAction(actionCommand, commandPath),
    });
  });
}
//#endregion
//#region src/cli/program/build-program.ts
function buildProgram() {
  const program = new Command();
  program.enablePositionalOptions();
  program.exitOverride((err) => {
    process$1.exitCode = typeof err.exitCode === "number" ? err.exitCode : 1;
    throw err;
  });
  const ctx = createProgramContext();
  const argv = process$1.argv;
  setProgramContext(program, ctx);
  configureProgramHelp(program, ctx);
  registerPreActionHooks(program, ctx.programVersion);
  registerProgramCommands(program, ctx, argv);
  return program;
}
//#endregion
export { buildProgram, forceFreePort };
