import { o as resolveTelegramAccount } from "./accounts-u_rpwiv9.js";
import { t as resolveReactionLevel } from "./text-runtime-lKuAtsoz.js";
//#region extensions/telegram/src/reaction-level.ts
/**
 * Resolve the effective reaction level and its implications.
 */
function resolveTelegramReactionLevel(params) {
  return resolveReactionLevel({
    value: resolveTelegramAccount({
      cfg: params.cfg,
      accountId: params.accountId,
    }).config.reactionLevel,
    defaultLevel: "minimal",
    invalidFallback: "ack",
  });
}
//#endregion
export { resolveTelegramReactionLevel as t };
