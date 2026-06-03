import { describe, expect, it } from "vitest";
import type { FailoverReason } from "../../pi-embedded-helpers.js";
import {
  isRecoverableFailoverReason,
  mergeRetryFailoverReason,
  resolveRunFailoverDecision,
} from "./failover-policy.js";

const RECOVERABLE_REASONS: Array<FailoverReason | null> = [
  null,
  "timeout",
  "overloaded",
  "rate_limit",
  "empty_response",
  "no_error_details",
  "unclassified",
  "unknown",
  "auth",
];

const NON_RECOVERABLE_REASONS: FailoverReason[] = [
  "auth_permanent",
  "billing",
  "model_not_found",
  "format",
  "session_expired",
];

describe("isRecoverableFailoverReason", () => {
  it.each(RECOVERABLE_REASONS)("treats %s as recoverable", (reason) => {
    expect(isRecoverableFailoverReason(reason)).toBe(true);
  });

  it.each(NON_RECOVERABLE_REASONS)("treats %s as non-recoverable", (reason) => {
    expect(isRecoverableFailoverReason(reason)).toBe(false);
  });
});

describe("resolveRunFailoverDecision", () => {
  it("escalates retry-limit exhaustion for replay-safe failover reasons", () => {
    expect(
      resolveRunFailoverDecision({
        stage: "retry_limit",
        fallbackConfigured: true,
        failoverReason: "rate_limit",
      }),
    ).toEqual({
      action: "fallback_model",
      reason: "rate_limit",
    });
  });

  it("keeps retry-limit as a local error for non-escalating reasons", () => {
    expect(
      resolveRunFailoverDecision({
        stage: "retry_limit",
        fallbackConfigured: true,
        failoverReason: "timeout",
      }),
    ).toEqual({
      action: "return_error_payload",
    });
  });

  it("prefers prompt-side profile rotation before fallback", () => {
    expect(
      resolveRunFailoverDecision({
        stage: "prompt",
        aborted: false,
        externalAbort: false,
        fallbackConfigured: true,
        failoverFailure: true,
        failoverReason: "rate_limit",
        profileRotated: false,
      }),
    ).toEqual({
      action: "rotate_profile",
      reason: "rate_limit",
    });
  });

  it("falls back after prompt rotation is exhausted", () => {
    expect(
      resolveRunFailoverDecision({
        stage: "prompt",
        aborted: false,
        externalAbort: false,
        fallbackConfigured: true,
        failoverFailure: true,
        failoverReason: "rate_limit",
        profileRotated: true,
      }),
    ).toEqual({
      action: "fallback_model",
      reason: "rate_limit",
    });
  });

  it("treats classified assistant-side 429s as rotation candidates even without error stopReason", () => {
    expect(
      resolveRunFailoverDecision({
        stage: "assistant",
        aborted: false,
        externalAbort: false,
        fallbackConfigured: true,
        failoverFailure: false,
        failoverReason: "rate_limit",
        timedOut: false,
        timedOutDuringCompaction: false,
        timedOutDuringToolExecution: false,
        timedOutDuringReadOnlyToolExecution: false,
        profileRotated: false,
      }),
    ).toEqual({
      action: "rotate_profile",
      reason: "rate_limit",
    });
  });

  it("falls back after assistant rotation is exhausted", () => {
    expect(
      resolveRunFailoverDecision({
        stage: "assistant",
        aborted: false,
        externalAbort: false,
        fallbackConfigured: true,
        failoverFailure: false,
        failoverReason: "rate_limit",
        timedOut: false,
        timedOutDuringCompaction: false,
        timedOutDuringToolExecution: false,
        timedOutDuringReadOnlyToolExecution: false,
        profileRotated: true,
      }),
    ).toEqual({
      action: "fallback_model",
      reason: "rate_limit",
    });
  });

  it("does nothing for assistant turns without failover signals", () => {
    expect(
      resolveRunFailoverDecision({
        stage: "assistant",
        aborted: false,
        externalAbort: false,
        fallbackConfigured: true,
        failoverFailure: false,
        failoverReason: null,
        timedOut: false,
        timedOutDuringCompaction: false,
        timedOutDuringToolExecution: false,
        timedOutDuringReadOnlyToolExecution: false,
        profileRotated: false,
      }),
    ).toEqual({
      action: "continue_normal",
    });
  });

  it("does not model-fallback prompt failures after an external abort", () => {
    expect(
      resolveRunFailoverDecision({
        stage: "prompt",
        aborted: true,
        externalAbort: true,
        fallbackConfigured: true,
        failoverFailure: true,
        failoverReason: "timeout",
        profileRotated: false,
      }),
    ).toEqual({
      action: "surface_error",
      reason: "timeout",
    });
  });

  it("does not rotate or fallback assistant timeouts that fired during side-effecting tool execution (#52147)", () => {
    expect(
      resolveRunFailoverDecision({
        stage: "assistant",
        aborted: true,
        externalAbort: false,
        fallbackConfigured: true,
        failoverFailure: false,
        failoverReason: null,
        timedOut: true,
        timedOutDuringCompaction: false,
        timedOutDuringToolExecution: true,
        timedOutDuringReadOnlyToolExecution: false,
        profileRotated: false,
      }),
    ).toEqual({
      action: "continue_normal",
    });
  });

  it("does not fallback assistant side-effecting tool-execution timeouts even after profile rotation exhausted (#52147)", () => {
    expect(
      resolveRunFailoverDecision({
        stage: "assistant",
        aborted: true,
        externalAbort: false,
        fallbackConfigured: true,
        failoverFailure: false,
        failoverReason: null,
        timedOut: true,
        timedOutDuringCompaction: false,
        timedOutDuringToolExecution: true,
        timedOutDuringReadOnlyToolExecution: false,
        profileRotated: true,
      }),
    ).toEqual({
      action: "continue_normal",
    });
  });

  it("rotates assistant timeouts that fired entirely during read-only tool execution (degrade gracefully)", () => {
    expect(
      resolveRunFailoverDecision({
        stage: "assistant",
        aborted: true,
        externalAbort: false,
        fallbackConfigured: true,
        failoverFailure: false,
        failoverReason: null,
        timedOut: true,
        timedOutDuringCompaction: false,
        timedOutDuringToolExecution: true,
        timedOutDuringReadOnlyToolExecution: true,
        profileRotated: false,
      }),
    ).toEqual({
      action: "rotate_profile",
      reason: null,
    });
  });

  it("falls back to a fallback model on a read-only tool timeout after profile rotation is exhausted", () => {
    expect(
      resolveRunFailoverDecision({
        stage: "assistant",
        aborted: true,
        externalAbort: false,
        fallbackConfigured: true,
        failoverFailure: false,
        failoverReason: null,
        timedOut: true,
        timedOutDuringCompaction: false,
        timedOutDuringToolExecution: true,
        timedOutDuringReadOnlyToolExecution: true,
        profileRotated: true,
      }),
    ).toEqual({
      action: "fallback_model",
      reason: "timeout",
    });
  });

  it("does not fail over a read-only tool timeout that also occurred during compaction", () => {
    expect(
      resolveRunFailoverDecision({
        stage: "assistant",
        aborted: true,
        externalAbort: false,
        fallbackConfigured: true,
        failoverFailure: false,
        failoverReason: null,
        timedOut: true,
        timedOutDuringCompaction: true,
        timedOutDuringToolExecution: true,
        timedOutDuringReadOnlyToolExecution: true,
        profileRotated: false,
      }),
    ).toEqual({
      action: "continue_normal",
    });
  });

  it("still rotates assistant timeouts that fired during LLM phase (no active tool execution)", () => {
    expect(
      resolveRunFailoverDecision({
        stage: "assistant",
        aborted: true,
        externalAbort: false,
        fallbackConfigured: true,
        failoverFailure: false,
        failoverReason: null,
        timedOut: true,
        timedOutDuringCompaction: false,
        timedOutDuringToolExecution: false,
        timedOutDuringReadOnlyToolExecution: false,
        profileRotated: false,
      }),
    ).toEqual({
      action: "rotate_profile",
      reason: null,
    });
  });

  it("does not rotate or fallback assistant timeouts after an external abort", () => {
    expect(
      resolveRunFailoverDecision({
        stage: "assistant",
        aborted: true,
        externalAbort: true,
        fallbackConfigured: true,
        failoverFailure: false,
        failoverReason: null,
        timedOut: true,
        timedOutDuringCompaction: false,
        timedOutDuringToolExecution: false,
        timedOutDuringReadOnlyToolExecution: false,
        profileRotated: false,
      }),
    ).toEqual({
      action: "surface_error",
      reason: null,
    });
  });

  // --- GAP #1: every RECOVERABLE assistant failure walks the fallback ladder ---
  // A recoverable, non-aborted assistant failure with a configured fallback
  // must rotate (profile first, then fallback_model) and NEVER dead-end in
  // surface_error / continue_normal.
  const recoverableErroredReasons: FailoverReason[] = [
    "timeout",
    "overloaded",
    "rate_limit",
    "empty_response",
    "no_error_details",
    "unclassified",
    "unknown",
  ];

  it.each(recoverableErroredReasons)(
    "rotates to a profile for recoverable errored reason %s (fallback configured, not aborted)",
    (reason) => {
      const decision = resolveRunFailoverDecision({
        stage: "assistant",
        aborted: false,
        externalAbort: false,
        fallbackConfigured: true,
        failoverFailure: true,
        failoverReason: reason,
        timedOut: false,
        timedOutDuringCompaction: false,
        timedOutDuringToolExecution: false,
        timedOutDuringReadOnlyToolExecution: false,
        profileRotated: false,
      });
      expect(decision.action).toBe("rotate_profile");
      expect(decision.action).not.toBe("surface_error");
      expect(decision.action).not.toBe("continue_normal");
    },
  );

  it.each(recoverableErroredReasons)(
    "falls back to a model for recoverable errored reason %s once profile rotation is exhausted",
    (reason) => {
      const decision = resolveRunFailoverDecision({
        stage: "assistant",
        aborted: false,
        externalAbort: false,
        fallbackConfigured: true,
        failoverFailure: true,
        failoverReason: reason,
        timedOut: false,
        timedOutDuringCompaction: false,
        timedOutDuringToolExecution: false,
        timedOutDuringReadOnlyToolExecution: false,
        profileRotated: true,
      });
      expect(decision.action).toBe("fallback_model");
      expect(decision.action).not.toBe("surface_error");
      expect(decision.action).not.toBe("continue_normal");
    },
  );

  it("walks the ladder for an unclassified (null reason) connection-drop failure with a failover signal", () => {
    // Network drop / stream terminated that the classifier could not label
    // arrives as failoverReason=null but failoverFailure=true. It must still
    // rotate rather than silently continue_normal.
    expect(
      resolveRunFailoverDecision({
        stage: "assistant",
        aborted: false,
        externalAbort: false,
        fallbackConfigured: true,
        failoverFailure: true,
        failoverReason: null,
        timedOut: false,
        timedOutDuringCompaction: false,
        timedOutDuringToolExecution: false,
        timedOutDuringReadOnlyToolExecution: false,
        profileRotated: false,
      }),
    ).toEqual({
      action: "rotate_profile",
      reason: null,
    });
  });

  // --- GAP #1: NON-RECOVERABLE failures must NOT silently rotate to a model ---
  const nonRecoverableReasons: FailoverReason[] = [
    "auth_permanent",
    "billing",
    "model_not_found",
    "session_expired",
  ];

  it.each(nonRecoverableReasons)(
    "does not rotate or model-fallback non-recoverable reason %s; surfaces the error instead",
    (reason) => {
      const beforeRotation = resolveRunFailoverDecision({
        stage: "assistant",
        aborted: false,
        externalAbort: false,
        fallbackConfigured: true,
        failoverFailure: true,
        failoverReason: reason,
        timedOut: false,
        timedOutDuringCompaction: false,
        timedOutDuringToolExecution: false,
        timedOutDuringReadOnlyToolExecution: false,
        profileRotated: false,
      });
      expect(beforeRotation).toEqual({ action: "surface_error", reason });
      expect(beforeRotation.action).not.toBe("rotate_profile");
      expect(beforeRotation.action).not.toBe("fallback_model");

      // Even after a profile rotation has been attempted, a non-recoverable
      // reason must not be escalated to a different MODEL.
      const afterRotation = resolveRunFailoverDecision({
        stage: "assistant",
        aborted: false,
        externalAbort: false,
        fallbackConfigured: true,
        failoverFailure: true,
        failoverReason: reason,
        timedOut: false,
        timedOutDuringCompaction: false,
        timedOutDuringToolExecution: false,
        timedOutDuringReadOnlyToolExecution: false,
        profileRotated: true,
      });
      expect(afterRotation).toEqual({ action: "surface_error", reason });
      expect(afterRotation.action).not.toBe("fallback_model");
    },
  );

  it("surfaces a format error rather than rotating to a peer model", () => {
    expect(
      resolveRunFailoverDecision({
        stage: "assistant",
        aborted: false,
        externalAbort: false,
        fallbackConfigured: true,
        failoverFailure: true,
        failoverReason: "format",
        timedOut: false,
        timedOutDuringCompaction: false,
        timedOutDuringToolExecution: false,
        timedOutDuringReadOnlyToolExecution: false,
        profileRotated: false,
      }),
    ).toEqual({
      action: "surface_error",
      reason: "format",
    });
  });

  it("still continues normally for a clean assistant turn (no failure signal, null reason)", () => {
    expect(
      resolveRunFailoverDecision({
        stage: "assistant",
        aborted: false,
        externalAbort: false,
        fallbackConfigured: true,
        failoverFailure: false,
        failoverReason: null,
        timedOut: false,
        timedOutDuringCompaction: false,
        timedOutDuringToolExecution: false,
        timedOutDuringReadOnlyToolExecution: false,
        profileRotated: false,
      }),
    ).toEqual({
      action: "continue_normal",
    });
  });

  // --- externalAbort always surfaces, regardless of reason ---
  it.each<FailoverReason | null>([
    null,
    "timeout",
    "overloaded",
    "rate_limit",
    "billing",
    "auth_permanent",
  ])("surfaces an external abort regardless of reason %s", (reason) => {
    expect(
      resolveRunFailoverDecision({
        stage: "assistant",
        aborted: true,
        externalAbort: true,
        fallbackConfigured: true,
        failoverFailure: true,
        failoverReason: reason,
        timedOut: false,
        timedOutDuringCompaction: false,
        timedOutDuringToolExecution: false,
        timedOutDuringReadOnlyToolExecution: false,
        profileRotated: false,
      }),
    ).toEqual({
      action: "surface_error",
      reason,
    });
  });

  // --- Side-effecting vs read-only tool-timeout (gap #1 boundary, documented) ---
  it("keeps a side-effecting tool-execution timeout blocked from same-turn rotation", () => {
    expect(
      resolveRunFailoverDecision({
        stage: "assistant",
        aborted: true,
        externalAbort: false,
        fallbackConfigured: true,
        failoverFailure: false,
        failoverReason: null,
        timedOut: true,
        timedOutDuringCompaction: false,
        timedOutDuringToolExecution: true,
        timedOutDuringReadOnlyToolExecution: false,
        profileRotated: false,
      }),
    ).toEqual({
      action: "continue_normal",
    });
  });

  it("allows a read-only tool-execution timeout to fall over to a different model", () => {
    expect(
      resolveRunFailoverDecision({
        stage: "assistant",
        aborted: true,
        externalAbort: false,
        fallbackConfigured: true,
        failoverFailure: false,
        failoverReason: null,
        timedOut: true,
        timedOutDuringCompaction: false,
        timedOutDuringToolExecution: true,
        timedOutDuringReadOnlyToolExecution: true,
        profileRotated: true,
      }),
    ).toEqual({
      action: "fallback_model",
      reason: "timeout",
    });
  });
});

describe("mergeRetryFailoverReason", () => {
  it("preserves the previous classified reason when the current one is null", () => {
    expect(
      mergeRetryFailoverReason({
        previous: "rate_limit",
        failoverReason: null,
      }),
    ).toBe("rate_limit");
  });

  it("records timeout when no classified reason is present", () => {
    expect(
      mergeRetryFailoverReason({
        previous: null,
        failoverReason: null,
        timedOut: true,
      }),
    ).toBe("timeout");
  });
});
