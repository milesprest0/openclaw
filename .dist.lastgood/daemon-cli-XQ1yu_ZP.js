import { t as formatDocsLink } from "./links-CNfoPWBd.js";
import { t as addGatewayServiceCommands } from "./register-service-commands-CVjbLF-m.js";
import { r as theme } from "./theme-CiH_wF8x.js";
import "./install-B13nQGLF.js";
import "./lifecycle-DbB5jDZD.js";
import "./status-ClkhrA2r.js";
//#region src/cli/daemon-cli/register.ts
function registerDaemonCli(program) {
  addGatewayServiceCommands(
    program
      .command("daemon")
      .description("Manage the Gateway service (launchd/systemd/schtasks)")
      .addHelpText(
        "after",
        () =>
          `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/gateway", "docs.openclaw.ai/cli/gateway")}\n`,
      ),
    { statusDescription: "Show service install status + probe connectivity/capability" },
  );
}
//#endregion
export { registerDaemonCli as t };
