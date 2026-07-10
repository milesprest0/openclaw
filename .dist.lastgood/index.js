#!/usr/bin/env node
import process from "node:process";
import { fileURLToPath } from "node:url";
import { o as formatUncaughtError } from "./errors-DZMrVkYL.js";
import { r as runFatalErrorHooks } from "./fatal-error-hooks-BxtOCQYK.js";
import { t as isMainModule } from "./is-main-BIZ-zU-I.js";
import { t as assertNotRoot } from "./root-guard-BLJBaOhO.js";
import {
  c as isUncaughtExceptionHandled,
  r as isBenignUncaughtExceptionError,
  t as installUnhandledRejectionHandler,
} from "./unhandled-rejections-ChRE0RCv.js";
//#region src/index.ts
let applyTemplate;
let createDefaultDeps;
let deriveSessionKey;
let describePortOwner;
let ensureBinary;
let ensurePortAvailable;
let getReplyFromConfig;
let handlePortError;
let loadConfig;
let loadSessionStore;
let monitorWebChannel;
let normalizeE164;
let PortInUseError;
let promptYesNo;
let resolveSessionKey;
let resolveStorePath;
let runCommandWithTimeout;
let runExec;
let saveSessionStore;
let waitForever;
async function loadLegacyCliDeps() {
  const { runCli } = await import("./cli/run-main.js");
  return { runCli };
}
async function runLegacyCliEntry(argv = process.argv, deps) {
  assertNotRoot();
  const { runCli } = deps ?? (await loadLegacyCliDeps());
  await runCli(argv);
}
const isMain = isMainModule({ currentFile: fileURLToPath(import.meta.url) });
if (!isMain)
  ({
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
    PortInUseError,
    promptYesNo,
    resolveSessionKey,
    resolveStorePath,
    runCommandWithTimeout,
    runExec,
    saveSessionStore,
    waitForever,
  } = await import("./library-BDPj22uo.js"));
if (isMain) {
  const { restoreTerminalState } = await import("./restore-BsToLA9W.js");
  installUnhandledRejectionHandler();
  process.on("uncaughtException", (error) => {
    if (isUncaughtExceptionHandled(error)) return;
    if (isBenignUncaughtExceptionError(error)) {
      console.warn(
        "[openclaw] Non-fatal uncaught exception (continuing):",
        formatUncaughtError(error),
      );
      return;
    }
    console.error("[openclaw] Uncaught exception:", formatUncaughtError(error));
    for (const message of runFatalErrorHooks({
      reason: "uncaught_exception",
      error,
    }))
      console.error("[openclaw]", message);
    restoreTerminalState("uncaught exception", { resumeStdinIfPaused: false });
    process.exit(1);
  });
  runLegacyCliEntry(process.argv).catch((err) => {
    console.error("[openclaw] CLI failed:", formatUncaughtError(err));
    for (const message of runFatalErrorHooks({
      reason: "legacy_cli_failure",
      error: err,
    }))
      console.error("[openclaw]", message);
    restoreTerminalState("legacy cli failure", { resumeStdinIfPaused: false });
    process.exit(1);
  });
}
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
  runLegacyCliEntry,
  saveSessionStore,
  waitForever,
};
