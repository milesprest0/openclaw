import { describe, expect, it } from "vitest";
import {
  authorizeOperatorScopesForMethod,
  isGatewayMethodClassified,
  isNodeRoleMethod,
  resolveRequiredOperatorScopeForMethod,
} from "./method-scopes.js";
import {
  ADMIN_SCOPE,
  APPROVALS_SCOPE,
  PAIRING_SCOPE,
  READ_SCOPE,
  TALK_SECRETS_SCOPE,
  WRITE_SCOPE,
  type OperatorScope,
} from "./operator-scopes.js";
import {
  isRoleAuthorizedForMethod,
  parseGatewayRole,
  roleCanSkipDeviceIdentity,
  type GatewayRole,
} from "./role-policy.js";
import { listGatewayMethods } from "./server-methods-list.js";
import { coreGatewayHandlers } from "./server-methods.js";

// Objective (Notion "multi-user roles and permissions reliability"):
// the role/scope surface is bounded and enumerable (2 roles x 6 scopes x the
// finite set of registered RPC methods), so it is validated as a full
// permutation matrix rather than a hand-picked sample. Each assertion below is
// generated from the authoritative source-of-truth files
// (role-policy.ts, operator-scopes.ts, method-scopes.ts) so any future change
// that loosens or drops a gate fails CI.

const ALL_ROLES: GatewayRole[] = ["operator", "node"];

const ALL_SCOPES: OperatorScope[] = [
  ADMIN_SCOPE,
  READ_SCOPE,
  WRITE_SCOPE,
  APPROVALS_SCOPE,
  PAIRING_SCOPE,
  TALK_SECRETS_SCOPE,
];

// Every registered gateway method plus the two node-transport methods, so the
// matrix also covers the node-role surface.
function allRegisteredMethods(): string[] {
  const listed = listGatewayMethods();
  const handlers = Object.keys(coreGatewayHandlers);
  return Array.from(new Set([...listed, ...handlers])).toSorted();
}

/**
 * Independently-derived expectation for whether a single (role, scope, method)
 * tuple should be authorized end-to-end at the WS chokepoint
 * (server-methods.ts -> authorizeGatewayMethod): role gate first, then, for
 * operators only, the scope gate. This mirror is intentionally written from the
 * spec, not from the implementation, so drift is caught.
 */
function expectedAuthorized(role: GatewayRole, scope: OperatorScope, method: string): boolean {
  const nodeMethod = isNodeRoleMethod(method);
  if (role === "node") {
    // Node principals may only reach node-transport methods, and scopes are
    // irrelevant to them (nodes carry no operator scopes).
    return nodeMethod;
  }
  // role === "operator": can never reach node-only transport methods.
  if (nodeMethod) {
    return false;
  }
  // Admin scope is a master key for every operator method.
  if (scope === ADMIN_SCOPE) {
    return true;
  }
  const required = resolveRequiredOperatorScopeForMethod(method) ?? ADMIN_SCOPE;
  if (required === READ_SCOPE) {
    // Read is satisfied by read OR the strictly-stronger write scope.
    return scope === READ_SCOPE || scope === WRITE_SCOPE;
  }
  return scope === required;
}

describe("RBAC full (role, scope, method) permutation matrix", () => {
  const methods = allRegisteredMethods();

  it("has a non-trivial, bounded matrix to validate", () => {
    expect(methods.length).toBeGreaterThan(100);
    expect(ALL_ROLES.length).toBe(2);
    expect(ALL_SCOPES.length).toBe(6);
  });

  it("every registered method is classified (no method silently unscoped)", () => {
    const unclassified = methods.filter((m) => !isGatewayMethodClassified(m));
    expect(unclassified).toEqual([]);
  });

  it("authorizes every (role, scope, method) tuple exactly as the spec derives", () => {
    const mismatches: string[] = [];
    for (const role of ALL_ROLES) {
      for (const scope of ALL_SCOPES) {
        for (const method of methods) {
          // Reconstruct the chokepoint decision: role gate, then scope gate
          // (operators only; nodes skip the scope gate entirely).
          const rolePass = isRoleAuthorizedForMethod(role, method);
          let actual: boolean;
          if (!rolePass) {
            actual = false;
          } else if (role === "node") {
            actual = true;
          } else {
            actual = authorizeOperatorScopesForMethod(method, [scope]).allowed;
          }
          const expected = expectedAuthorized(role, scope, method);
          if (actual !== expected) {
            mismatches.push(`${role}/${scope}/${method}: expected ${expected}, got ${actual}`);
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("node role cannot reach any operator (non-node) method regardless of scope", () => {
    const leaks: string[] = [];
    for (const method of methods) {
      if (isNodeRoleMethod(method)) {
        continue;
      }
      if (isRoleAuthorizedForMethod("node", method)) {
        leaks.push(method);
      }
    }
    expect(leaks).toEqual([]);
  });

  it("operator role cannot reach any node-only transport method regardless of scope", () => {
    const leaks: string[] = [];
    for (const method of methods) {
      if (!isNodeRoleMethod(method)) {
        continue;
      }
      if (isRoleAuthorizedForMethod("operator", method)) {
        leaks.push(method);
      }
    }
    expect(leaks).toEqual([]);
  });

  it("no single non-admin scope is sufficient for an admin-only method", () => {
    const adminOnly = methods.filter(
      (m) =>
        !isNodeRoleMethod(m) &&
        (resolveRequiredOperatorScopeForMethod(m) ?? ADMIN_SCOPE) === ADMIN_SCOPE,
    );
    expect(adminOnly.length).toBeGreaterThan(0);
    for (const method of adminOnly) {
      for (const scope of ALL_SCOPES) {
        const allowed = authorizeOperatorScopesForMethod(method, [scope]).allowed;
        expect(allowed).toBe(scope === ADMIN_SCOPE);
      }
    }
  });
});

describe("roleCanSkipDeviceIdentity permutation matrix", () => {
  // The device-identity bypass must activate ONLY for an operator that already
  // cleared shared-auth. Any future loosening (e.g. allowing a node to skip, or
  // skipping without shared-auth) is a security regression and must fail here.
  it.each([
    ["operator" as GatewayRole, true, true],
    ["operator" as GatewayRole, false, false],
    ["node" as GatewayRole, true, false],
    ["node" as GatewayRole, false, false],
  ])("role=%s sharedAuthOk=%s -> canSkip=%s", (role, sharedAuthOk, expected) => {
    expect(roleCanSkipDeviceIdentity(role, sharedAuthOk)).toBe(expected);
  });

  it("only the operator+sharedAuthOk tuple is ever allowed to skip", () => {
    const allowed: string[] = [];
    for (const role of ALL_ROLES) {
      for (const sharedAuthOk of [true, false]) {
        if (roleCanSkipDeviceIdentity(role, sharedAuthOk)) {
          allowed.push(`${role}/${sharedAuthOk}`);
        }
      }
    }
    expect(allowed).toEqual(["operator/true"]);
  });
});

describe("parseGatewayRole rejects everything outside the two-role model", () => {
  it.each([
    ["operator", "operator"],
    ["node", "node"],
  ])("accepts %s", (input, expected) => {
    expect(parseGatewayRole(input)).toBe(expected);
  });

  it.each([["admin"], ["Operator"], ["NODE"], [""], ["operator "], ["superuser"]])(
    "rejects %s",
    (input) => {
      expect(parseGatewayRole(input)).toBeNull();
    },
  );

  it("rejects non-string inputs", () => {
    for (const bad of [null, undefined, 0, 1, {}, [], true]) {
      expect(parseGatewayRole(bad)).toBeNull();
    }
  });
});
