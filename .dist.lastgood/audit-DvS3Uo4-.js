import { t as inspectDiscordAccount } from "./account-inspect-BuHX2gS-.js";
import {
  n as collectDiscordAuditChannelIdsForAccount,
  t as auditDiscordChannelPermissionsWithFetcher,
} from "./audit-core-BMqaZo97.js";
import "./send-MjDHAxf5.js";
import { T as fetchChannelPermissionsDiscord } from "./send.shared-DW2ozbKR.js";
//#region extensions/discord/src/audit.ts
function collectDiscordAuditChannelIds(params) {
  return collectDiscordAuditChannelIdsForAccount(
    inspectDiscordAccount({
      cfg: params.cfg,
      accountId: params.accountId,
    }).config,
  );
}
async function auditDiscordChannelPermissions(params) {
  return await auditDiscordChannelPermissionsWithFetcher({
    ...params,
    fetchChannelPermissions: fetchChannelPermissionsDiscord,
  });
}
//#endregion
export { collectDiscordAuditChannelIds as n, auditDiscordChannelPermissions as t };
