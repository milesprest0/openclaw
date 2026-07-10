import {
  _ as getCoreCliCommandDescriptors,
  v as getCoreCliCommandNames$1,
} from "./argv-DQxa_OA3.js";
import { t as resolveCliArgvInvocation } from "./argv-invocation-Bc25Z788.js";
import { r as shouldRegisterPrimaryCommandOnly } from "./command-registration-policy-DxSkwxV7.js";
import {
  i as registerCommandGroups,
  r as registerCommandGroupByName,
} from "./register-command-groups-D7CQZkOy.js";
import {
  a as defineImportedCommandGroupSpec,
  i as buildCommandGroupEntries,
  o as defineImportedProgramCommandGroupSpecs,
} from "./register.subclis-core-JjJRMYxT.js";
//#region src/cli/program/command-registry-core.ts
function withProgramOnlySpecs(specs) {
  return specs.map((spec) => ({
    commandNames: spec.commandNames,
    register: async ({ program }) => {
      await spec.register(program);
    },
  }));
}
const coreEntrySpecs = [
  ...withProgramOnlySpecs(
    defineImportedProgramCommandGroupSpecs([
      {
        commandNames: ["crestodian"],
        loadModule: () => import("./register.crestodian-xP67oDXV.js"),
        exportName: "registerCrestodianCommand",
      },
      {
        commandNames: ["setup"],
        loadModule: () => import("./register.setup-CfXaJNVo.js"),
        exportName: "registerSetupCommand",
      },
      {
        commandNames: ["onboard"],
        loadModule: () => import("./register.onboard-D4SfmFd0.js"),
        exportName: "registerOnboardCommand",
      },
      {
        commandNames: ["configure"],
        loadModule: () => import("./register.configure-CU15wb78.js"),
        exportName: "registerConfigureCommand",
      },
      {
        commandNames: ["config"],
        loadModule: () => import("./config-cli-DnDenb6t.js"),
        exportName: "registerConfigCli",
      },
      {
        commandNames: ["backup"],
        loadModule: () => import("./register.backup-CcTlwQX2.js"),
        exportName: "registerBackupCommand",
      },
      {
        commandNames: ["migrate"],
        loadModule: () => import("./register.migrate-4bo1gUpa.js"),
        exportName: "registerMigrateCommand",
      },
      {
        commandNames: ["doctor", "dashboard", "reset", "uninstall"],
        loadModule: () => import("./register.maintenance-CY6dw6Mk.js"),
        exportName: "registerMaintenanceCommands",
      },
    ]),
  ),
  defineImportedCommandGroupSpec(
    ["message"],
    () => import("./register.message-CwrxoYLC.js"),
    (mod, { program, ctx }) => {
      mod.registerMessageCommands(program, ctx);
    },
  ),
  ...withProgramOnlySpecs(
    defineImportedProgramCommandGroupSpecs([
      {
        commandNames: ["mcp"],
        loadModule: () => import("./mcp-cli-BqnGfUy1.js"),
        exportName: "registerMcpCli",
      },
    ]),
  ),
  defineImportedCommandGroupSpec(
    ["agent", "agents"],
    () => import("./register.agent-Dnvc1iCq.js"),
    (mod, { program, ctx }) => {
      mod.registerAgentCommands(program, { agentChannelOptions: ctx.agentChannelOptions });
    },
  ),
  ...withProgramOnlySpecs(
    defineImportedProgramCommandGroupSpecs([
      {
        commandNames: ["status", "health", "sessions", "commitments", "tasks"],
        loadModule: () => import("./register.status-health-sessions-3eKAdZra.js"),
        exportName: "registerStatusHealthSessionsCommands",
      },
    ]),
  ),
];
function resolveCoreCommandGroups(ctx, argv) {
  return buildCommandGroupEntries(
    getCoreCliCommandDescriptors(),
    coreEntrySpecs,
    (register) => async (program) => {
      await register({
        program,
        ctx,
        argv,
      });
    },
  );
}
function getCoreCliCommandNames() {
  return getCoreCliCommandNames$1();
}
async function registerCoreCliByName(program, ctx, name, argv = process.argv) {
  return registerCommandGroupByName(program, resolveCoreCommandGroups(ctx, argv), name);
}
function registerCoreCliCommands(program, ctx, argv) {
  const { primary } = resolveCliArgvInvocation(argv);
  registerCommandGroups(program, resolveCoreCommandGroups(ctx, argv), {
    eager: false,
    primary,
    registerPrimaryOnly: Boolean(primary && shouldRegisterPrimaryCommandOnly(argv)),
  });
}
//#endregion
export { registerCoreCliByName as n, registerCoreCliCommands as r, getCoreCliCommandNames as t };
