import { t as createLazyImportLoader } from "./lazy-promise-B1nDYoKn.js";
//#region src/auto-reply/reply/dispatch-acp.runtime.ts
const dispatchAcpLoader = createLazyImportLoader(() => import("./dispatch-acp-cd3KPAD3.js"));
const dispatchAcpCommandBypassLoader = createLazyImportLoader(
  () => import("./dispatch-acp-command-bypass-DrnSBh8F.js"),
);
function loadDispatchAcp() {
  return dispatchAcpLoader.load();
}
function loadDispatchAcpCommandBypass() {
  return dispatchAcpCommandBypassLoader.load();
}
async function shouldBypassAcpDispatchForCommand(...args) {
  return (await loadDispatchAcpCommandBypass()).shouldBypassAcpDispatchForCommand(...args);
}
async function tryDispatchAcpReply(...args) {
  return await (await loadDispatchAcp()).tryDispatchAcpReply(...args);
}
//#endregion
export { shouldBypassAcpDispatchForCommand, tryDispatchAcpReply };
