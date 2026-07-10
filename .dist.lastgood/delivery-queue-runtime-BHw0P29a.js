import { n as drainPendingDeliveries$1 } from "./delivery-queue-jB0MZzlm.js";
//#region src/plugin-sdk/delivery-queue-runtime.ts
let outboundDeliverRuntimePromise = null;
async function loadOutboundDeliverRuntime() {
  outboundDeliverRuntimePromise ??= import("./deliver-runtime-DredlW6O.js");
  return await outboundDeliverRuntimePromise;
}
async function drainPendingDeliveries(opts) {
  const deliver = opts.deliver ?? (await loadOutboundDeliverRuntime()).deliverOutboundPayloads;
  await drainPendingDeliveries$1({
    ...opts,
    deliver,
  });
}
//#endregion
export { drainPendingDeliveries as t };
