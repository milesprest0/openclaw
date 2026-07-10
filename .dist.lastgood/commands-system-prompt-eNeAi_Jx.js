import { m as resolveSessionAgentIds } from "./agent-scope-9AmhTwki.js";
import { t as isAcpRuntimeSpawnAvailable } from "./availability-BuUFK0A0.js";
import { a as resolveBootstrapContextForRun } from "./bootstrap-files-C8WUuJVf.js";
import { t as canExecRequestNode } from "./exec-defaults-C4RqVOp-.js";
import { s as resolveDefaultModelForAgent } from "./model-selection-CyVXHdEG.js";
import "./tts-DRYN86wU.js";
import { t as createOpenClawCodingTools } from "./pi-tools-Xm5nmxui.js";
import { n as getSkillsSnapshotVersion } from "./refresh-state-BmEneb6Z.js";
import { t as resolveRuntimePolicySessionKey } from "./runtime-policy-session-key-CBtIrgBf.js";
import "./sandbox-Cz0C2Qt-.js";
import { n as resolveSandboxRuntimeStatus } from "./runtime-status-r0KsiafK.js";
import "./skills-DYy402QP.js";
import { n as resolveEmbeddedFullAccessState } from "./sandbox-info-D5XM2Jco.js";
import { t as getRemoteSkillEligibility } from "./skills-remote-CjCdFOxe.js";
import { t as buildSystemPromptParams } from "./system-prompt-params-DaMSfBYL.js";
import { n as buildAgentSystemPrompt } from "./system-prompt-vWC2MZis.js";
import { n as buildTtsSystemPromptHint } from "./tts-runtime-CfX4V8Mc.js";
import { O as listRegisteredPluginAgentPromptGuidance } from "./types-B6YlI8nn.js";
import { t as buildWorkspaceSkillSnapshot } from "./workspace-FSRlf91o.js";
//#region src/auto-reply/reply/commands-system-prompt.ts
async function resolveCommandsSystemPromptBundle(params) {
  const workspaceDir = params.workspaceDir;
  const targetSessionEntry = params.sessionStore?.[params.sessionKey] ?? params.sessionEntry;
  const { sessionAgentId } = resolveSessionAgentIds({
    sessionKey: params.sessionKey,
    config: params.cfg,
    agentId: params.agentId,
  });
  const { bootstrapFiles, contextFiles: injectedFiles } = await resolveBootstrapContextForRun({
    workspaceDir,
    config: params.cfg,
    sessionKey: params.sessionKey,
    sessionId: targetSessionEntry?.sessionId,
  });
  const sandboxRuntime = resolveSandboxRuntimeStatus({
    cfg: params.cfg,
    sessionKey: resolveRuntimePolicySessionKey({
      cfg: params.cfg,
      ctx: params.ctx,
      sessionKey: params.sessionKey ?? params.ctx.SessionKey,
    }),
  });
  const toolPolicySessionKey = resolveRuntimePolicySessionKey({
    cfg: params.cfg,
    ctx: params.ctx,
    sessionKey: params.sessionKey,
  });
  const skillsPrompt =
    (() => {
      try {
        return buildWorkspaceSkillSnapshot(workspaceDir, {
          config: params.cfg,
          agentId: sessionAgentId,
          eligibility: {
            remote: getRemoteSkillEligibility({
              advertiseExecNode: canExecRequestNode({
                cfg: params.cfg,
                sessionEntry: targetSessionEntry,
                sessionKey: params.sessionKey,
                agentId: sessionAgentId,
              }),
            }),
          },
          snapshotVersion: getSkillsSnapshotVersion(workspaceDir),
        });
      } catch {
        return {
          prompt: "",
          skills: [],
          resolvedSkills: [],
        };
      }
    })().prompt ?? "";
  const tools = (() => {
    try {
      return createOpenClawCodingTools({
        config: params.cfg,
        agentId: sessionAgentId,
        workspaceDir,
        sessionKey: toolPolicySessionKey,
        allowGatewaySubagentBinding: true,
        messageProvider: params.command.channel,
        groupId: targetSessionEntry?.groupId ?? void 0,
        groupChannel: targetSessionEntry?.groupChannel ?? void 0,
        groupSpace: targetSessionEntry?.space ?? void 0,
        spawnedBy: targetSessionEntry?.spawnedBy ?? void 0,
        senderId: params.command.senderId,
        senderName: params.ctx.SenderName,
        senderUsername: params.ctx.SenderUsername,
        senderE164: params.ctx.SenderE164,
        senderIsOwner: params.command.senderIsOwner,
        modelProvider: params.provider,
        modelId: params.model,
      });
    } catch {
      return [];
    }
  })();
  const toolNames = tools.map((t) => t.name);
  const defaultModelRef = resolveDefaultModelForAgent({
    cfg: params.cfg,
    agentId: sessionAgentId,
  });
  const defaultModelLabel = `${defaultModelRef.provider}/${defaultModelRef.model}`;
  const { runtimeInfo, userTimezone, userTime, userTimeFormat } = buildSystemPromptParams({
    config: params.cfg,
    agentId: sessionAgentId,
    workspaceDir,
    cwd: process.cwd(),
    runtime: {
      host: "unknown",
      os: "unknown",
      arch: "unknown",
      node: process.version,
      model: `${params.provider}/${params.model}`,
      defaultModel: defaultModelLabel,
    },
  });
  const fullAccessState = resolveEmbeddedFullAccessState({
    execElevated: {
      enabled: params.elevated.enabled,
      allowed: params.elevated.allowed,
      defaultLevel: params.resolvedElevatedLevel ?? "off",
    },
  });
  const sandboxInfo = sandboxRuntime.sandboxed
    ? {
        enabled: true,
        workspaceDir,
        workspaceAccess: "rw",
        elevated: {
          allowed: params.elevated.allowed,
          defaultLevel: params.resolvedElevatedLevel ?? "off",
          fullAccessAvailable: fullAccessState.available,
          ...(fullAccessState.blockedReason
            ? { fullAccessBlockedReason: fullAccessState.blockedReason }
            : {}),
        },
      }
    : { enabled: false };
  const ttsHint = params.cfg ? buildTtsSystemPromptHint(params.cfg, sessionAgentId) : void 0;
  return {
    systemPrompt: buildAgentSystemPrompt({
      workspaceDir,
      defaultThinkLevel: params.resolvedThinkLevel,
      reasoningLevel: params.resolvedReasoningLevel,
      extraSystemPrompt: void 0,
      ownerNumbers: void 0,
      reasoningTagHint: false,
      toolNames,
      modelAliasLines: [],
      userTimezone,
      userTime,
      userTimeFormat,
      contextFiles: injectedFiles,
      skillsPrompt,
      heartbeatPrompt: void 0,
      ttsHint,
      acpEnabled: isAcpRuntimeSpawnAvailable({
        config: params.cfg,
        sandboxed: sandboxRuntime.sandboxed,
      }),
      nativeCommandGuidanceLines: listRegisteredPluginAgentPromptGuidance(),
      runtimeInfo,
      sandboxInfo,
      memoryCitationsMode: params.cfg?.memory?.citations,
    }),
    tools,
    skillsPrompt,
    bootstrapFiles,
    injectedFiles,
    sandboxRuntime,
  };
}
//#endregion
export { resolveCommandsSystemPromptBundle as t };
