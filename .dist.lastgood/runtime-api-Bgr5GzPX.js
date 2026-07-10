import { t as createPluginRuntimeStore } from "./runtime-store-Df1JvWZn.js";
import "./channel-policy-y8E9wmaa.js";
import "./ssrf-runtime-BhFjkd3c.js";
import "./channel-message-Do1b_D-M.js";
import "./channel-pairing-Tw2QazlD.js";
//#region extensions/nextcloud-talk/src/runtime.ts
const { setRuntime: setNextcloudTalkRuntime, getRuntime: getNextcloudTalkRuntime } =
  createPluginRuntimeStore({
    pluginId: "nextcloud-talk",
    errorMessage: "Nextcloud Talk runtime not initialized",
  });
//#endregion
export { setNextcloudTalkRuntime as n, getNextcloudTalkRuntime as t };
