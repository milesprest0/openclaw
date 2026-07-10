import { t as hasControlCommand } from "./command-detection-CTqIeWA8.js";
import { a as resolveEnvelopeFormatOptions } from "./envelope-DWEYsyXr.js";
import {
  n as resolveInboundDebounceMs,
  t as createInboundDebouncer,
} from "./inbound-debounce-A6RXlMbt.js";
import "./sessions-Bdy1wToU.js";
import "./mentions-CX9MvOD0.js";
import { u as resolveStorePath } from "./paths-CfeECf6Z.js";
import { n as readSessionUpdatedAt } from "./store-BpWdoYPF.js";
import { c as normalizeOptionalString } from "./string-coerce-BdEutqX5.js";
import "./direct-dm-C8n1Ky-y.js";
//#region src/channels/inbound-debounce-policy.ts
function shouldDebounceTextInbound(params) {
  if (params.allowDebounce === false) return false;
  if (params.hasMedia) return false;
  const text = normalizeOptionalString(params.text) ?? "";
  if (!text) return false;
  return !hasControlCommand(text, params.cfg, params.commandOptions);
}
function createChannelInboundDebouncer(params) {
  const debounceMs = resolveInboundDebounceMs({
    cfg: params.cfg,
    channel: params.channel,
    overrideMs: params.debounceMsOverride,
  });
  const { cfg: _cfg, channel: _channel, debounceMsOverride: _override, ...rest } = params;
  return {
    debounceMs,
    debouncer: createInboundDebouncer({
      debounceMs,
      ...rest,
    }),
  };
}
//#endregion
//#region src/channels/session-envelope.ts
function resolveInboundSessionEnvelopeContext(params) {
  const storePath = resolveStorePath(params.cfg.session?.store, { agentId: params.agentId });
  return {
    storePath,
    envelopeOptions: resolveEnvelopeFormatOptions(params.cfg),
    previousTimestamp: readSessionUpdatedAt({
      storePath,
      sessionKey: params.sessionKey,
    }),
  };
}
//#endregion
export {
  createChannelInboundDebouncer as n,
  shouldDebounceTextInbound as r,
  resolveInboundSessionEnvelopeContext as t,
};
