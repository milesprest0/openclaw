import { n as getDiagnosticSessionState } from "./diagnostic-session-state-BAjgBZHS.js";
import { c as logToolLoopAction } from "./diagnostic-TRyCbvnu.js";
import {
  n as recordToolCall,
  r as recordToolCallOutcome,
  t as detectToolCallLoop,
} from "./tool-loop-detection-Drrg3FJa.js";
//#region src/agents/pi-tools.before-tool-call.runtime.ts
const beforeToolCallRuntime = {
  getDiagnosticSessionState,
  logToolLoopAction,
  detectToolCallLoop,
  recordToolCall,
  recordToolCallOutcome,
};
//#endregion
export { beforeToolCallRuntime };
