/**
 * prest0n-egress-attribution.ts — per-request LLM egress attribution (native port of the
 * fork patch 024 helper, 2026-07-21).
 *
 * History: 024 began as a dist-anchor patch (prest0n/patches in milesprest0/project) that
 * injected header spreads (Point A), session noting (Point B), and body stamps (Points C/D)
 * into the built dist on the internal VM. This module is the NATIVE source port so account
 * VMs — which install the canonical @prest0n/openclaw package and never see dist patches —
 * carry the same attribution. The transports import { stampBody, headersFor,
 * noteCurrentSession } directly; the dist-patch era's global-symbol slot is still installed
 * (idempotently) so patch-019 spawn-label registrations and any systemd preload keep
 * sharing ONE registry with this module, and a dist re-patch on top of a native build
 * stays a harmless no-op.
 *
 * Receiver contract (extractAndStripBodyAttribution / extractAttributionFields in
 * functions/src/prest0nVm/fleetModelProxy.ts of milesprest0/project):
 *   X-Prest0n-Task-Label / prest0n_task_label      max 48  ^[\w.:\/-]+$
 *   X-Prest0n-Session-Kind / prest0n_session_kind  max 24  (orchestrator|subagent|cron|heartbeat)
 *   X-Prest0n-Session-Id / prest0n_session_id      max 64
 *   X-Prest0n-Turn-Class / prest0n_turn_class      max 24  (cron|heartbeat|interactive)
 * Non-conforming values are OMITTED fork-side (never sanitized into a lie); the proxy
 * reads AND STRIPS body metadata fields before egress, so upstream providers never see
 * them. OpenAI-compatibility: at most 4 string-valued metadata keys (within the
 * string→string ≤16-key cap of chat-completions `metadata`).
 *
 * Fail-open contract: nothing here may ever throw into the request path, block it, or
 * delay it. Derivation errors degrade to omission; stampBody returns its input untouched
 * on any doubt. Zero routing coupling.
 */

const SYMBOL = Symbol.for("prest0n.egressAttribution");
export const PREST0N_ATTRIBUTION_MARKER = "PREST0N_EGRESS_ATTR_FORK_PATCH_024";
const TOKEN_RE = /^[\w.:/-]+$/;
const MAX_LEN = { label: 48, kind: 24, sessionId: 64, turnClass: 24 } as const;

export type SessionKind = "orchestrator" | "subagent" | "cron" | "heartbeat";
const KINDS = new Set<SessionKind>(["orchestrator", "subagent", "cron", "heartbeat"]);
const DEFAULT_LABEL_BY_KIND: Record<SessionKind, string> = {
  orchestrator: "vm-orchestrator",
  subagent: "subagent-default",
  cron: "cron",
  heartbeat: "vm-heartbeat",
};
const REGISTRY_CAP = 1024;

// Kind derivation patterns, checked in order (subagent/cron/heartbeat BEFORE main —
// `agent:main:subagent:<id>` must classify as subagent). Extensible without a code change
// via PREST0N_ATTR_KIND_PATTERNS='[{"pattern":"...","kind":"cron"}, ...]' (prepended,
// validated, bad JSON ignored).
const KIND_PATTERNS: ReadonlyArray<{ re: RegExp; kind: SessionKind }> = [
  { re: /(^|[:_.-])subagent([:_.-]|$)/i, kind: "subagent" },
  { re: /(^|[:_.-])(cron|isolated)([:_.-]|$)/i, kind: "cron" },
  { re: /heartbeat/i, kind: "heartbeat" },
  { re: /(^|[:_.-])main$/i, kind: "orchestrator" },
];

export type SessionMeta = {
  sessionId: string;
  taskLabel?: string;
  kind?: SessionKind;
  turnClass?: string;
};

export type AttributionContext = { sessionId?: string | undefined };

export type AttributionHeaders = {
  "X-Prest0n-Session-Id"?: string;
  "X-Prest0n-Session-Kind"?: string;
  "X-Prest0n-Task-Label"?: string;
  "X-Prest0n-Turn-Class"?: string;
};

export type AttributionBodyFields = {
  prest0n_task_label?: string;
  prest0n_session_kind?: string;
  prest0n_session_id?: string;
  prest0n_turn_class?: string;
};

type RegistryEntry = { taskLabel?: string; kind?: SessionKind; turnClass?: string };

type AttributionState = {
  registry: Map<string, RegistryEntry>;
  ambientSessionId: string | undefined;
};

export type AttributionApi = {
  headersFor(ctx?: AttributionContext): AttributionHeaders;
  bodyFieldsFor(ctx?: AttributionContext): AttributionBodyFields;
  stampBody<T>(body: T, ctx?: AttributionContext): T;
  registerSession(meta: SessionMeta): boolean;
  noteCurrentSession<T>(sessionId: T): T;
  deriveKind(sessionId: unknown): SessionKind | undefined;
  MARKER: string;
  _state: AttributionState;
};

