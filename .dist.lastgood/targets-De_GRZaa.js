import path from "node:path";
import "./agent-runtime-CG9i2LmY.js";
import {
  c as resolveDefaultAgentId,
  o as resolveAgentWorkspaceDir,
  r as resolveAgentConfig,
} from "./agent-scope-config-CXZGyKMl.js";
import { c as resolveHomePath } from "./helpers-DmFQDGwc.js";
//#region extensions/migrate-claude/targets.ts
function resolveTargets(ctx) {
  const cfg = ctx.config;
  const agentId = resolveDefaultAgentId(cfg);
  const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
  const configuredAgentDir = resolveAgentConfig(cfg, agentId)?.agentDir?.trim();
  const agentDir =
    ctx.runtime?.agent?.resolveAgentDir(cfg, agentId) ??
    (configuredAgentDir ? resolveHomePath(configuredAgentDir) : void 0) ??
    path.join(ctx.stateDir, "agents", agentId, "agent");
  return {
    workspaceDir,
    stateDir: ctx.stateDir,
    agentDir,
  };
}
//#endregion
export { resolveTargets as t };
