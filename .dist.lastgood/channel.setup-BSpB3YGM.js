import { n as zalouserSetupAdapter } from "./setup-core-BKAKPD2K.js";
import { t as zalouserSetupWizard } from "./setup-surface-a4xmFBYp.js";
import { t as createZalouserPluginBase } from "./shared-DsUukNj1.js";
//#region extensions/zalouser/src/channel.setup.ts
const zalouserSetupPlugin = {
  ...createZalouserPluginBase({
    setupWizard: zalouserSetupWizard,
    setup: zalouserSetupAdapter,
  }),
};
//#endregion
export { zalouserSetupPlugin as t };
