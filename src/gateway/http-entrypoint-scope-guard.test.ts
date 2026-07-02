import { describe, expect, it } from "vitest";
import {
  authorizeOperatorScopesForMethod,
  isGatewayMethodClassified,
  isNodeRoleMethod,
  resolveRequiredOperatorScopeForMethod,
} from "./method-scopes.js";
import { ADMIN_SCOPE } from "./operator-scopes.js";

// Item #1 from the Notion "multi-user roles and permissions reliability" Risk
// section: "test every gateway entrypoint that dispatches RPC calls, not just
// the primary handler." Several HTTP entrypoints run the operator SCOPE gate
// directly (authorizeOperatorScopesForMethod / operatorMethod) rather than
// flowing through the WS chokepoint in server-methods.ts. Each of those passes
// a hard-coded method string. If any of those strings is a typo or names an
// unclassified method, the scope resolver silently defaults to admin-only
// (default-deny) -- a silent behavior change no other test would catch.
//
// This guard pins every such literal to a real, classified, operator-reachable
// method. It intentionally asserts CURRENT behavior only (no auth-code change);
// tightening these entrypoints to also call isRoleAuthorizedForMethod is an
// auth-layer decision reserved for Miles/Justin per the page.

// Source-of-truth: the exact operatorMethod / authorizeOperatorScopesForMethod
// literals used across the HTTP entrypoints, with the file each lives in.
const HTTP_ENTRYPOINT_METHODS: Array<{ method: string; entrypoint: string }> = [
  { method: "chat.history", entrypoint: "sessions-history-http.ts" },
  { method: "chat.history", entrypoint: "managed-image-attachments.ts" },
  { method: "models.list", entrypoint: "models-http.ts" },
  { method: "agent", entrypoint: "tools-invoke-http.ts" },
  { method: "assistant.media.get", entrypoint: "control-ui.ts" },
  { method: "sessions.abort", entrypoint: "session-kill-http.ts" },
  { method: "sessions.delete", entrypoint: "session-kill-http.ts" },
  { method: "chat.send", entrypoint: "embeddings-http.ts" },
  { method: "chat.send", entrypoint: "openai-http.ts" },
  { method: "chat.send", entrypoint: "openresponses-http.ts" },
];

describe("HTTP entrypoint scope-gate method literals", () => {
  it.each(HTTP_ENTRYPOINT_METHODS)(
    "$entrypoint gates on a classified method: $method",
    ({ method }) => {
      // Must be a real classified method, not a typo that silently default-denies.
      expect(isGatewayMethodClassified(method)).toBe(true);
      // HTTP entrypoints are operator-scope-authenticated; they must not be
      // gating on a node-only transport method.
      expect(isNodeRoleMethod(method)).toBe(false);
      // A concrete operator scope must resolve (never the implicit admin-only
      // fallback, which would silently over-restrict the endpoint).
      expect(resolveRequiredOperatorScopeForMethod(method)).toBeDefined();
    },
  );

  it("each HTTP entrypoint method is reachable by an operator holding admin scope", () => {
    for (const { method } of HTTP_ENTRYPOINT_METHODS) {
      expect(authorizeOperatorScopesForMethod(method, [ADMIN_SCOPE]).allowed).toBe(true);
    }
  });

  it("each HTTP entrypoint method rejects an empty scope set (no accidental public access)", () => {
    for (const { method } of HTTP_ENTRYPOINT_METHODS) {
      expect(authorizeOperatorScopesForMethod(method, []).allowed).toBe(false);
    }
  });
});
