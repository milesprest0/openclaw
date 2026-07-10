import {
  a as resolveAgentDir,
  o as resolveAgentWorkspaceDir,
} from "./agent-scope-config-CXZGyKMl.js";
import "./agent-scope-9AmhTwki.js";
import { n as DEFAULT_MODEL, r as DEFAULT_PROVIDER } from "./defaults-4m7JJmD2.js";
import { n as resolveAgentIdentity } from "./identity-BfuOtf2o.js";
import { m as resolveThinkingDefault } from "./model-selection-CyVXHdEG.js";
import { i as resolveSessionFilePath, u as resolveStorePath } from "./paths-CfeECf6Z.js";
import "./sessions-Bdy1wToU.js";
import { t as runEmbeddedPiAgent } from "./pi-embedded-D_bdRDPs.js";
import {
  a as saveSessionStore,
  c as updateSessionStoreEntry,
  s as updateSessionStore,
} from "./store-BpWdoYPF.js";
import { t as loadSessionStore } from "./store-load-BSFLPYqQ.js";
import { t as resolveAgentTimeoutMs } from "./timeout-06zKgWsk.js";
import { l as ensureAgentWorkspace } from "./workspace-DvzHmVcJ.js";
//#region src/extensionAPI.ts
if (process.env.VITEST !== "true" && process.env.OPENCLAW_SUPPRESS_EXTENSION_API_WARNING !== "1")
  process.emitWarning(
    "openclaw/extension-api is deprecated. Migrate to api.runtime.agent.* or focused openclaw/plugin-sdk/<subpath> imports. See https://docs.openclaw.ai/plugins/sdk-migration",
    {
      code: "OPENCLAW_EXTENSION_API_DEPRECATED",
      detail:
        "This compatibility bridge is temporary. Bundled plugins should use the injected plugin runtime instead of importing host-side agent helpers directly. Migration guide: https://docs.openclaw.ai/plugins/sdk-migration",
    },
  );
//#endregion
export {
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  ensureAgentWorkspace,
  loadSessionStore,
  resolveAgentDir,
  resolveAgentIdentity,
  resolveAgentTimeoutMs,
  resolveAgentWorkspaceDir,
  resolveSessionFilePath,
  resolveStorePath,
  resolveThinkingDefault,
  runEmbeddedPiAgent,
  saveSessionStore,
  updateSessionStore,
  updateSessionStoreEntry,
};
