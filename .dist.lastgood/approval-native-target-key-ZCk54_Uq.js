import { n as channelRouteDedupeKey } from "./channel-route-B9olp3tt.js";
//#region src/infra/approval-native-target-key.ts
function buildChannelApprovalNativeTargetKey(target) {
  return channelRouteDedupeKey({
    to: target.to,
    threadId: target.threadId,
  });
}
//#endregion
export { buildChannelApprovalNativeTargetKey as t };
