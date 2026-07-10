import os from "node:os";
import path from "node:path";
import { o as resolveRequiredHomeDir } from "./home-dir-iZwpu-40.js";
import { s as normalizeOptionalLowercaseString } from "./string-coerce-BdEutqX5.js";
//#region src/agents/workspace-default.ts
function resolveDefaultAgentWorkspaceDir(env = process.env, homedir = os.homedir) {
  const home = resolveRequiredHomeDir(env, homedir);
  const profile = env.OPENCLAW_PROFILE?.trim();
  if (profile && normalizeOptionalLowercaseString(profile) !== "default")
    return path.join(home, ".openclaw", `workspace-${profile}`);
  return path.join(home, ".openclaw", "workspace");
}
const DEFAULT_AGENT_WORKSPACE_DIR = resolveDefaultAgentWorkspaceDir();
//#endregion
export { resolveDefaultAgentWorkspaceDir as n, DEFAULT_AGENT_WORKSPACE_DIR as t };
