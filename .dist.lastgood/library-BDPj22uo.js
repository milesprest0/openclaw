import { t as createDefaultDeps } from "./deps-C1pDH524.js";
import { a as loadConfig } from "./io-CEQSCTGy.js";
import "./config-CMOdcWpc.js";
import { u as resolveStorePath } from "./paths-CfeECf6Z.js";
import {
  i as handlePortError,
  n as describePortOwner,
  r as ensurePortAvailable,
  t as PortInUseError,
} from "./ports-CzR_dSOf.js";
import { n as resolveSessionKey, t as deriveSessionKey } from "./session-key-rmPyTKf_.js";
import { a as saveSessionStore } from "./store-BpWdoYPF.js";
import { t as loadSessionStore } from "./store-load-BSFLPYqQ.js";
import { t as applyTemplate } from "./templating-DYCgkoJ5.js";
import { l as normalizeE164 } from "./utils-BGRcpLKt.js";
import { t as waitForever } from "./wait-DQrkJiss.js";
//#region src/library.ts
let replyRuntimePromise = null;
let promptRuntimePromise = null;
let binariesRuntimePromise = null;
let execRuntimePromise = null;
let webChannelRuntimePromise = null;
function loadReplyRuntime() {
  replyRuntimePromise ??= import("./reply.runtime.js");
  return replyRuntimePromise;
}
function loadPromptRuntime() {
  promptRuntimePromise ??= import("./prompt-BSXZJCLD.js");
  return promptRuntimePromise;
}
function loadBinariesRuntime() {
  binariesRuntimePromise ??= import("./binaries-DaklAiYp.js");
  return binariesRuntimePromise;
}
function loadExecRuntime() {
  execRuntimePromise ??= import("./exec-D0Shggr5.js");
  return execRuntimePromise;
}
function loadWebChannelRuntime() {
  webChannelRuntimePromise ??= import("./runtime-web-channel-plugin-DC6Kyxrh.js");
  return webChannelRuntimePromise;
}
const getReplyFromConfig = async (...args) =>
  (await loadReplyRuntime()).getReplyFromConfig(...args);
const promptYesNo = async (...args) => (await loadPromptRuntime()).promptYesNo(...args);
const ensureBinary = async (...args) => (await loadBinariesRuntime()).ensureBinary(...args);
const runExec = async (...args) => (await loadExecRuntime()).runExec(...args);
const runCommandWithTimeout = async (...args) =>
  (await loadExecRuntime()).runCommandWithTimeout(...args);
const monitorWebChannel = async (...args) =>
  (await loadWebChannelRuntime()).monitorWebChannel(...args);
//#endregion
export {
  PortInUseError,
  applyTemplate,
  createDefaultDeps,
  deriveSessionKey,
  describePortOwner,
  ensureBinary,
  ensurePortAvailable,
  getReplyFromConfig,
  handlePortError,
  loadConfig,
  loadSessionStore,
  monitorWebChannel,
  normalizeE164,
  promptYesNo,
  resolveSessionKey,
  resolveStorePath,
  runCommandWithTimeout,
  runExec,
  saveSessionStore,
  waitForever,
};
