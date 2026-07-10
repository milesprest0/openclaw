import { m as readWebAuthState } from "./auth-store-2Cym1SYy.js";
import { t as whatsappSetupAdapter } from "./setup-core-Icz4K5UH.js";
import {
  a as resolveWhatsAppGroupToolPolicy,
  i as resolveWhatsAppGroupRequireMention,
  o as resolveWhatsAppGroupIntroHint,
  r as whatsappSetupWizardProxy,
  t as createWhatsAppPluginBase,
} from "./shared-DktKaKuA.js";
import { t as detectWhatsAppLegacyStateMigrations } from "./state-migrations-C-FmCLm6.js";
//#region extensions/whatsapp/src/channel.setup.ts
const whatsappSetupPlugin = {
  ...createWhatsAppPluginBase({
    groups: {
      resolveRequireMention: resolveWhatsAppGroupRequireMention,
      resolveToolPolicy: resolveWhatsAppGroupToolPolicy,
      resolveGroupIntroHint: resolveWhatsAppGroupIntroHint,
    },
    setupWizard: whatsappSetupWizardProxy,
    setup: whatsappSetupAdapter,
    isConfigured: async (account) => (await readWebAuthState(account.authDir)) === "linked",
  }),
  lifecycle: {
    detectLegacyStateMigrations: ({ oauthDir }) =>
      detectWhatsAppLegacyStateMigrations({ oauthDir }),
  },
};
//#endregion
export { whatsappSetupPlugin as t };
