import { t as inspectDiscordAccount } from "../../account-inspect-BuHX2gS-.js";
//#region extensions/discord/account-inspect-api.ts
function inspectDiscordReadOnlyAccount(cfg, accountId) {
  return inspectDiscordAccount({
    cfg,
    accountId,
  });
}
//#endregion
export { inspectDiscordReadOnlyAccount };
