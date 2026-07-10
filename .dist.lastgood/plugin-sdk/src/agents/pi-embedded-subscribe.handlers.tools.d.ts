import type { AgentEvent } from "@mariozechner/pi-agent-core";
import type { ToolHandlerContext } from "./pi-embedded-subscribe.handlers.types.js";
/**
 * Whether a (normalized) tool name is read-only / idempotent for the purpose of
 * timeout-failover safety. Side-effecting tools (exec, edit, write, message,
 * sessions_send, sessions_spawn, process, gateway, cron, canvas, nodes, …) are
 * NOT read-only and must keep blocking failover so mutations are never replayed
 * on a fallback model.
 */
export declare function isReadOnlyToolName(toolName: string): boolean;
export declare function countActiveToolExecutions(runId: string): number;
/**
 * True only when there is at least one active tool execution for this run AND
 * every active execution is read-only/idempotent. Returns false when there are
 * no active executions (the caller should rely on `countActiveToolExecutions`
 * to detect the "no tool in flight" case) and false the moment any active tool
 * is side-effecting.
 */
export declare function allActiveToolExecutionsReadOnly(runId: string): boolean;
export declare function handleToolExecutionStart(
  ctx: ToolHandlerContext,
  evt: AgentEvent & {
    toolName: string;
    toolCallId: string;
    args: unknown;
  },
): void | Promise<void>;
export declare function handleToolExecutionUpdate(
  ctx: ToolHandlerContext,
  evt: AgentEvent & {
    toolName: string;
    toolCallId: string;
    partialResult?: unknown;
  },
): void;
export declare function handleToolExecutionEnd(
  ctx: ToolHandlerContext,
  evt: AgentEvent & {
    toolName: string;
    toolCallId: string;
    isError: boolean;
    result?: unknown;
  },
): Promise<void>;
