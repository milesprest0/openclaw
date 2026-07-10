import { t as inspectSlackAccount } from "../../account-inspect-C3B0o1hP.js";
//#region extensions/slack/account-inspect-api.ts
function inspectSlackReadOnlyAccount(cfg, accountId) {
  return inspectSlackAccount({
    cfg,
    accountId,
  });
}
//#endregion
export { inspectSlackReadOnlyAccount };
