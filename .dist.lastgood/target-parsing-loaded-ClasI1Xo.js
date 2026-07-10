import { m as resolveChannelRouteTargetWithParser } from "./channel-route-B9olp3tt.js";
import { t as getLoadedChannelPluginForRead } from "./registry-loaded-read-MOL61L91.js";
import { c as normalizeOptionalString } from "./string-coerce-BdEutqX5.js";
//#region src/channels/plugins/target-parsing-loaded.ts
function parseExplicitTargetForLoadedChannel(channel, rawTarget) {
  const resolvedChannel = normalizeOptionalString(channel);
  if (!resolvedChannel) return null;
  return (
    getLoadedChannelPluginForRead(resolvedChannel)?.messaging?.parseExplicitTarget?.({
      raw: rawTarget,
    }) ?? null
  );
}
function resolveRouteTargetForLoadedChannel(params) {
  return resolveChannelRouteTargetWithParser({
    ...params,
    parseExplicitTarget: parseExplicitTargetForLoadedChannel,
  });
}
//#endregion
export { resolveRouteTargetForLoadedChannel as n, parseExplicitTargetForLoadedChannel as t };
