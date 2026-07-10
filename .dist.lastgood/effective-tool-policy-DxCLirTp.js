import {
  a as resolveTrustedGroupId,
  i as resolveSubagentToolPolicyForSession,
  n as resolveEffectiveToolPolicy,
  r as resolveGroupToolPolicy,
} from "./pi-tools.policy-BdujgZXP.js";
import {
  i as resolveSubagentCapabilityStore,
  t as isSubagentEnvelopeSession,
} from "./subagent-capabilities-C7k0LjTH.js";
import {
  r as applyOwnerOnlyToolPolicy,
  u as mergeAlsoAllowPolicy,
} from "./tool-policy-_3QUoIEC.js";
import {
  n as buildDefaultToolPolicyPipelineSteps,
  t as applyToolPolicyPipeline,
} from "./tool-policy-pipeline-CfjRSN_s.js";
import { a as resolveToolProfilePolicy } from "./tool-policy-shared-DsbREhoR.js";
import { i as getPluginToolMeta } from "./tools-DcY_52BH.js";
//#region src/agents/pi-embedded-runner/effective-tool-policy.ts
const CORE_ALWAYS_ON_TOOLS = new Set([
  "message",
  "exec",
  "read",
  "edit",
  "sessions_spawn",
  "sessions_send",
  "sessions_yield",
]);
const LAZY_TOOL_INTENT_MATCHERS = [
  {
    tool: "image_generate",
    pattern: /\b(image|images|photo|picture|screenshot|logo|illustration|avatar)\b/iu,
  },
  {
    tool: "music_generate",
    pattern: /\b(music|song|melody|audio track|soundtrack|beat)\b/iu,
  },
  {
    tool: "video_generate",
    pattern: /\b(video|clip|movie|animation|gif)\b/iu,
  },
  {
    tool: "pdf",
    pattern: /\b(pdf|document|paper|scan|transcript file)\b/iu,
  },
  {
    tool: "nodes",
    pattern: /\b(nodes?|workflow|flow|canvas)\b/iu,
  },
];
function applyLazyToolExposurePolicy(params) {
  if (params.tools.length === 0) return params.tools;
  if (!(params.config?.agents?.defaults?.toolExposure?.lazy === true)) return params.tools;
  const intentText = (params.userIntentText ?? "").trim();
  const intentMatchedTools = /* @__PURE__ */ new Set();
  for (const matcher of LAZY_TOOL_INTENT_MATCHERS)
    if (matcher.pattern.test(intentText)) intentMatchedTools.add(matcher.tool);
  return params.tools.filter((tool) => {
    if (CORE_ALWAYS_ON_TOOLS.has(tool.name)) return true;
    if (!LAZY_TOOL_INTENT_MATCHERS.some((matcher) => matcher.tool === tool.name)) return true;
    return intentMatchedTools.has(tool.name);
  });
}
function applyFinalEffectiveToolPolicy(params) {
  if (params.bundledTools.length === 0) return params.bundledTools;
  const trustedGroup = resolveTrustedGroupId(params);
  if (trustedGroup.dropped)
    params.warn(
      "effective tool policy: dropping caller-provided groupId that does not match session-derived group context",
    );
  const {
    agentId,
    globalPolicy,
    globalProviderPolicy,
    agentPolicy,
    agentProviderPolicy,
    profile,
    providerProfile,
    profileAlsoAllow,
    providerProfileAlsoAllow,
  } = resolveEffectiveToolPolicy({
    config: params.config,
    sessionKey: params.sessionKey,
    agentId: params.agentId,
    modelProvider: params.modelProvider,
    modelId: params.modelId,
  });
  const groupPolicy = resolveGroupToolPolicy({
    config: params.config,
    sessionKey: params.sessionKey,
    spawnedBy: params.spawnedBy,
    messageProvider: params.messageProvider,
    groupId: trustedGroup.groupId,
    groupChannel: trustedGroup.dropped ? null : params.groupChannel,
    groupSpace: trustedGroup.dropped ? null : params.groupSpace,
    accountId: params.agentAccountId,
    senderId: params.senderId,
    senderName: params.senderName,
    senderUsername: params.senderUsername,
    senderE164: params.senderE164,
  });
  const profilePolicy = resolveToolProfilePolicy(profile);
  const providerProfilePolicy = resolveToolProfilePolicy(providerProfile);
  const profilePolicyWithAlsoAllow = mergeAlsoAllowPolicy(profilePolicy, profileAlsoAllow);
  const providerProfilePolicyWithAlsoAllow = mergeAlsoAllowPolicy(
    providerProfilePolicy,
    providerProfileAlsoAllow,
  );
  const subagentStore = resolveSubagentCapabilityStore(params.sessionKey, { cfg: params.config });
  const subagentPolicy =
    params.sessionKey &&
    isSubagentEnvelopeSession(params.sessionKey, {
      cfg: params.config,
      store: subagentStore,
    })
      ? resolveSubagentToolPolicyForSession(params.config, params.sessionKey, {
          store: subagentStore,
        })
      : void 0;
  const ownerFiltered = applyOwnerOnlyToolPolicy(
    params.bundledTools,
    params.senderIsOwner === true,
    params.ownerOnlyToolAllowlist,
  );
  const pipelineSteps = [
    ...buildDefaultToolPolicyPipelineSteps({
      profilePolicy: profilePolicyWithAlsoAllow,
      profile,
      profileUnavailableCoreWarningAllowlist: profilePolicy?.allow,
      providerProfilePolicy: providerProfilePolicyWithAlsoAllow,
      providerProfile,
      providerProfileUnavailableCoreWarningAllowlist: providerProfilePolicy?.allow,
      globalPolicy,
      globalProviderPolicy,
      agentPolicy,
      agentProviderPolicy,
      groupPolicy,
      agentId,
    }),
    {
      policy: params.sandboxToolPolicy,
      label: "sandbox tools.allow",
    },
    {
      policy: subagentPolicy,
      label: "subagent tools.allow",
    },
  ].map((step) => Object.assign({}, step, { suppressUnavailableCoreToolWarning: true }));
  return applyToolPolicyPipeline({
    tools: ownerFiltered,
    toolMeta: (tool) => getPluginToolMeta(tool),
    warn: params.warn,
    steps: pipelineSteps,
  });
}
//#endregion
export { applyLazyToolExposurePolicy as n, applyFinalEffectiveToolPolicy as t };
