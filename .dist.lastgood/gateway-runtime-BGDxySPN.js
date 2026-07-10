import "./net-BQYp2xgJ.js";
import "./auth-D_VLzYQI.js";
import "./client-BYqFLh-J.js";
import "./protocol-CUn5aLrV.js";
import "./operator-approvals-client-Bc-BK66V.js";
import "./gateway-rpc-DjTKEsJd.js";
import "./hosted-plugin-surface-url-h_tPqmcm.js";
import "./node-command-policy-y9_MR0c9.js";
import "./nodes.helpers-DSpmaAH8.js";
import "./startup-auth-D6PPTaYB.js";
//#region src/gateway/channel-status-patches.ts
function createConnectedChannelStatusPatch(at = Date.now()) {
  return {
    connected: true,
    lastConnectedAt: at,
    lastEventAt: at,
  };
}
function createTransportActivityStatusPatch(at = Date.now()) {
  return { lastTransportActivityAt: at };
}
//#endregion
export { createTransportActivityStatusPatch as n, createConnectedChannelStatusPatch as t };