let warnedOnce: Record<string, true> = Object.create(null);
function warnOnce(key: string, msg: string): void {
  if (warnedOnce[key]) return;
  warnedOnce[key] = true;
  try {
    console.warn(`${PREST0N_ATTRIBUTION_MARKER} WARN ${msg}`);
  } catch {
    /* never throw */
  }
}

function envKindPatterns(): Array<{ re: RegExp; kind: SessionKind }> {
  const raw = process.env.PREST0N_ATTR_KIND_PATTERNS;
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (e): e is { pattern: string; kind: SessionKind } =>
          Boolean(e) &&
          typeof (e as { pattern?: unknown }).pattern === "string" &&
          KINDS.has((e as { kind?: SessionKind }).kind as SessionKind),
      )
      .map((e) => ({ re: new RegExp(e.pattern, "i"), kind: e.kind }));
  } catch {
    warnOnce("kind-patterns", "PREST0N_ATTR_KIND_PATTERNS unparseable — ignored");
    return [];
  }
}

function conforming(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string" || value === "") return null;
  if (value.length > maxLen) return null;
  if (!TOKEN_RE.test(value)) return null;
  return value;
}

function createState(): AttributionState {
  return { registry: new Map(), ambientSessionId: undefined };
}

function makeApi(state: AttributionState): AttributionApi {
  function registerSession(meta: SessionMeta): boolean {
    try {
      if (!meta || typeof meta.sessionId !== "string" || meta.sessionId === "") return false;
      const entry: RegistryEntry = {};
      if (typeof meta.taskLabel === "string" && meta.taskLabel) entry.taskLabel = meta.taskLabel;
      if (meta.kind && KINDS.has(meta.kind)) entry.kind = meta.kind;
      if (typeof meta.turnClass === "string" && meta.turnClass) entry.turnClass = meta.turnClass;
      const prev = state.registry.get(meta.sessionId);
      state.registry.set(meta.sessionId, prev ? { ...prev, ...entry } : entry);
      // Bounded: evict oldest insertions past the cap (Map preserves insertion order).
      while (state.registry.size > REGISTRY_CAP) {
        const oldest = state.registry.keys().next().value;
        if (oldest === undefined) break;
        state.registry.delete(oldest);
      }
      return true;
    } catch {
      return false;
    }
  }

  function lookupSession(sessionId: string | undefined): RegistryEntry | undefined {
    if (typeof sessionId !== "string" || sessionId === "") return undefined;
    const exact = state.registry.get(sessionId);
    if (exact) return exact;
    // Spawn-time registrations may be keyed by session KEY while the transport sees a
    // derived id (or vice versa) — accept an entry whose key is a suffix/prefix component
    // of the observed id, longest key first for determinism.
    let best: { entry: RegistryEntry; keyLen: number } | undefined;
    for (const [key, entry] of state.registry) {
      if (key.length < 8) continue; // too short to be a safe substring witness
      if (sessionId.includes(key) || key.includes(sessionId)) {
        if (!best || key.length > best.keyLen) best = { entry, keyLen: key.length };
      }
    }
    return best?.entry;
  }

  function deriveKind(sessionId: unknown): SessionKind | undefined {
    if (typeof sessionId !== "string" || sessionId === "") return undefined;
    for (const { re, kind } of envKindPatterns()) {
      if (re.test(sessionId)) return kind;
    }
    for (const { re, kind } of KIND_PATTERNS) {
      if (re.test(sessionId)) return kind;
    }
    return undefined; // indeterminate → caller omits (never guess)
  }

  function noteCurrentSession<T>(sessionId: T): T {
    try {
      if (typeof sessionId === "string" && sessionId !== "") state.ambientSessionId = sessionId;
    } catch {
      /* fail-open */
    }
    return sessionId; // identity passthrough — safe to wrap in-place expressions
  }

  function headersFor(ctx?: AttributionContext): AttributionHeaders {
    try {
      let sessionId =
        ctx && typeof ctx.sessionId === "string" && ctx.sessionId !== "" ? ctx.sessionId : undefined;
      if (!sessionId && process.env.PREST0N_ATTR_AMBIENT === "1") {
        // Opt-in only: the ambient slot is racy under concurrency; mis-attribution is
        // worse than omission, so it never engages unless explicitly enabled.
        sessionId = state.ambientSessionId;
      }
      const meta = lookupSession(sessionId) ?? {};
      const kind = meta.kind && KINDS.has(meta.kind) ? meta.kind : deriveKind(sessionId);
      let label = typeof meta.taskLabel === "string" ? meta.taskLabel : undefined;
      if (!label && kind) label = DEFAULT_LABEL_BY_KIND[kind];
      let turnClass = typeof meta.turnClass === "string" ? meta.turnClass : undefined;
      if (!turnClass && kind) {
        turnClass = kind === "cron" ? "cron" : kind === "heartbeat" ? "heartbeat" : "interactive";
      }

      const headers: AttributionHeaders = {};
      const sid = conforming(sessionId, MAX_LEN.sessionId);
      if (sid) headers["X-Prest0n-Session-Id"] = sid;
      const k = conforming(kind, MAX_LEN.kind);
      if (k) headers["X-Prest0n-Session-Kind"] = k;
      const lbl = conforming(label, MAX_LEN.label);
      if (lbl) headers["X-Prest0n-Task-Label"] = lbl;
      const tc = conforming(turnClass, MAX_LEN.turnClass);
      if (tc) headers["X-Prest0n-Turn-Class"] = tc;
      if (sessionId && !k) {
        warnOnce(
          `kind:${String(sessionId).slice(0, 24)}`,
          `session kind indeterminate for id shape '${String(sessionId).slice(0, 64)}' — kind/label omitted (extend PREST0N_ATTR_KIND_PATTERNS)`,
        );
      }
      return headers;
    } catch {
      return {}; // absolute fail-open: attribution may never touch the request path
    }
  }

  function bodyFieldsFor(ctx?: AttributionContext): AttributionBodyFields {
    try {
      const h = headersFor(ctx);
      const fields: AttributionBodyFields = {};
      if (h["X-Prest0n-Task-Label"]) fields.prest0n_task_label = h["X-Prest0n-Task-Label"];
      if (h["X-Prest0n-Session-Kind"]) fields.prest0n_session_kind = h["X-Prest0n-Session-Kind"];
      if (h["X-Prest0n-Session-Id"]) fields.prest0n_session_id = h["X-Prest0n-Session-Id"];
      if (h["X-Prest0n-Turn-Class"]) fields.prest0n_turn_class = h["X-Prest0n-Turn-Class"];
      return fields;
    } catch {
      return {};
    }
  }

  /** Stamp attribution into a request params/body object's `metadata` map. Mutates
   * `metadata` in place (created if absent; existing keys like Anthropic `user_id`
   * preserved), returns the SAME object for expression chaining. ABSOLUTE fail-open:
   * returns the input untouched on any doubt; never throws into the request path. */
  function stampBody<T>(body: T, ctx?: AttributionContext): T {
    try {
      if (!body || typeof body !== "object" || Array.isArray(body)) return body;
      const fields = bodyFieldsFor(ctx);
      if (Object.keys(fields).length === 0) return body;
      const carrier = body as { metadata?: Record<string, string> };
      if (!carrier.metadata || typeof carrier.metadata !== "object" || Array.isArray(carrier.metadata)) {
        carrier.metadata = {};
      }
      Object.assign(carrier.metadata, fields);
      return body;
    } catch {
      return body;
    }
  }

  return {
    headersFor,
    bodyFieldsFor,
    stampBody,
    registerSession,
    noteCurrentSession,
    deriveKind,
    MARKER: PREST0N_ATTRIBUTION_MARKER,
    _state: state,
  };
}

