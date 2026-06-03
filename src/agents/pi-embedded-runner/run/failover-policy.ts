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
  { action: "fallback_model" | "return_error_payload" }
>;

export type PromptFailoverDecision = Extract<
  RunFailoverDecision,
  { action: "rotate_profile" | "fallback_model" | "surface_error" }
>;

export type AssistantFailoverDecision = Extract<
  RunFailoverDecision,
  { action: "continue_normal" | "rotate_profile" | "fallback_model" | "surface_error" }
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
export function isRecoverableFailoverReason(reason: FailoverReason | null): boolean {
  if (reason === null) {
    // Unclassified network/stream-terminated failures land here; recover.
    return true;
  }
  switch (reason) {
    case "timeout":
    case "overloaded":
    case "rate_limit":
    case "empty_response":
    case "no_error_details":
    case "unclassified":
    case "unknown":
    case "auth":
      return true;
    case "auth_permanent":
    case "billing":
    case "model_not_found":
    case "format":
    case "session_expired":
      return false;
    default: {
      // Exhaustiveness guard: if the FailoverReason union grows, fail closed
      // (treat unmapped reasons as NON-recoverable) so a new reason cannot
      // silently start burning the fallback ladder without explicit review.
      const _exhaustive: never = reason;
      void _exhaustive;
      return false;
    }
  }
}

function shouldEscalateRetryLimit(reason: FailoverReason | null): boolean {
  return Boolean(
    reason &&
    reason !== "timeout" &&
    reason !== "model_not_found" &&
    reason !== "format" &&
    reason !== "session_expired",
  );
}

function shouldRotatePrompt(params: PromptDecisionParams): boolean {
  return params.failoverFailure && params.failoverReason !== "timeout";
}

function shouldRotateAssistant(params: AssistantDecisionParams): boolean {
  // Errored (non-timeout) assistant turn. Only RECOVERABLE failures walk the
  // fallback ladder; non-recoverable reasons (auth_permanent, billing,
  // model_not_found, format, session_expired) must NOT silently rotate to a
  // different model — they fall through to surface_error (which still throws a
  // FailoverError carrying the reason + suspend handling for billing).
  //
  // `failoverReason === null` is treated as recoverable (network/stream-
  // terminated/socket-reset that the classifier could not label), but we still
  // require an actual failure signal: either `failoverFailure` is set, or the
  // reason is non-null. A null reason with no failover failure is a clean turn
  // and must NOT trigger rotation.
  const erroredRotation =
    !params.aborted &&
    (params.failoverFailure || params.failoverReason !== null) &&
    isRecoverableFailoverReason(params.failoverReason);

  // Timeout-triggered rotation. A timeout is always a recoverable signal; the
  // only blocks are an in-flight side-effecting tool (don't re-run mutations on
  // a fresh model) and timeouts that fired during compaction. A read-only tool
  // timeout is explicitly allowed to fail over (degrade gracefully).
  const timeoutRotation =
    params.timedOut &&
    !params.timedOutDuringCompaction &&
    (!params.timedOutDuringToolExecution || params.timedOutDuringReadOnlyToolExecution);

  return erroredRotation || timeoutRotation;
}

export function mergeRetryFailoverReason(params: {
  previous: FailoverReason | null;
  failoverReason: FailoverReason | null;
  timedOut?: boolean;
}): FailoverReason | null {
  return params.failoverReason ?? (params.timedOut ? "timeout" : null) ?? params.previous;
}

export function resolveRunFailoverDecision(
  params: RetryLimitDecisionParams,
): RetryLimitFailoverDecision;
export function resolveRunFailoverDecision(params: PromptDecisionParams): PromptFailoverDecision;
export function resolveRunFailoverDecision(
  params: AssistantDecisionParams,
): AssistantFailoverDecision;
export function resolveRunFailoverDecision(params: RunFailoverDecisionParams): RunFailoverDecision {
  if (params.stage === "retry_limit") {
    if (params.fallbackConfigured && shouldEscalateRetryLimit(params.failoverReason)) {
      const fallbackReason = params.failoverReason ?? "unknown";
      return {
        action: "fallback_model",
        reason: fallbackReason,
      };
    }
    return {
      action: "return_error_payload",
    };
  }

  if (params.stage === "prompt") {
    if (params.externalAbort) {
      return {
        action: "surface_error",
        reason: params.failoverReason,
      };
    }
    if (!params.profileRotated && shouldRotatePrompt(params)) {
      return {
        action: "rotate_profile",
        reason: params.failoverReason,
      };
    }
    if (params.fallbackConfigured && params.failoverFailure) {
      return {
        action: "fallback_model",
        reason: params.failoverReason ?? "unknown",
      };
    }
    return {
      action: "surface_error",
      reason: params.failoverReason,
    };
  }

  if (params.externalAbort) {
    return {
      action: "surface_error",
      reason: params.failoverReason,
    };
  }
  const assistantShouldRotate = shouldRotateAssistant(params);
  if (!params.profileRotated && assistantShouldRotate) {
    return {
      action: "rotate_profile",
      reason: params.failoverReason,
    };
  }
  if (assistantShouldRotate && params.fallbackConfigured) {
    return {
      action: "fallback_model",
      reason: params.timedOut ? "timeout" : (params.failoverReason ?? "unknown"),
    };
  }
  if (!assistantShouldRotate) {
    // The turn did not qualify for rotation. Two sub-cases:
    //   1. A real failure occurred but it is NON-RECOVERABLE (auth_permanent,
    //      billing, model_not_found, format, session_expired). It must NOT
    //      silently rotate to a different model AND it must NOT be swallowed by
    //      continue_normal — surface it so the client renders the failure (and
    //      billing/auth carry their suspend handling on the throw path).
    //   2. A genuinely clean turn (no failover failure, no classified reason):
    //      continue normally.
    const hadErroredFailureSignal =
      !params.timedOut && (params.failoverFailure || params.failoverReason !== null);
    if (hadErroredFailureSignal && !isRecoverableFailoverReason(params.failoverReason)) {
      return {
        action: "surface_error",
        reason: params.failoverReason,
      };
    }
    return {
      action: "continue_normal",
    };
  }
  return {
    action: "surface_error",
    reason: params.failoverReason,
  };
}
