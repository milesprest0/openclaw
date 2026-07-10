import {
  d as resetAgentEventsForTest,
  i as emitAgentEvent,
  l as onAgentEvent,
} from "../agent-events-c6-2eZvI.js";
import {
  a as createCodexAppServerToolResultExtensionRunner,
  c as runAgentHarnessBeforeCompactionHook,
  i as inferToolMetaFromArgs,
  n as classifyAgentHarnessTerminalOutcome,
  o as resolveAgentHarnessBeforePromptBuildResult,
  r as formatToolProgressOutput,
  s as runAgentHarnessAfterCompactionHook,
  t as TOOL_PROGRESS_OUTPUT_MAX_CHARS,
} from "../agent-harness-runtime-CRXkNxrN.js";
import { m as resolveSessionAgentIds } from "../agent-scope-9AmhTwki.js";
import {
  a as resolveAgentDir,
  s as resolveDefaultAgentDir,
} from "../agent-scope-config-CXZGyKMl.js";
import { t as formatApprovalDisplayPath } from "../approval-display-paths-z_-7Vskn.js";
import { r as resolveAttemptSpawnWorkspaceDir } from "../attempt.thread-helpers-CPhQxp3A.js";
import {
  S as isMessagingToolSendAction,
  a as buildHarnessContextEngineRuntimeContextFromUsage,
  c as runHarnessContextEngineMaintenance,
  d as runAgentCleanupStep,
  g as filterToolResultMediaUrls,
  i as buildHarnessContextEngineRuntimeContext,
  l as logAgentRuntimeToolDiagnostics,
  m as extractToolResultMediaArtifact,
  n as assembleHarnessContextEngine,
  o as finalizeHarnessContextEngineTurn,
  r as bootstrapHarnessContextEngine,
  s as isActiveHarnessContextEngine,
  t as buildEmbeddedAttemptToolRunContext,
  u as normalizeAgentRuntimeTools,
  x as isMessagingTool,
} from "../attempt.tool-run-context-DNKKeHVU.js";
import { a as resolveBootstrapContextForRun } from "../bootstrap-files-C8WUuJVf.js";
import { r as buildAgentRuntimePlan } from "../build-BPMIpRAa.js";
import { a as formatErrorMessage } from "../errors-DZMrVkYL.js";
import { t as callGatewayTool } from "../gateway-VO6GibHc.js";
import {
  o as normalizeHeartbeatToolResponse,
  t as HEARTBEAT_RESPONSE_TOOL_NAME,
} from "../heartbeat-tool-response-Dx8N2J-j.js";
import {
  i as runAgentHarnessLlmOutputHook,
  n as runAgentHarnessBeforeAgentFinalizeHook,
  r as runAgentHarnessLlmInputHook,
  t as runAgentHarnessAgentEndHook,
} from "../lifecycle-hook-helpers-HMjMszrP.js";
import { t as log } from "../logger-Ce0PtXjG.js";
import { u as resolveModelAuthMode } from "../model-auth-Do8Bfz1M.js";
import {
  a as registerNativeHookRelay,
  c as runAgentHarnessBeforeMessageWriteHook,
  n as buildNativeHookRelayCommand,
  s as runAgentHarnessAfterToolCallHook,
  t as __testing,
} from "../native-hook-relay-AxDet15L.js";
import {
  a as selectDefaultNodeFromList,
  i as resolveNodeIdFromList,
  t as listNodes,
} from "../nodes-utils-B1_2Nbxw.js";
import { t as createOpenClawCodingTools } from "../pi-tools-Xm5nmxui.js";
import {
  l as wrapToolWithBeforeToolCallHook,
  s as isToolWrappedWithBeforeToolCallHook,
} from "../pi-tools.before-tool-call-KxT3QmrR.js";
import { g as resolveOpenClawAgentDir } from "../provider-auth-D0H8jtwm.js";
import { n as disposeRegisteredAgentHarnesses } from "../registry-D11nh-V3.js";
import { t as classifyEmbeddedPiRunResultForModelFallback } from "../result-fallback-classifier-Cnc2xj7H.js";
import {
  f as setActiveEmbeddedRun,
  l as queueEmbeddedPiMessage,
  n as abortEmbeddedPiRun,
  r as clearActiveEmbeddedRun,
} from "../runs-CztEUxOL.js";
import { n as resolveEmbeddedAgentRuntime } from "../runtime-Bw2flyqr.js";
import { o as resolveSandboxContext } from "../sandbox-Cz0C2Qt-.js";
import { a as isSubagentSessionKey } from "../session-key-utils-B3KPN8Ee.js";
import {
  c as resolveSessionWriteLockAcquireTimeoutMs,
  r as acquireSessionWriteLock,
} from "../session-write-lock-DjdS_616.js";
import { t as formatToolAggregate } from "../tool-meta-DI7YbTn_.js";
import {
  a as normalizeProviderToolSchemas,
  s as supportsModelTools,
  t as createAgentToolResultMiddlewareRunner,
} from "../tool-result-middleware-CJ4A8Wvz.js";
import { s as appendSessionTranscriptMessage } from "../transcript-B5N3gLUE.js";
import { t as emitSessionTranscriptUpdate } from "../transcript-events-BhgnycRg.js";
import { o as normalizeUsage } from "../usage-BOaLms3p.js";
import { p as resolveUserPath } from "../utils-BGRcpLKt.js";
import { n as VERSION } from "../version-BZr74W_5.js";
export {
  HEARTBEAT_RESPONSE_TOOL_NAME,
  VERSION as OPENCLAW_VERSION,
  TOOL_PROGRESS_OUTPUT_MAX_CHARS,
  abortEmbeddedPiRun as abortAgentHarnessRun,
  acquireSessionWriteLock,
  appendSessionTranscriptMessage,
  assembleHarnessContextEngine,
  bootstrapHarnessContextEngine,
  buildAgentRuntimePlan,
  buildEmbeddedAttemptToolRunContext,
  buildHarnessContextEngineRuntimeContext,
  buildHarnessContextEngineRuntimeContextFromUsage,
  buildNativeHookRelayCommand,
  callGatewayTool,
  classifyAgentHarnessTerminalOutcome,
  classifyEmbeddedPiRunResultForModelFallback,
  clearActiveEmbeddedRun,
  createAgentToolResultMiddlewareRunner,
  createCodexAppServerToolResultExtensionRunner,
  createOpenClawCodingTools,
  disposeRegisteredAgentHarnesses,
  log as embeddedAgentLog,
  emitAgentEvent,
  emitSessionTranscriptUpdate,
  extractToolResultMediaArtifact,
  filterToolResultMediaUrls,
  finalizeHarnessContextEngineTurn,
  formatApprovalDisplayPath,
  formatErrorMessage,
  formatToolAggregate,
  formatToolProgressOutput,
  inferToolMetaFromArgs,
  isActiveHarnessContextEngine,
  isMessagingTool,
  isMessagingToolSendAction,
  isSubagentSessionKey,
  isToolWrappedWithBeforeToolCallHook,
  listNodes,
  logAgentRuntimeToolDiagnostics,
  __testing as nativeHookRelayTesting,
  normalizeAgentRuntimeTools,
  normalizeHeartbeatToolResponse,
  normalizeProviderToolSchemas,
  normalizeUsage,
  onAgentEvent,
  queueEmbeddedPiMessage as queueAgentHarnessMessage,
  registerNativeHookRelay,
  resetAgentEventsForTest,
  resolveAgentDir,
  resolveAgentHarnessBeforePromptBuildResult,
  resolveAttemptSpawnWorkspaceDir,
  resolveBootstrapContextForRun,
  resolveDefaultAgentDir,
  resolveEmbeddedAgentRuntime,
  resolveModelAuthMode,
  resolveNodeIdFromList,
  resolveOpenClawAgentDir,
  resolveSandboxContext,
  resolveSessionAgentIds,
  resolveSessionWriteLockAcquireTimeoutMs,
  resolveUserPath,
  runAgentCleanupStep,
  runAgentHarnessAfterCompactionHook,
  runAgentHarnessAfterToolCallHook,
  runAgentHarnessAgentEndHook,
  runAgentHarnessBeforeAgentFinalizeHook,
  runAgentHarnessBeforeCompactionHook,
  runAgentHarnessBeforeMessageWriteHook,
  runAgentHarnessLlmInputHook,
  runAgentHarnessLlmOutputHook,
  runHarnessContextEngineMaintenance,
  selectDefaultNodeFromList,
  setActiveEmbeddedRun,
  supportsModelTools,
  wrapToolWithBeforeToolCallHook,
};
