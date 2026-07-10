import type { FailoverReason } from "../../pi-embedded-helpers.js";
export type RunFailoverDecision =
  | {
      action: "continue_normal";
    }
  | {
      action: "rotate_profile" | "surface_error";
      reason: FailoverReason | null;
    }
  | {
      action: "fallback_model";
      reason: FailoverReason;
    }
  | {
      action: "return_error_payload";
    };
export type RetryLimitFailoverDecision = Extract<
  RunFailoverDecision,
  {
    action: "fallback_model" | "return_error_payload";
  }
>;
export type PromptFailoverDecision = Extract<
  RunFailoverDecision,
  {
    action: "rotate_profile" | "fallback_model" | "surface_error";
  }
>;
export type AssistantFailoverDecision = Extract<
  RunFailoverDecision,
  {
    action: "continue_normal" | "rotate_profile" | "fallback_model" | "surface_error";
  }
>;
type RetryLimitDecisionParams = {
  stage: "retry_limit";
  fallbackConfigured: boolean;
  failoverReason: FailoverReason | null;
};
type PromptDecisionParams = {
  stage: "prompt";
  aborted: boolean;
  externalAbort: boolean;
  fallbackConfigured: boolean;
  failoverFailure: boolean;
  failoverReason: FailoverReason | null;
  profileRotated: boolean;
};
type AssistantDecisionParams = {
  stage: "assistant";
  aborted: boolean;
  externalAbort: boolean;
  fallbackConfigured: boolean;
  failoverFailure: boolean;
  failoverReason: FailoverReason | null;
  timedOut: boolean;
  timedOutDuringCompaction: boolean;
  timedOutDuringToolExecution: boolean;
  /**
   * True only when the tool-execution timeout was entirely read-only/idempotent.
   * When true, failover (rotate/fallback) is allowed despite a tool being in
   * flight; side-effecting tool timeouts (false) remain blocked.
   */
  timedOutDuringReadOnlyToolExecution: boolean;
  profileRotated: boolean;
};
export type RunFailoverDecisionParams =
  | RetryLimitDecisionParams
  | PromptDecisionParams
  | AssistantDecisionParams;
/**
 * Single source of truth for whether a classified failover reason represents a
 * RECOVERABLE failure that should walk the configured fallback ladder (rotate
 * profile / fall over to the next model) rather than dead-ending in a
 * user-facing error.
 *
 * RECOVERABLE (rotate down the ladder when a fallback is configured):
 *   - `timeout`            — slow/hung provider; a different model may answer.
 *   - `overloaded`         — provider 5xx/529 capacity pressure.
 *   - `rate_limit`         — 429; profile rotation + ladder both apply.
 *   - `empty_response`     — provider returned no content; retry on a peer.
 *   - `no_error_details`   — stream ended with stopReason error/aborted and no
 *                            actionable signal (network drop, socket reset).
 *   - `unclassified`       — a failure we recognized as transient but could not
 *                            pin to a specific bucket.
 *   - `unknown`            — generic failover failure with no classifier hit.
 *   - `auth`               — recoverable via profile rotation (a different
 *                            account/key may succeed); ladder applies after
 *                            rotation is exhausted.
 *   - `null`               — no classified reason. This is the bucket that
 *                            network/stream-terminated/ECONNRESET/socket-reset
 *                            failures fall into when the classifier cannot
 *                            attach a label; treat as recoverable so a clean
 *                            connection error still degrades down the ladder.
 *
 * NON-RECOVERABLE (must NOT silently rotate to a different model — surface the
 * error or let dedicated handling deal with it):
 *   - `auth_permanent`     — credentials are structurally invalid; another
 *                            model behind the same broken auth won't help.
 *   - `billing`            — hard quota/payment exhausted; rotating models burns
 *                            the ladder against the same dead account. (Billing
 *                            still carries suspend handling downstream so the
 *                            surface_error path renders a proper FailoverError.)
 *   - `model_not_found`    — handled specially by the model-fallback layer,
 *                            which substitutes the next configured model
 *                            directly; it must not be treated as a generic
 *                            recoverable rotation at the assistant stage.
 *   - `format`             — the request schema was rejected; replaying the same
 *                            transcript on a peer reproduces the rejection.
 *   - `session_expired`    — the provider session is gone; a fresh model on the
 *                            same expired session repeats the failure.
 *
 * Note on `externalAbort`: an external abort (user pressed stop) is NOT a
 * failover reason and is handled before this classifier ever runs; callers must
 * still gate on `externalAbort` separately (the assistant decision does).
 */
export declare function isRecoverableFailoverReason(reason: FailoverReason | null): boolean;
export declare function mergeRetryFailoverReason(params: {
  previous: FailoverReason | null;
  failoverReason: FailoverReason | null;
  timedOut?: boolean;
}): FailoverReason | null;
export declare function resolveRunFailoverDecision(
  params: RetryLimitDecisionParams,
): RetryLimitFailoverDecision;
export declare function resolveRunFailoverDecision(
  params: PromptDecisionParams,
): PromptFailoverDecision;
export declare function resolveRunFailoverDecision(
  params: AssistantDecisionParams,
): AssistantFailoverDecision;
export {};
