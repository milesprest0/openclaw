import "./session-binding-service-DjzRXKiv.js";
import "./thread-bindings-policy-CD0S48SB.js";
import "./conversation-binding-C44M7Qbh.js";
import "./binding-registry-CM9LsNMd.js";
import "./session-CUCa4TmV.js";
import "./pairing-store-CzWw0BEc.js";
import "./dm-policy-shared-COpbJNwP.js";
import "./binding-targets-DVGRSd-T.js";
import "./binding-routing-BUtBDbgl.js";
import "./pairing-labels-4nTcW2E_.js";
//#region src/channels/session-meta.ts
let inboundSessionRuntimePromise = null;
function loadInboundSessionRuntime() {
  inboundSessionRuntimePromise ??= import("./inbound.runtime-Cx3QM-4Y.js");
  return inboundSessionRuntimePromise;
}
async function recordInboundSessionMetaSafe(params) {
  const runtime = await loadInboundSessionRuntime();
  const storePath = runtime.resolveStorePath(params.cfg.session?.store, {
    agentId: params.agentId,
  });
  try {
    await runtime.recordSessionMetaFromInbound({
      storePath,
      sessionKey: params.sessionKey,
      ctx: params.ctx,
    });
  } catch (err) {
    params.onError?.(err);
  }
}
//#endregion
export { recordInboundSessionMetaSafe as t };
