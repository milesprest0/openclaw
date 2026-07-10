import { intro, outro } from "@clack/prompts";
import { r as stylePromptTitle } from "./prompt-style-ZgH7vAUU.js";
//#region src/flows/doctor-health.ts
const intro$1 = (message) => intro(stylePromptTitle(message) ?? message);
const outro$1 = (message) => outro(stylePromptTitle(message) ?? message);
async function doctorCommand(runtime, options = {}) {
  const effectiveRuntime = runtime ?? (await import("./runtime-hlC1SoF8.js")).defaultRuntime;
  if (options.repair === true || options.yes === true || options.generateGatewayToken === true) {
    const { assertConfigWriteAllowedInCurrentMode } = await import("./config/config.js");
    assertConfigWriteAllowedInCurrentMode();
  }
  const { createDoctorPrompter } = await import("./doctor-prompter-BfI6QkFG.js");
  const { printWizardHeader } = await import("./onboard-helpers-BTj6NKFG.js");
  const prompter = createDoctorPrompter({
    runtime: effectiveRuntime,
    options,
  });
  printWizardHeader(effectiveRuntime);
  intro$1("OpenClaw doctor");
  const { resolveOpenClawPackageRoot } = await import("./openclaw-root-CGdsPhj-.js");
  const root = await resolveOpenClawPackageRoot({
    moduleUrl: import.meta.url,
    argv1: process.argv[1],
    cwd: process.cwd(),
  });
  const { maybeOfferUpdateBeforeDoctor } = await import("./doctor-update-CULG7lOP.js");
  if (
    (
      await maybeOfferUpdateBeforeDoctor({
        runtime: effectiveRuntime,
        options,
        root,
        confirm: (p) => prompter.confirm(p),
        outro: outro$1,
      })
    ).handled
  )
    return;
  const { maybeRepairUiProtocolFreshness } = await import("./doctor-ui-D3jOq7Hd.js");
  const { noteSourceInstallIssues } = await import("./doctor-install-Bo1vIpgt.js");
  const { noteStalePluginRuntimeSymlinks } = await import("./plugin-runtime-symlinks-DQvSvg8y.js");
  const { noteStartupOptimizationHints } = await import("./doctor-platform-notes-C9jDUq0f.js");
  await maybeRepairUiProtocolFreshness(effectiveRuntime, prompter);
  noteSourceInstallIssues(root);
  await noteStalePluginRuntimeSymlinks(root);
  noteStartupOptimizationHints();
  const { loadAndMaybeMigrateDoctorConfig } = await import("./doctor-config-flow-DTPe2hQN.js");
  const configResult = await loadAndMaybeMigrateDoctorConfig({
    options,
    confirm: (p) => prompter.confirm(p),
    runtime: effectiveRuntime,
    prompter,
  });
  const { CONFIG_PATH } = await import("./config/config.js");
  const ctx = {
    runtime: effectiveRuntime,
    options,
    prompter,
    configResult,
    cfg: configResult.cfg,
    cfgForPersistence: structuredClone(configResult.cfg),
    sourceConfigValid: configResult.sourceConfigValid ?? true,
    configPath: configResult.path ?? CONFIG_PATH,
  };
  const { runDoctorHealthContributions } =
    await import("./doctor-health-contributions-BvZKG89U.js");
  await runDoctorHealthContributions(ctx);
  outro$1("Doctor complete.");
}
//#endregion
export { doctorCommand };