// Install on the shared global slot (idempotent — a preload/dist-patch load that already
// installed the API wins, so registrations made before this module loads are never lost;
// conversely a later dist re-patch finds this API and no-ops).
function resolveSharedApi(): AttributionApi {
  try {
    const g = globalThis as Record<PropertyKey, unknown>;
    const existing = g[SYMBOL as unknown as PropertyKey] as AttributionApi | undefined;
    if (
      existing &&
      typeof existing.headersFor === "function" &&
      typeof existing.stampBody === "function"
    ) {
      return existing;
    }
    const api = makeApi(createState());
    g[SYMBOL as unknown as PropertyKey] = api;
    return api;
  } catch {
    return makeApi(createState()); // still return a working local API
  }
}

const shared = resolveSharedApi();

export const headersFor: AttributionApi["headersFor"] = (ctx) => shared.headersFor(ctx);
export const bodyFieldsFor: AttributionApi["bodyFieldsFor"] = (ctx) => shared.bodyFieldsFor(ctx);
export const stampBody: AttributionApi["stampBody"] = (body, ctx) => shared.stampBody(body, ctx);
export const registerSession: AttributionApi["registerSession"] = (meta) =>
  shared.registerSession(meta);
export const noteCurrentSession: AttributionApi["noteCurrentSession"] = (sessionId) =>
  shared.noteCurrentSession(sessionId);
export const deriveKind: AttributionApi["deriveKind"] = (sessionId) => shared.deriveKind(sessionId);

/** Test hook: fresh isolated state + warn-once reset (does not touch the global slot). */
export function _makeIsolatedForTest(): AttributionApi {
  warnedOnce = Object.create(null);
  return makeApi(createState());
}
