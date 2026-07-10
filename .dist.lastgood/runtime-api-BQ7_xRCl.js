import { t as createPluginRuntimeStore } from "./runtime-store-Df1JvWZn.js";
import "./channel-policy-y8E9wmaa.js";
import "./outbound-media-C-3tsQ5m.js";
import "./ssrf-runtime-BhFjkd3c.js";
import "./media-runtime-Cj72foO4.js";
import "./channel-status-BLgpG3VN.js";
import "./bundled-channel-config-schema-Bjz3wbg7.js";
import "./channel-config-primitives-BZaUZoEw.js";
import "./channel-actions-Ds3BuQCc.js";
import "./channel-feedback-CsnyeWms.js";
import "./channel-inbound-3vUekbSs.js";
import "./channel-lifecycle-BBBTbPMe.js";
import "./channel-message-Do1b_D-M.js";
import "./channel-pairing-Tw2QazlD.js";
import "./webhook-request-guards-B2YGM1vD.js";
import "./webhook-targets-BEun4-w_.js";
//#region extensions/googlechat/src/runtime.ts
const { setRuntime: setGoogleChatRuntime, getRuntime: getGoogleChatRuntime } =
  createPluginRuntimeStore({
    pluginId: "googlechat",
    errorMessage: "Google Chat runtime not initialized",
  });
//#endregion
export { setGoogleChatRuntime as n, getGoogleChatRuntime as t };
