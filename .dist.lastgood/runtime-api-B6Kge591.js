import "./file-lock-C5nUdr1w.js";
import { t as createPluginRuntimeStore } from "./runtime-store-Df1JvWZn.js";
import "./channel-policy-y8E9wmaa.js";
import "./inbound-reply-dispatch-BaAUAC_q.js";
import "./outbound-media-C-3tsQ5m.js";
import "./ssrf-runtime-BhFjkd3c.js";
import "./media-runtime-Cj72foO4.js";
import "./channel-status-BLgpG3VN.js";
import "./channel-lifecycle-BBBTbPMe.js";
import "./channel-message-Do1b_D-M.js";
import "./channel-pairing-Tw2QazlD.js";
import "./channel-targets-Bk_MNZIj.js";
import "./webhook-ingress-BWEossCd.js";
//#region extensions/msteams/src/runtime.ts
const {
  setRuntime: setMSTeamsRuntime,
  getRuntime: getMSTeamsRuntime,
  tryGetRuntime: getOptionalMSTeamsRuntime,
} = createPluginRuntimeStore({
  pluginId: "msteams",
  errorMessage: "MSTeams runtime not initialized",
});
//#endregion
export { getOptionalMSTeamsRuntime as n, setMSTeamsRuntime as r, getMSTeamsRuntime as t };
