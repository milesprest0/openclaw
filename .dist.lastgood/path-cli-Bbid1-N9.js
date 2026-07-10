import { promises } from "node:fs";
import { resolve } from "node:path";
import { LineCounter, isMap, isScalar, isSeq, parseDocument } from "yaml";
import { n as runCommandWithRuntime } from "./cli-utils-Ce4lxCq8.js";
import { t as formatDocsLink } from "./links-CNfoPWBd.js";
import { t as applyParentDefaultHelpAction } from "./parent-default-help-DJ8ruS_z.js";
import { n as defaultRuntime } from "./runtime-kqN0Yohi.js";
import { r as theme } from "./theme-CiH_wF8x.js";
//#region src/oc-path/sentinel.ts
/**
 * Substrate-level redaction-sentinel guard.
 *
 * Closes the `__OPENCLAW_REDACTED__` corruption class by rejecting the
 * literal string at the emit boundary. Per-call-site reject rules
 * (added piecemeal in [#62281](https://github.com/openclaw/openclaw/issues/62281),
 * [#44357](https://github.com/openclaw/openclaw/issues/44357),
 * [#13495](https://github.com/openclaw/openclaw/issues/13495), and others)
 * caught the symptom; this guard removes the substrate that produced
 * the symptom in the first place.
 *
 * Throwing at emit (not at the consumer) means every code path through
 * the substrate is covered, including future call sites we haven't
 * audited.
 *
 * @module @openclaw/oc-path/sentinel
 */
/**
 * The literal string that marks redacted secrets in OpenClaw's runtime
 * representation. Writing it to disk is always a bug — the consumer
 * was supposed to drop the redacted view, not pass it through to the
 * writer.
 */
const REDACTED_SENTINEL = "__OPENCLAW_REDACTED__";
/**
 * Thrown when emit detects a `"__OPENCLAW_REDACTED__"` literal in any
 * emitted bytes. Callers should treat this as a fatal write error;
 * recovering by stripping the sentinel would silently corrupt the
 * file. Fail-closed.
 *
 * `path` is the OcPath-shaped pointer to where the sentinel was
 * detected (e.g., `oc://config/plugins.entries.foo.token`). For
 * non-config emits, it's the closest meaningful address (frontmatter
 * key, section/item slug, etc.) or just the file name.
 */
var OcEmitSentinelError = class extends Error {
  constructor(path) {
    super(`emit refused to write "${REDACTED_SENTINEL}" sentinel literal at ${path}`);
    this.code = "OC_EMIT_SENTINEL";
    this.name = "OcEmitSentinelError";
    this.path = path;
  }
};
/**
 * Throw `OcEmitSentinelError` if `value` contains the redaction
 * sentinel anywhere. Substring match (not equality) — a hostile caller
 * embedding `prefix__OPENCLAW_REDACTED__suffix` in a leaf must be
 * rejected just as forcefully as the bare sentinel; the substring form
 * still leaks the marker bytes to disk where downstream scanners flag
 * the file as corrupted.
 *
 * No-op for any non-string input. Used by every leaf-write boundary.
 */
function guardSentinel(value, ocPath) {
  if (typeof value === "string" && value.includes("__OPENCLAW_REDACTED__"))
    throw new OcEmitSentinelError(ocPath);
}
//#endregion
//#region src/oc-path/oc-path.ts
/**
 * `oc://` path syntax — universal addressing for the OpenClaw workspace.
 *
 * Canonical form:
 *
 *     oc://{file}[/{section}[/{item}[/{field}]]][?session={id}]
 *
 * Used in PatchError messages, audit events, governance warnings, lint
 * findings, doctor fixers, API error responses, SSE events, and editor
 * deep-links. No ad-hoc string paths anywhere — every path through the
 * serve layer flows through `parseOcPath` / `formatOcPath`.
 *
 * **Round-trip contract**: `formatOcPath(parseOcPath(s)) === s` for every
 * valid `s` produced by `formatOcPath`.
 *
 * @module @openclaw/oc-path/oc-path
 */
const OC_SCHEME = "oc://";
/**
 * Hard caps to prevent pathological input from exhausting resources.
 *
 * `MAX_PATH_LENGTH` — input string length. 4 KiB is enough for any
 * realistic addressing use (deep nested workflows max out around 200
 * bytes). Anything larger is either user error or hostile input.
 *
 * `MAX_SUB_SEGMENTS_PER_SLOT` — dotted sub-segment count inside a
 * single slot. Real workspace addressing maxes around 10 levels.
 *
 * `MAX_TRAVERSAL_DEPTH` — used by find walkers to bound `**`
 * recursion. Real ASTs don't nest beyond ~50; 256 is a safe ceiling.
 */
const MAX_PATH_LENGTH = 4096;
/** UTF-8 BOM. Stripped from path strings before scheme check. */
const BOM$1 = "﻿";
/**
 * True if the string contains any C0 control char (U+0000 — U+001F)
 * or DEL (U+007F). Walks by char code so we never embed literal
 * control bytes in source — the equivalent regex would put NUL/DEL
 * into this file, which lint and binary-detection tools flag.
 */
function hasControlChar(s) {
  for (let i = 0; i < s.length; i++) {
    const cc = s.charCodeAt(i);
    if (cc <= 31 || cc === 127) return true;
  }
  return false;
}
/** Reserved characters that can't appear unencoded in path segments. */
const RESERVED_CHARS_RE = /[?&%]/;
/**
 * Render a string for inclusion in error messages — replaces control
 * chars with `\xNN` escapes so error output is readable even when the
 * offending input contains invisible characters.
 */
function printable(s) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const cc = s.charCodeAt(i);
    if (cc <= 31 || cc === 127) out += `\\x${cc.toString(16).padStart(2, "0")}`;
    else out += s[i];
  }
  return out;
}
/**
 * Error thrown when an `oc://` path cannot be parsed or formatted.
 *
 * `code` is a stable, machine-readable tag; downstream consumers
 * (PatchError, audit events, error handlers) match on `code`, not on
 * `message`.
 */
var OcPathError = class extends Error {
  constructor(message, input, code) {
    super(message);
    this.name = "OcPathError";
    this.input = input;
    this.code = code;
  }
};
/**
 * Parse an `oc://` path string into a structured `OcPath`.
 *
 * Accepts the full syntax: file, optional section/item/field, optional
 * `?session=` query parameter. Unknown query parameters are silently
 * ignored.
 *
 * Throws `OcPathError` for missing scheme, empty file, or empty path
 * segments.
 */
function parseOcPath(input) {
  if (typeof input !== "string")
    throw new OcPathError("oc:// path must be a string", String(input), "OC_PATH_NOT_STRING");
  if (input.length > 4096)
    throw new OcPathError(
      `oc:// path exceeds ${MAX_PATH_LENGTH} bytes (length: ${input.length})`,
      input.slice(0, 80) + "…",
      "OC_PATH_TOO_LONG",
    );
  let normalized = input.startsWith(BOM$1) ? input.slice(1) : input;
  normalized = normalized.normalize("NFC");
  if (normalized.length > 4096)
    throw new OcPathError(
      `oc:// path exceeds ${MAX_PATH_LENGTH} bytes after NFC (length: ${normalized.length})`,
      input.slice(0, 80) + "…",
      "OC_PATH_TOO_LONG",
    );
  if (!normalized.startsWith(OC_SCHEME))
    throw new OcPathError(
      `Missing oc:// scheme: ${printable(input)}`,
      input,
      "OC_PATH_MISSING_SCHEME",
    );
  const afterScheme = normalized.slice(5);
  const queryIndex = indexOfTopLevel(afterScheme, "?");
  const pathPart = queryIndex === -1 ? afterScheme : afterScheme.slice(0, queryIndex);
  const queryPart = queryIndex === -1 ? "" : afterScheme.slice(queryIndex + 1);
  if (pathPart.length === 0)
    throw new OcPathError(`Empty oc:// path: ${printable(input)}`, input, "OC_PATH_EMPTY");
  const segments = splitRespectingBrackets(pathPart, "/", input);
  for (const seg of segments)
    if (seg.length === 0)
      throw new OcPathError(
        `Empty segment in oc:// path: ${printable(input)}`,
        input,
        "OC_PATH_EMPTY_SEGMENT",
      );
  if (segments.length > 4)
    throw new OcPathError(
      `Too many segments in oc:// path (max 4): ${printable(input)}`,
      input,
      "OC_PATH_TOO_DEEP",
    );
  for (const seg of segments) {
    validateBrackets(seg, input);
    const subs = splitRespectingBrackets(seg, ".", input);
    if (subs.length > 64)
      throw new OcPathError(
        `Sub-segment count exceeds 64 in segment "${seg}": ${printable(input)}`,
        input,
        "OC_PATH_TOO_DEEP",
      );
    for (const sub of subs) validateSubSegment(sub, input);
  }
  const session = extractSession(queryPart);
  const fileSeg = segments[0];
  const file = isQuotedSeg(fileSeg) ? unquoteSeg(fileSeg) : fileSeg;
  if (file.startsWith("/") || file.startsWith("\\") || /^[a-zA-Z]:/.test(file))
    throw new OcPathError(
      `Absolute file slot not allowed (oc:// paths are workspace-relative): ${printable(input)}`,
      input,
      "OC_PATH_ABSOLUTE_FILE",
    );
  if (file.split(/[\\/]/).some((seg) => seg === ".."))
    throw new OcPathError(
      `Parent-directory segment ('..') not allowed in oc:// file slot: ${printable(input)}`,
      input,
      "OC_PATH_PARENT_TRAVERSAL",
    );
  return {
    file,
    ...(segments[1] !== void 0 ? { section: segments[1] } : {}),
    ...(segments[2] !== void 0 ? { item: segments[2] } : {}),
    ...(segments[3] !== void 0 ? { field: segments[3] } : {}),
    ...(session !== void 0 ? { session } : {}),
  };
}
/**
 * Format an `OcPath` struct back into its canonical string form.
 *
 * Throws `OcPathError` if the struct violates structural nesting
 * (item without section, field without item).
 */
function formatOcPath(path) {
  if (!path.file || path.file.length === 0)
    throw new OcPathError("oc:// path requires a file", "", "OC_PATH_FILE_REQUIRED");
  if (path.file.startsWith("/") || path.file.startsWith("\\") || /^[a-zA-Z]:/.test(path.file))
    throw new OcPathError(
      `Absolute file slot not allowed in OcPath struct: ${printable(path.file)}`,
      path.file,
      "OC_PATH_ABSOLUTE_FILE",
    );
  if (path.file.split(/[\\/]/).some((seg) => seg === ".."))
    throw new OcPathError(
      `Parent-directory segment ('..') not allowed in OcPath.file: ${printable(path.file)}`,
      path.file,
      "OC_PATH_PARENT_TRAVERSAL",
    );
  if (hasControlChar(path.file))
    throw new OcPathError(
      `Control character in OcPath.file: ${printable(path.file)}`,
      path.file,
      "OC_PATH_CONTROL_CHAR",
    );
  if (path.item !== void 0 && path.section === void 0)
    throw new OcPathError(
      "Structural nesting violation: item requires section",
      path.file,
      "OC_PATH_NESTING",
    );
  if (path.field !== void 0 && path.item === void 0 && path.section !== void 0)
    throw new OcPathError(
      "Structural nesting violation: field requires item when section is present",
      path.file,
      "OC_PATH_NESTING",
    );
  if (path.field !== void 0 && path.item === void 0 && path.section === void 0)
    throw new OcPathError(
      "Structural nesting violation: field requires item",
      path.file,
      "OC_PATH_NESTING",
    );
  const formatSubSegment = (sub) => {
    if (isQuotedSeg(sub)) return sub;
    if (sub.startsWith("[") && sub.endsWith("]")) return sub;
    if (sub.startsWith("{") && sub.endsWith("}")) return sub;
    return quoteSeg(sub);
  };
  const validateSubForFormat = (sub, slotName) => {
    if (sub.length === 0)
      throw new OcPathError(
        `Empty dotted sub-segment in OcPath.${slotName}`,
        path.file,
        "OC_PATH_EMPTY_SUB_SEGMENT",
      );
    if (hasControlChar(sub))
      throw new OcPathError(
        `Control character in OcPath.${slotName} sub-segment "${printable(sub)}"`,
        path.file,
        "OC_PATH_CONTROL_CHAR",
      );
  };
  const formatSlot = (slot, slotName) => {
    const subs = splitRespectingBrackets(slot, ".");
    for (const sub of subs) validateSubForFormat(sub, slotName);
    return subs.map(formatSubSegment).join(".");
  };
  let out = OC_SCHEME + (/[/[\]{}?&%"\s]/.test(path.file) ? quoteSeg(path.file) : path.file);
  if (path.section !== void 0) out += "/" + formatSlot(path.section, "section");
  if (path.item !== void 0) out += "/" + formatSlot(path.item, "item");
  if (path.field !== void 0) out += "/" + formatSlot(path.field, "field");
  if (path.session !== void 0) out += "?session=" + path.session;
  if (out.length > 4096)
    throw new OcPathError(
      `Formatted oc:// exceeds ${MAX_PATH_LENGTH} bytes (length: ${out.length})`,
      out.slice(0, 80) + "…",
      "OC_PATH_TOO_LONG",
    );
  if (out.includes("__OPENCLAW_REDACTED__")) throw new OcEmitSentinelError(out);
  return out;
}
/** True iff `seg` is a positional token that resolves at lookup time. */
function isPositionalSeg(seg) {
  return seg === "$first" || seg === "$last" || /^-\d+$/.test(seg);
}
/**
 * Ordinal addressing — `#N` (zero-based) targets the Nth item by
 * document order, regardless of how the kind ordinarily addresses
 * children.
 *
 * For seq/array kinds where children are already addressed by integer
 * index, `#N` is a synonym for `N`. Where it earns its keep is in
 * **slug-addressed kinds** (md items, where two items can share a
 * slug like `- foo: a` / `- foo: b`): `#0` and `#1` distinguish them
 * by document order even when slug-addressing collapses.
 */
function isOrdinalSeg(seg) {
  return /^#\d+$/.test(seg);
}
function parseOrdinalSeg(seg) {
  const m = /^#(\d+)$/.exec(seg);
  return m === null || m[1] === void 0 ? null : Number(m[1]);
}
/**
 * Resolve a positional token (`$first` / `$last` / `-N`) against a
 * container's shape, returning the concrete segment (numeric index or
 * literal key) or `null` if the token can't apply.
 */
function resolvePositionalSeg(seg, container) {
  if (seg === "$first") {
    if (container.size === 0) return null;
    if (!container.indexable) return container.keys?.[0] ?? null;
    return "0";
  }
  if (seg === "$last") {
    if (container.size === 0) return null;
    if (!container.indexable) return container.keys?.[container.keys.length - 1] ?? null;
    return String(container.size - 1);
  }
  if (/^-\d+$/.test(seg)) {
    if (!container.indexable) return null;
    const raw = Number(seg);
    if (!Number.isInteger(raw) || Math.abs(raw) > 1e9) return null;
    const n = container.size + raw;
    return n >= 0 && n < container.size ? String(n) : null;
  }
  return null;
}
/**
 * `true` iff any sub-segment of the path is a multi-match pattern —
 * `*`, `**`, a union `{a,b,c}`, or a value predicate `[key=value]`.
 * Single-match verbs (`resolveOcPath` / `setOcPath`) reject these
 * uniformly; only `findOcPaths` consumes them.
 *
 * **Naming**: `isPattern` is the v1 name; `hasWildcard` is retained
 * as a back-compat alias since the literal "wildcard" framing was
 * what shipped first. Prefer `isPattern` in new code.
 */
function isPattern(path) {
  for (const slot of [path.section, path.item, path.field]) {
    if (slot === void 0) continue;
    for (const sub of splitRespectingBrackets(slot, ".")) {
      if (sub === "*" || sub === "**") return true;
      if (isUnionSeg(sub)) return true;
      if (isPredicateSeg(sub)) return true;
    }
  }
  return false;
}
/** @deprecated v1 — use {@link isPattern}. Behaviorally identical. */
const hasWildcard = isPattern;
/**
 * Union segment — `{a,b,c}` matches each comma-separated alternative.
 *
 *   oc://X/steps/* /{command,run}      → each step's command OR run
 *   oc://X/{steps,inputs}/* /id        → id under steps OR inputs
 *
 * Whitespace inside braces is preserved. Empty alternatives reject.
 * Nested braces are not supported in v0.
 */
function isUnionSeg(seg) {
  return seg.length >= 2 && seg.startsWith("{") && seg.endsWith("}");
}
function parseUnionSeg(seg) {
  if (!isUnionSeg(seg)) return null;
  const inner = seg.slice(1, -1);
  if (inner.length === 0) return null;
  const alts = inner.split(",");
  if (alts.some((a) => a.length === 0)) return null;
  return alts;
}
/** Multi-char first so greedy match wins (`<=` before `<`, etc.). */
const PREDICATE_OPS = ["!=", "*=", "^=", "$=", "<=", ">=", "<", ">", "="];
function isPredicateSeg(seg) {
  if (seg.length < 4 || !seg.startsWith("[") || !seg.endsWith("]")) return false;
  const inner = new Set(seg.slice(1, -1));
  return PREDICATE_OPS.some((op) => inner.has(op));
}
function parsePredicateSeg(seg) {
  if (seg.length < 4 || !seg.startsWith("[") || !seg.endsWith("]")) return null;
  const inner = seg.slice(1, -1);
  for (let i = 1; i < inner.length; i++)
    for (const op of PREDICATE_OPS) {
      if (!inner.startsWith(op, i)) continue;
      if (i + op.length >= inner.length) continue;
      return {
        key: inner.slice(0, i),
        op,
        value: inner.slice(i + op.length),
      };
    }
  return null;
}
/**
 * Evaluate a predicate against a string-coerced leaf value. The
 * walker fetches the sibling's value and passes it to this helper.
 * Returns `false` for non-leaf children (predicate can't compare an
 * object/array sibling, so it never matches).
 *
 * For numeric operators (`<` / `<=` / `>` / `>=`), both `actual` and
 * `pred.value` are coerced via `Number()` and checked with
 * `Number.isFinite`. Non-numeric leaves never match — this is
 * symmetric with how `*=` / `^=` / `$=` don't apply to numbers
 * (a number's "string form" comparison would be confusing).
 */
function evaluatePredicate(actual, pred) {
  if (actual === null) return false;
  switch (pred.op) {
    case "=":
      return actual === pred.value;
    case "!=":
      return actual !== pred.value;
    case "*=":
      return actual.includes(pred.value);
    case "^=":
      return actual.startsWith(pred.value);
    case "$=":
      return actual.endsWith(pred.value);
    case "<":
    case "<=":
    case ">":
    case ">=": {
      const a = Number(actual);
      const b = Number(pred.value);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      switch (pred.op) {
        case "<":
          return a < b;
        case "<=":
          return a <= b;
        case ">":
          return a > b;
        case ">=":
          return a >= b;
      }
      return false;
    }
  }
  return false;
}
function extractSession(queryPart) {
  if (queryPart.length === 0) return;
  for (const pair of queryPart.split("&")) {
    const eqIndex = pair.indexOf("=");
    if (eqIndex === -1) continue;
    const key = pair.slice(0, eqIndex);
    const value = pair.slice(eqIndex + 1);
    if (key === "session" && value.length > 0) return value;
  }
}
/**
 * Split `s` on `delim`, but treat balanced `[...]`, `{...}`, and
 * `"..."` regions as opaque — delimiters inside brackets/braces or
 * inside double quotes don't trigger splits.
 *
 * Quoted segments (v1.0 — addresses openclaw#69004, openclaw#76532)
 * let path keys contain `/`, `.`, `?`, `&`, `%`, and whitespace
 * verbatim:
 *
 *   oc://X/"foo/bar"/baz                          → key `foo/bar`
 *   oc://X/agents.defaults.models/"anthropic/claude-opus-4-7"/alias
 *
 * Inside a quoted segment, `\\` escapes a backslash and `\"` escapes
 * a quote. Other backslashes are literal.
 *
 * Throws `OcPathError` on unbalanced brackets/braces/quotes — malformed
 * input is rejected at parse time rather than silently tolerated.
 *
 * @internal — exported for use by the find walker; not part of the
 * public OcPath API surface.
 */
/**
 * Find the first occurrence of `ch` at the TOP level of `s` —
 * outside any balanced `[...]`, `{...}`, or `"..."` regions.
 * Used by `parseOcPath` to locate the query separator (`?`) without
 * mistakenly splitting inside a quoted key like `"foo?bar"`.
 *
 * Returns `-1` if the character is not present at the top level.
 */
function indexOfTopLevel(s, ch) {
  let depthBracket = 0;
  let depthBrace = 0;
  let inQuote = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuote) {
      if (c === "\\" && i + 1 < s.length) {
        i++;
        continue;
      }
      if (c === '"') inQuote = false;
      continue;
    }
    if (c === '"') {
      inQuote = true;
      continue;
    }
    if (c === "[") depthBracket++;
    else if (c === "]") depthBracket--;
    else if (c === "{") depthBrace++;
    else if (c === "}") depthBrace--;
    if (c === ch && depthBracket === 0 && depthBrace === 0) return i;
  }
  return -1;
}
function splitRespectingBrackets(s, delim, originalInput) {
  const out = [];
  let depthBracket = 0;
  let depthBrace = 0;
  let inQuote = false;
  let buf = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuote) {
      if (c === "\\" && i + 1 < s.length) {
        buf += c + s[i + 1];
        i++;
        continue;
      }
      if (c === '"') inQuote = false;
      buf += c;
      continue;
    }
    if (c === '"') {
      inQuote = true;
      buf += c;
      continue;
    }
    if (c === "[") depthBracket++;
    else if (c === "]") depthBracket--;
    else if (c === "{") depthBrace++;
    else if (c === "}") depthBrace--;
    if (depthBracket < 0 || depthBrace < 0)
      throw new OcPathError(
        `Unbalanced bracket/brace in oc:// path: ${originalInput ?? s}`,
        originalInput ?? s,
        "OC_PATH_UNBALANCED",
      );
    if (c === delim && depthBracket === 0 && depthBrace === 0) {
      out.push(buf);
      buf = "";
      continue;
    }
    buf += c;
  }
  if (depthBracket !== 0 || depthBrace !== 0 || inQuote)
    throw new OcPathError(
      `Unbalanced bracket/brace/quote in oc:// path: ${originalInput ?? s}`,
      originalInput ?? s,
      "OC_PATH_UNBALANCED",
    );
  out.push(buf);
  return out;
}
/**
 * `true` iff `seg` is a fully-quoted segment of the form `"..."`.
 * Used by parsers/walkers to dispatch on quoted vs bare segments.
 */
function isQuotedSeg(seg) {
  return seg.length >= 2 && seg.startsWith('"') && seg.endsWith('"');
}
/**
 * Strip surrounding quotes and unescape `\\` / `\"` from a quoted
 * segment, yielding the literal content. Inverse of `quoteSeg`.
 *
 * No-op on bare (unquoted) segments — returns input unchanged.
 */
function unquoteSeg(seg) {
  if (!isQuotedSeg(seg)) return seg;
  const inner = seg.slice(1, -1);
  let out = "";
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === "\\" && i + 1 < inner.length) {
      const next = inner[i + 1];
      if (next === "\\" || next === '"') {
        out += next;
        i++;
        continue;
      }
    }
    out += c;
  }
  return out;
}
/**
 * Quote a literal value for inclusion in a path. If the value contains
 * any character that has grammar meaning unquoted (`/`, `.`, `[`, `{`,
 * `?`, `&`, `%`, whitespace, or `"`), wrap in quotes and escape
 * embedded `\\` / `"`. Otherwise return as-is.
 *
 * Used by `formatOcPath` to round-trip slot values that came from
 * quoted-segment input.
 */
function quoteSeg(value) {
  if (value.length === 0) return '""';
  if (!/[/.[\]{}?&%"\s]/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function validateBrackets(seg, input) {
  let depthBracket = 0;
  let depthBrace = 0;
  let inQuote = false;
  let escaped = false;
  for (const c of seg) {
    if (inQuote) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inQuote = false;
      continue;
    }
    if (c === '"') {
      inQuote = true;
      continue;
    }
    if (c === "[") depthBracket++;
    else if (c === "]") depthBracket--;
    else if (c === "{") depthBrace++;
    else if (c === "}") depthBrace--;
    if (depthBracket < 0 || depthBrace < 0)
      throw new OcPathError(
        `Unbalanced bracket/brace in segment "${seg}": ${printable(input)}`,
        input,
        "OC_PATH_UNBALANCED",
      );
  }
  if (depthBracket !== 0 || depthBrace !== 0)
    throw new OcPathError(
      `Unbalanced bracket/brace in segment "${seg}": ${printable(input)}`,
      input,
      "OC_PATH_UNBALANCED",
    );
}
function validateSubSegment(sub, input) {
  if (sub.length === 0)
    throw new OcPathError(
      `Empty dotted sub-segment in oc:// path: ${printable(input)}`,
      input,
      "OC_PATH_EMPTY_SUB_SEGMENT",
    );
  if (hasControlChar(sub))
    throw new OcPathError(
      `Control character in oc:// segment "${printable(sub)}": ${printable(input)}`,
      input,
      "OC_PATH_CONTROL_CHAR",
    );
  if (isQuotedSeg(sub)) return;
  if (!sub.startsWith("[") && !sub.startsWith("{")) {
    if (RESERVED_CHARS_RE.test(sub))
      throw new OcPathError(
        `Reserved character (\`?\` / \`&\` / \`%\`) in oc:// segment "${sub}": ${printable(input)}`,
        input,
        "OC_PATH_RESERVED_CHAR",
      );
  }
  if (!sub.startsWith("[") && !sub.startsWith("{")) {
    if (sub !== sub.trim() || /\s/.test(sub))
      throw new OcPathError(
        `Whitespace in oc:// segment "${sub}": ${printable(input)}`,
        input,
        "OC_PATH_WHITESPACE",
      );
  }
  const startsBracket = sub.startsWith("[");
  const endsBracket = sub.endsWith("]");
  if (startsBracket !== endsBracket)
    throw new OcPathError(
      `Mismatched bracket in segment "${sub}": ${printable(input)}`,
      input,
      "OC_PATH_MALFORMED_PREDICATE",
    );
  if (startsBracket && endsBracket) {
    const inner = sub.slice(1, -1);
    if (inner.length === 0)
      throw new OcPathError(
        `Empty bracket segment "${sub}": ${printable(input)}`,
        input,
        "OC_PATH_MALFORMED_PREDICATE",
      );
    if (["!=", "*=", "^=", "$=", "<=", ">=", "<", ">", "="].some((op) => inner.includes(op))) {
      const parsed = parsePredicateSeg(sub);
      if (parsed === null || parsed.key.length === 0 || parsed.value.length === 0)
        throw new OcPathError(
          `Malformed predicate "${sub}" — must be \`[key<op>value]\` with non-empty key and value: ${printable(input)}`,
          input,
          "OC_PATH_MALFORMED_PREDICATE",
        );
    }
  }
  const startsBrace = sub.startsWith("{");
  const endsBrace = sub.endsWith("}");
  if (startsBrace !== endsBrace)
    throw new OcPathError(
      `Mismatched brace in segment "${sub}": ${printable(input)}`,
      input,
      "OC_PATH_MALFORMED_UNION",
    );
  if (startsBrace && endsBrace) {
    const inner = sub.slice(1, -1);
    if (inner.length === 0)
      throw new OcPathError(
        `Empty union "${sub}" — must contain at least one alternative: ${printable(input)}`,
        input,
        "OC_PATH_MALFORMED_UNION",
      );
    if (inner.split(",").some((a) => a.length === 0))
      throw new OcPathError(
        `Empty alternative in union "${sub}": ${printable(input)}`,
        input,
        "OC_PATH_MALFORMED_UNION",
      );
  }
}
//#endregion
//#region src/oc-path/slug.ts
/**
 * Slug derivation for OcPath section/item addressing.
 *
 * A slug is the kebab-case lowercase form of a heading or item text:
 *   "Tool Guidance"          → "tool-guidance"
 *   "  Restricted Data  "    → "restricted-data"
 *   "deny-rule-1"            → "deny-rule-1"   (already a slug)
 *   "API_KEY"                → "api-key"
 *   "Multi-tenant isolation" → "multi-tenant-isolation"
 *   "deny: secrets"          → "deny-secrets"  (colon + space → hyphen)
 *
 * Deterministic + idempotent. Used by parse to pre-compute slugs for
 * blocks and items, and by resolveOcPath to match section/item names.
 *
 * @module @openclaw/oc-path/slug
 */
const NON_SLUG_CHARS = /[^a-z0-9-]+/g;
const COLLAPSE_HYPHENS = /-+/g;
const TRIM_HYPHENS = /^-+|-+$/g;
/**
 * Convert arbitrary text into a slug usable as an OcPath segment.
 *
 * Rules:
 *   1. Lowercase
 *   2. Replace `_` with `-`
 *   3. Replace any non-`[a-z0-9-]` runs with a single `-`
 *   4. Collapse repeated `-`
 *   5. Trim leading/trailing `-`
 *
 * Returns the empty string for input that has no slug-valid characters
 * (e.g., `"!!"` → `""`); callers should treat empty slugs as not
 * matchable rather than as wildcards.
 */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(NON_SLUG_CHARS, "-")
    .replace(COLLAPSE_HYPHENS, "-")
    .replace(TRIM_HYPHENS, "");
}
//#endregion
//#region src/oc-path/parse.ts
const FENCE = "---";
const BOM = "﻿";
/**
 * Parse raw bytes into a `MdAst`. Soft-error policy: never
 * throws. Suspicious-but-recoverable inputs (unclosed frontmatter,
 * malformed bullet) become diagnostics.
 */
function parseMd(raw) {
  const diagnostics = [];
  const lines = (raw.startsWith(BOM) ? raw.slice(1) : raw).split(/\r?\n/);
  const fm = detectFrontmatter(lines, diagnostics);
  const bodyStartLine = fm === null ? 0 : fm.endLine + 1;
  const { preamble, blocks } = splitH2Blocks(
    lines.slice(bodyStartLine),
    bodyStartLine + 1,
    diagnostics,
  );
  return {
    ast: {
      kind: "md",
      raw,
      frontmatter: fm?.entries ?? [],
      preamble,
      blocks,
    },
    diagnostics,
  };
}
function detectFrontmatter(lines, diagnostics) {
  if (lines.length < 2) return null;
  if (lines[0] !== FENCE) return null;
  let closeIndex = -1;
  for (let i = 1; i < lines.length; i++)
    if (lines[i] === FENCE) {
      closeIndex = i;
      break;
    }
  if (closeIndex === -1) {
    diagnostics.push({
      line: 1,
      message: "frontmatter opens with --- but never closes",
      severity: "warning",
      code: "OC_FRONTMATTER_UNCLOSED",
    });
    return null;
  }
  const entries = [];
  for (let i = 1; i < closeIndex; i++) {
    const line = lines[i];
    if (line.trim().length === 0) continue;
    const m = /^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*(.*)$/.exec(line);
    if (m === null) continue;
    entries.push({
      key: m[1],
      value: unquote(m[2].trim()),
      line: i + 1,
    });
  }
  return {
    entries,
    endLine: closeIndex,
  };
}
function unquote(value) {
  if (value.length >= 2) {
    const first = value.charCodeAt(0);
    if (first === value.charCodeAt(value.length - 1) && (first === 34 || first === 39))
      return value.slice(1, -1);
  }
  return value;
}
function splitH2Blocks(bodyLines, bodyStartLineNum, diagnostics) {
  let inCode = false;
  const headings = [];
  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i];
    if (line.startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const m = /^##\s+(\S.*?)\s*$/.exec(line);
    if (m !== null)
      headings.push({
        line: i,
        text: m[1],
      });
  }
  if (headings.length === 0)
    return {
      preamble: bodyLines.join("\n"),
      blocks: [],
    };
  const preamble = bodyLines.slice(0, headings[0].line).join("\n");
  const blocks = [];
  for (let h = 0; h < headings.length; h++) {
    const start = headings[h].line;
    const end = h + 1 < headings.length ? headings[h + 1].line : bodyLines.length;
    const headingText = headings[h].text;
    const blockBodyLines = bodyLines.slice(start + 1, end);
    const bodyText = blockBodyLines.join("\n");
    const headingLineNum = bodyStartLineNum + start;
    const items = extractItems(blockBodyLines, headingLineNum + 1, diagnostics);
    const tables = extractTables(blockBodyLines, headingLineNum + 1);
    const codeBlocks = extractCodeBlocks(blockBodyLines, headingLineNum + 1);
    blocks.push({
      heading: headingText,
      slug: slugify(headingText),
      line: headingLineNum,
      bodyText,
      items,
      tables,
      codeBlocks,
    });
  }
  return {
    preamble,
    blocks,
  };
}
const BULLET_RE = /^(?:[-*+])\s+(.+?)\s*$/;
const KV_RE = /^([^:]+?)\s*:\s*(.+)$/;
function extractItems(blockBodyLines, startLineNum, _diagnostics) {
  const items = [];
  let inCode = false;
  for (let i = 0; i < blockBodyLines.length; i++) {
    const line = blockBodyLines[i];
    if (line.startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const m = BULLET_RE.exec(line);
    if (m === null) continue;
    const text = m[1];
    const kvMatch = KV_RE.exec(text);
    const item = {
      text,
      slug: kvMatch ? slugify(kvMatch[1]) : slugify(text),
      line: startLineNum + i,
      ...(kvMatch !== null
        ? {
            kv: {
              key: kvMatch[1].trim(),
              value: kvMatch[2].trim(),
            },
          }
        : {}),
    };
    items.push(item);
  }
  return items;
}
function extractTables(blockBodyLines, startLineNum) {
  const tables = [];
  let i = 0;
  while (i < blockBodyLines.length) {
    const headerLine = blockBodyLines[i];
    const sepLine = blockBodyLines[i + 1];
    if (
      headerLine.trim().startsWith("|") &&
      sepLine !== void 0 &&
      /^\s*\|\s*[:-]+(?:\s*\|\s*[:-]+)*\s*\|?\s*$/.test(sepLine)
    ) {
      const headers = splitTableRow(headerLine);
      const rows = [];
      let j = i + 2;
      while (j < blockBodyLines.length && blockBodyLines[j].trim().startsWith("|")) {
        rows.push(splitTableRow(blockBodyLines[j]));
        j++;
      }
      tables.push({
        headers,
        rows,
        line: startLineNum + i,
      });
      i = j;
      continue;
    }
    i++;
  }
  return tables;
}
function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}
function extractCodeBlocks(blockBodyLines, startLineNum) {
  const codeBlocks = [];
  let i = 0;
  while (i < blockBodyLines.length) {
    const open = blockBodyLines[i];
    if (open.startsWith("```")) {
      const lang = open.slice(3).trim();
      const langField = lang.length > 0 ? lang : null;
      const startLine = startLineNum + i;
      let j = i + 1;
      const bodyLines = [];
      while (j < blockBodyLines.length && !blockBodyLines[j].startsWith("```")) {
        bodyLines.push(blockBodyLines[j]);
        j++;
      }
      codeBlocks.push({
        lang: langField,
        text: bodyLines.join("\n"),
        line: startLine,
      });
      i = j + 1;
      continue;
    }
    i++;
  }
  return codeBlocks;
}
var ParseDepthError = class extends Error {
  constructor(line) {
    super(`structural depth exceeded MAX_PARSE_DEPTH (256) at line ${line}`);
    this.code = "OC_JSONC_DEPTH_EXCEEDED";
    this.name = "ParseDepthError";
  }
};
var ParseState = class {
  constructor(src) {
    this.src = src;
    this.pos = 0;
    this.line = 1;
  }
  peek() {
    return this.src[this.pos];
  }
  advance() {
    const c = this.src[this.pos];
    this.pos++;
    if (c === "\n") this.line++;
    return c;
  }
  eof() {
    return this.pos >= this.src.length;
  }
};
/**
 * Parse a JSONC string. Soft-error policy: doesn't throw; suspicious
 * inputs surface as diagnostics. An entirely unparseable input
 * produces an AST with `root: null` and an error diagnostic.
 */
function parseJsonc(raw) {
  const diagnostics = [];
  const st = new ParseState(raw.startsWith("﻿") ? raw.slice(1) : raw);
  skipWs(st);
  if (st.eof())
    return {
      ast: {
        kind: "jsonc",
        raw,
        root: null,
      },
      diagnostics,
    };
  let root = null;
  try {
    root = parseValue(st, diagnostics, 0);
    skipWs(st);
    if (!st.eof())
      diagnostics.push({
        line: st.line,
        message: `unexpected trailing input at offset ${st.pos}`,
        severity: "warning",
        code: "OC_JSONC_TRAILING_INPUT",
      });
  } catch (err) {
    diagnostics.push({
      line: st.line,
      message: err instanceof Error ? err.message : String(err),
      severity: "error",
      code: err instanceof ParseDepthError ? err.code : "OC_JSONC_PARSE_FAILED",
    });
  }
  return {
    ast: {
      kind: "jsonc",
      raw,
      root,
    },
    diagnostics,
  };
}
function skipWs(st) {
  while (!st.eof()) {
    const c = st.peek();
    if (c === " " || c === "	" || c === "\n" || c === "\r") {
      st.advance();
      continue;
    }
    if (c === "/") {
      const next = st.src[st.pos + 1];
      if (next === "/") {
        while (!st.eof() && st.peek() !== "\n") st.advance();
        continue;
      }
      if (next === "*") {
        st.advance();
        st.advance();
        while (!st.eof()) {
          if (st.peek() === "*" && st.src[st.pos + 1] === "/") {
            st.advance();
            st.advance();
            break;
          }
          st.advance();
        }
        continue;
      }
    }
    return;
  }
}
function parseValue(st, diags, depth) {
  if (depth > 256) throw new ParseDepthError(st.line);
  skipWs(st);
  const startLine = st.line;
  const c = st.peek();
  if (c === "{") return parseObject(st, diags, startLine, depth);
  if (c === "[") return parseArray(st, diags, startLine, depth);
  if (c === '"')
    return {
      kind: "string",
      value: parseString(st),
      line: startLine,
    };
  if (c === "t" || c === "f") return parseBoolean(st, startLine);
  if (c === "n") return parseNull(st, startLine);
  if (c === "-" || (c !== void 0 && c >= "0" && c <= "9")) return parseNumber(st, startLine);
  throw new Error(
    `unexpected character ${JSON.stringify(c)} at line ${st.line} (offset ${st.pos})`,
  );
}
function parseObject(st, diags, startLine, depth) {
  if (st.advance() !== "{") throw new Error("expected `{`");
  const entries = [];
  skipWs(st);
  if (st.peek() === "}") {
    st.advance();
    return {
      kind: "object",
      entries,
      line: startLine,
    };
  }
  while (true) {
    skipWs(st);
    if (st.peek() !== '"')
      throw new Error(`expected string key at line ${st.line} (offset ${st.pos})`);
    const keyLine = st.line;
    const key = parseString(st);
    skipWs(st);
    if (st.advance() !== ":") throw new Error(`expected \`:\` after key at line ${st.line}`);
    skipWs(st);
    const value = parseValue(st, diags, depth + 1);
    entries.push({
      key,
      value,
      line: keyLine,
    });
    skipWs(st);
    const next = st.peek();
    if (next === ",") {
      st.advance();
      skipWs(st);
      if (st.peek() === "}") {
        st.advance();
        return {
          kind: "object",
          entries,
          line: startLine,
        };
      }
      continue;
    }
    if (next === "}") {
      st.advance();
      return {
        kind: "object",
        entries,
        line: startLine,
      };
    }
    throw new Error(`expected \`,\` or \`}\` after value at line ${st.line} (offset ${st.pos})`);
  }
}
function parseArray(st, diags, startLine, depth) {
  if (st.advance() !== "[") throw new Error("expected `[`");
  const items = [];
  skipWs(st);
  if (st.peek() === "]") {
    st.advance();
    return {
      kind: "array",
      items,
      line: startLine,
    };
  }
  while (true) {
    skipWs(st);
    items.push(parseValue(st, diags, depth + 1));
    skipWs(st);
    const next = st.peek();
    if (next === ",") {
      st.advance();
      skipWs(st);
      if (st.peek() === "]") {
        st.advance();
        return {
          kind: "array",
          items,
          line: startLine,
        };
      }
      continue;
    }
    if (next === "]") {
      st.advance();
      return {
        kind: "array",
        items,
        line: startLine,
      };
    }
    throw new Error(`expected \`,\` or \`]\` after value at line ${st.line} (offset ${st.pos})`);
  }
}
function parseString(st) {
  if (st.advance() !== '"') throw new Error('expected `"`');
  let out = "";
  while (!st.eof()) {
    const c = st.advance();
    if (c === '"') return out;
    if (c === "\\") {
      const esc = st.advance();
      switch (esc) {
        case '"':
          out += '"';
          break;
        case "\\":
          out += "\\";
          break;
        case "/":
          out += "/";
          break;
        case "b":
          out += "\b";
          break;
        case "f":
          out += "\f";
          break;
        case "n":
          out += "\n";
          break;
        case "r":
          out += "\r";
          break;
        case "t":
          out += "	";
          break;
        case "u": {
          const hex = st.src.slice(st.pos, st.pos + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex))
            throw new Error(`invalid unicode escape at line ${st.line}`);
          out += String.fromCharCode(Number.parseInt(hex, 16));
          st.pos += 4;
          break;
        }
        default:
          throw new Error(`invalid escape \\${esc} at line ${st.line}`);
      }
      continue;
    }
    out += c;
  }
  throw new Error(`unterminated string starting at line ${st.line}`);
}
function parseBoolean(st, line) {
  if (st.src.slice(st.pos, st.pos + 4) === "true") {
    st.pos += 4;
    return {
      kind: "boolean",
      value: true,
      line,
    };
  }
  if (st.src.slice(st.pos, st.pos + 5) === "false") {
    st.pos += 5;
    return {
      kind: "boolean",
      value: false,
      line,
    };
  }
  throw new Error(`expected true/false at line ${st.line}`);
}
function parseNull(st, line) {
  if (st.src.slice(st.pos, st.pos + 4) === "null") {
    st.pos += 4;
    return {
      kind: "null",
      line,
    };
  }
  throw new Error(`expected null at line ${st.line}`);
}
function parseNumber(st, line) {
  const start = st.pos;
  if (st.peek() === "-") st.advance();
  while (!st.eof() && /[0-9]/.test(st.peek() ?? "")) st.advance();
  if (st.peek() === ".") {
    st.advance();
    while (!st.eof() && /[0-9]/.test(st.peek() ?? "")) st.advance();
  }
  if (st.peek() === "e" || st.peek() === "E") {
    st.advance();
    if (st.peek() === "+" || st.peek() === "-") st.advance();
    while (!st.eof() && /[0-9]/.test(st.peek() ?? "")) st.advance();
  }
  const text = st.src.slice(start, st.pos);
  const value = Number(text);
  if (!Number.isFinite(value)) throw new Error(`invalid number "${text}" at line ${st.line}`);
  return {
    kind: "number",
    value,
    line,
  };
}
//#endregion
//#region src/oc-path/jsonl/parse.ts
function parseJsonl(raw) {
  const diagnostics = [];
  const crlfCount = (raw.match(/\r\n/g) ?? []).length;
  const lfCount = (raw.match(/\n/g) ?? []).length;
  const lineEnding = crlfCount > 0 && crlfCount * 2 >= lfCount ? "\r\n" : "\n";
  let body = raw.endsWith("\r\n") ? raw.slice(0, -2) : raw.endsWith("\n") ? raw.slice(0, -1) : raw;
  body = body.replace(/\r\n/g, "\n");
  const lines = [];
  if (body.length === 0)
    return {
      ast: {
        kind: "jsonl",
        raw,
        lines,
        lineEnding,
      },
      diagnostics,
    };
  body.split("\n").forEach((lineText, idx) => {
    const lineNo = idx + 1;
    if (lineText.trim().length === 0) {
      lines.push({
        kind: "blank",
        line: lineNo,
        raw: lineText,
      });
      return;
    }
    const r = parseJsonc(lineText);
    if (r.ast.root === null) {
      lines.push({
        kind: "malformed",
        line: lineNo,
        raw: lineText,
      });
      diagnostics.push({
        line: lineNo,
        message: `line ${lineNo} could not be parsed as JSON`,
        severity: "warning",
        code: "OC_JSONL_LINE_MALFORMED",
      });
      return;
    }
    lines.push({
      kind: "value",
      line: lineNo,
      value: r.ast.root,
      raw: lineText,
    });
  });
  return {
    ast: {
      kind: "jsonl",
      raw,
      lines,
      lineEnding,
    },
    diagnostics,
  };
}
//#endregion
//#region src/oc-path/yaml/parse.ts
/**
 * YAML parser — wraps `yaml.parseDocument` for comment-preserving CST
 * + structured access. Soft-error policy: never throws on
 * parser-tolerated input; recoverable problems surface as diagnostics.
 *
 * @module @openclaw/oc-path/yaml/parse
 */
/**
 * Parse YAML bytes into a `YamlAst`. The `yaml` package is
 * comment-preserving and reports its own warnings/errors; we surface
 * those as `Diagnostic` entries.
 */
function parseYaml(raw) {
  const lineCounter = new LineCounter();
  const doc = parseDocument(raw, {
    keepSourceTokens: true,
    prettyErrors: false,
    lineCounter,
  });
  const diagnostics = [];
  for (const w of doc.warnings)
    diagnostics.push({
      line: w.linePos?.[0]?.line ?? 1,
      message: w.message,
      severity: "warning",
      code: "OC_YAML_WARN",
    });
  for (const e of doc.errors)
    diagnostics.push({
      line: e.linePos?.[0]?.line ?? 1,
      message: e.message,
      severity: "error",
      code: "OC_YAML_PARSE_FAILED",
    });
  return {
    ast: {
      kind: "yaml",
      raw,
      doc,
      lineCounter,
    },
    diagnostics,
  };
}
//#endregion
//#region src/oc-path/emit.ts
/**
 * Emit the AST. In render mode, throws `OcEmitSentinelError` if any
 * leaf string matches `REDACTED_SENTINEL`. In round-trip mode, echoes
 * `ast.raw` verbatim (does not scan unless caller opts in via
 * `acceptPreExistingSentinel: false`).
 */
function emitMd(ast, opts = {}) {
  const mode = opts.mode ?? "roundtrip";
  const guardPath = opts.fileNameForGuard ? `oc://${opts.fileNameForGuard}` : "oc://";
  const acceptPreExisting = opts.acceptPreExistingSentinel ?? true;
  if (mode === "roundtrip") {
    if (!acceptPreExisting && ast.raw.includes("__OPENCLAW_REDACTED__"))
      guardSentinel("__OPENCLAW_REDACTED__", `${guardPath}/[raw]`);
    return ast.raw;
  }
  const parts = [];
  if (ast.frontmatter.length > 0) {
    parts.push("---");
    for (const fm of ast.frontmatter) {
      guardSentinel(fm.value, `${guardPath}/[frontmatter]/${fm.key}`);
      parts.push(`${fm.key}: ${formatFrontmatterValue$2(fm.value)}`);
    }
    parts.push("---");
  }
  if (ast.preamble.length > 0) {
    guardSentinel(ast.preamble, `${guardPath}/[preamble]`);
    if (parts.length > 0) parts.push("");
    parts.push(ast.preamble);
  }
  for (const block of ast.blocks) {
    if (parts.length > 0) parts.push("");
    parts.push(`## ${block.heading}`);
    if (block.bodyText.length > 0) {
      guardSentinel(block.bodyText, `${guardPath}/${block.slug}/[body]`);
      for (const item of block.items)
        if (item.kv)
          guardSentinel(item.kv.value, `${guardPath}/${block.slug}/${item.slug}/${item.kv.key}`);
      parts.push(block.bodyText);
    }
  }
  return parts.join("\n");
}
function formatFrontmatterValue$2(value) {
  if (value.length === 0) return '""';
  if (/[:#&*?|<>=!%@`,[\]{}\r\n]/.test(value)) return JSON.stringify(value);
  return value;
}
//#endregion
//#region src/oc-path/jsonc/emit.ts
/**
 * Emit a `JsoncAst` to bytes.
 *
 * **Round-trip mode (default)** returns `ast.raw` verbatim — this
 * preserves comments, formatting, and trailing whitespace exactly.
 *
 * **Sentinel-guard policy**:
 *
 * - Round-trip echoes `ast.raw` *without* scanning for the redaction
 *   sentinel. Bytes that came in via `parseJsonc` are trusted: a
 *   workspace file legitimately containing the literal
 *   `__OPENCLAW_REDACTED__` (in a code-block comment, in a pasted
 *   error log, etc.) would otherwise become a workspace-wide emit
 *   DoS — every `openclaw path emit FILE.jsonc` would exit non-zero,
 *   breaking lint round-trip rules, doctor fixers, and LKG
 *   fingerprinting. The substrate's contract is "no NEW sentinel
 *   bytes introduced via emit", not "no sentinel byte ever leaves".
 * - Render mode walks every leaf and rejects sentinel-bearing leaf
 *   values (caller-injected sentinel via `setOcPath` lands here:
 *   `setJsoncOcPath` rebuilds raw via render-mode, so a leaf set to
 *   the sentinel by the caller is caught at the rebuild boundary
 *   before the raw is shipped back).
 *
 * Callers that want pre-existing sentinel detection (e.g., LKG
 * fingerprint verification) can opt in via
 * `acceptPreExistingSentinel: false`.
 *
 * @module @openclaw/oc-path/jsonc/emit
 */
function emitJsonc(ast, opts = {}) {
  const mode = opts.mode ?? "roundtrip";
  const guardPath = opts.fileNameForGuard ? `oc://${opts.fileNameForGuard}` : "oc://";
  const acceptPreExisting = opts.acceptPreExistingSentinel ?? true;
  if (mode === "roundtrip") {
    if (!acceptPreExisting && ast.raw.includes("__OPENCLAW_REDACTED__"))
      throw new OcEmitSentinelError(`${guardPath}/[raw]`);
    return ast.raw;
  }
  if (ast.root === null) return "";
  return renderValue$1(ast.root, guardPath, []);
}
function renderValue$1(value, guardPath, walked) {
  switch (value.kind) {
    case "object":
      return `{ ${value.entries.map((e) => `${JSON.stringify(e.key)}: ${renderValue$1(e.value, guardPath, [...walked, e.key])}`).join(", ")} }`;
    case "array":
      return `[ ${value.items.map((v, i) => renderValue$1(v, guardPath, [...walked, String(i)])).join(", ")} ]`;
    case "string":
      if (value.value.includes("__OPENCLAW_REDACTED__"))
        throw new OcEmitSentinelError(`${guardPath}/${walked.join("/")}`);
      return JSON.stringify(value.value);
    case "number":
      return String(value.value);
    case "boolean":
      return String(value.value);
    case "null":
      return "null";
  }
  throw new Error(`unreachable: jsonc renderValue kind`);
}
//#endregion
//#region src/oc-path/jsonl/emit.ts
/**
 * Emit a `JsonlAst` to bytes.
 *
 * **Round-trip mode (default)** returns `ast.raw` verbatim — preserves
 * malformed lines, blanks, trailing-newline shape exactly.
 *
 * **Render mode** rebuilds the file from line entries (re-stringifies
 * value lines via JSON.stringify; preserves blank/malformed lines
 * verbatim). Useful for synthetic ASTs.
 *
 * **Sentinel guard**: scans every emitted byte sequence for the
 * `__OPENCLAW_REDACTED__` literal.
 *
 * @module @openclaw/oc-path/jsonl/emit
 */
function emitJsonl(ast, opts = {}) {
  const mode = opts.mode ?? "roundtrip";
  const guardPath = opts.fileNameForGuard ? `oc://${opts.fileNameForGuard}` : "oc://";
  const acceptPreExisting = opts.acceptPreExistingSentinel ?? true;
  if (mode === "roundtrip") {
    if (!acceptPreExisting && ast.raw.includes("__OPENCLAW_REDACTED__"))
      throw new OcEmitSentinelError(`${guardPath}/[raw]`);
    return ast.raw;
  }
  const out = [];
  for (const ln of ast.lines) {
    if (ln.kind === "blank" || ln.kind === "malformed") {
      if (!acceptPreExisting && ln.raw.includes("__OPENCLAW_REDACTED__"))
        throw new OcEmitSentinelError(`${guardPath}/L${ln.line}`);
      out.push(ln.raw);
      continue;
    }
    out.push(renderValue(ln.value, `${guardPath}/L${ln.line}`, []));
  }
  return out.join(ast.lineEnding ?? "\n");
}
function renderValue(value, guardPath, walked) {
  switch (value.kind) {
    case "object":
      return `{${value.entries.map((e) => `${JSON.stringify(e.key)}:${renderValue(e.value, guardPath, [...walked, e.key])}`).join(",")}}`;
    case "array":
      return `[${value.items.map((v, i) => renderValue(v, guardPath, [...walked, String(i)])).join(",")}]`;
    case "string":
      if (value.value.includes("__OPENCLAW_REDACTED__"))
        throw new OcEmitSentinelError(`${guardPath}/${walked.join("/")}`);
      return JSON.stringify(value.value);
    case "number":
      return String(value.value);
    case "boolean":
      return String(value.value);
    case "null":
      return "null";
  }
  throw new Error(`unreachable: jsonl renderValue kind`);
}
//#endregion
//#region src/oc-path/yaml/emit.ts
/**
 * Emit a `YamlAst` to bytes.
 *
 * **Round-trip mode (default)** returns `ast.raw` verbatim — preserves
 * comments, anchors, formatting exactly.
 *
 * **Render mode** uses `doc.toString()` from the `yaml` package — also
 * comment-preserving, but normalizes whitespace per the package's
 * options.
 *
 * **Sentinel guard**: scans every emitted byte sequence for the
 * `__OPENCLAW_REDACTED__` literal.
 *
 * @module @openclaw/oc-path/yaml/emit
 */
function emitYaml(ast, opts = {}) {
  const mode = opts.mode ?? "roundtrip";
  const guardPath = opts.fileNameForGuard ? `oc://${opts.fileNameForGuard}` : "oc://";
  const acceptPreExisting = opts.acceptPreExistingSentinel ?? true;
  if (mode === "roundtrip") {
    if (!acceptPreExisting && ast.raw.includes("__OPENCLAW_REDACTED__"))
      throw new OcEmitSentinelError(`${guardPath}/[raw]`);
    return ast.raw;
  }
  const rendered = ast.doc.toString();
  if (rendered.includes("__OPENCLAW_REDACTED__"))
    throw new OcEmitSentinelError(`${guardPath}/[rendered]`);
  return rendered;
}
//#endregion
//#region src/oc-path/jsonc/edit.ts
/**
 * Replace the value at `path` with `newValue`. Returns the new AST or
 * a structured failure reason. Numeric segments index into arrays.
 */
function setJsoncOcPath(ast, path, newValue) {
  if (ast.root === null)
    return {
      ok: false,
      reason: "no-root",
    };
  const segments = [];
  if (path.section !== void 0) segments.push(...splitRespectingBrackets(path.section, "."));
  if (path.item !== void 0) segments.push(...splitRespectingBrackets(path.item, "."));
  if (path.field !== void 0) segments.push(...splitRespectingBrackets(path.field, "."));
  if (segments.length === 0)
    return {
      ok: true,
      ast: rebuildRaw(
        {
          ...ast,
          root: newValue,
        },
        path.file,
      ),
    };
  const replaced = replaceAt$1(ast.root, segments, 0, newValue);
  if (replaced === null)
    return {
      ok: false,
      reason: "unresolved",
    };
  return {
    ok: true,
    ast: rebuildRaw(
      {
        ...ast,
        root: replaced,
      },
      path.file,
    ),
  };
}
function replaceAt$1(current, segments, i, newValue) {
  const seg = segments[i];
  if (seg === void 0) return newValue;
  if (seg.length === 0) return null;
  if (current.kind === "object") {
    let segNorm = seg;
    if (isPositionalSeg(seg)) {
      const resolved = resolvePositionalSeg(seg, {
        indexable: false,
        size: current.entries.length,
        keys: current.entries.map((e) => e.key),
      });
      if (resolved === null) return null;
      segNorm = resolved;
    }
    const lookupKey = isQuotedSeg(segNorm) ? unquoteSeg(segNorm) : segNorm;
    const idx = current.entries.findIndex((e) => e.key === lookupKey);
    if (idx === -1) return null;
    const child = current.entries[idx];
    if (child === void 0) return null;
    const replacedChild = replaceAt$1(child.value, segments, i + 1, newValue);
    if (replacedChild === null) return null;
    const newEntry = {
      ...child,
      value: replacedChild,
    };
    const newEntries = current.entries.slice();
    newEntries[idx] = newEntry;
    return {
      kind: "object",
      entries: newEntries,
      ...(current.line !== void 0 ? { line: current.line } : {}),
    };
  }
  if (current.kind === "array") {
    let segNorm = seg;
    if (isPositionalSeg(seg)) {
      const resolved = resolvePositionalSeg(seg, {
        indexable: true,
        size: current.items.length,
      });
      if (resolved === null) return null;
      segNorm = resolved;
    }
    const idx = Number(segNorm);
    if (!Number.isInteger(idx) || idx < 0 || idx >= current.items.length) return null;
    const child = current.items[idx];
    if (child === void 0) return null;
    const replacedChild = replaceAt$1(child, segments, i + 1, newValue);
    if (replacedChild === null) return null;
    const newItems = current.items.slice();
    newItems[idx] = replacedChild;
    return {
      kind: "array",
      items: newItems,
      ...(current.line !== void 0 ? { line: current.line } : {}),
    };
  }
  return null;
}
/**
 * Re-render `ast.raw` from the (possibly mutated) tree.
 *
 * **Trivia is dropped** — see the module-level "Known limitation"
 * section above. Subsequent `emitJsonc(returnedAst)` returns these
 * synthesized bytes, NOT the original byte-fidelity input.
 *
 * Production-quality fix: parser tracks byte offsets per node;
 * `setJsoncOcPath` does a `raw.slice(0,start) + newBytes + raw.slice(end)`
 * splice, leaving trivia untouched. Tracked as PR follow-up.
 */
function rebuildRaw(ast, fileName) {
  const opts =
    fileName !== void 0
      ? {
          mode: "render",
          fileNameForGuard: fileName,
        }
      : { mode: "render" };
  const rendered = emitJsonc(
    {
      kind: "jsonc",
      raw: "",
      root: ast.root,
    },
    opts,
  );
  return {
    ...ast,
    raw: rendered,
  };
}
//#endregion
//#region src/oc-path/jsonc/resolve.ts
/**
 * Walk the JSONC tree following the OcPath. Returns the matched node
 * or `null`. Numeric path segments index into arrays.
 */
function resolveJsoncOcPath(ast, path) {
  if (ast.root === null) return null;
  const segments = [];
  if (path.section !== void 0)
    for (const s of splitRespectingBrackets(path.section, "."))
      segments.push(isQuotedSeg(s) ? unquoteSeg(s) : s);
  if (path.item !== void 0)
    for (const s of splitRespectingBrackets(path.item, "."))
      segments.push(isQuotedSeg(s) ? unquoteSeg(s) : s);
  if (path.field !== void 0)
    for (const s of splitRespectingBrackets(path.field, "."))
      segments.push(isQuotedSeg(s) ? unquoteSeg(s) : s);
  if (segments.length === 0)
    return {
      kind: "root",
      node: ast,
    };
  let current = ast.root;
  let lastEntry = null;
  const walked = [];
  for (let seg of segments) {
    if (seg.length === 0) return null;
    if (isPositionalSeg(seg)) {
      const concrete = positionalForJsonc$1(current, seg);
      if (concrete !== null) seg = concrete;
    }
    walked.push(seg);
    if (current.kind === "object") {
      const entry = current.entries.find((e) => e.key === seg);
      if (entry === void 0) return null;
      lastEntry = entry;
      current = entry.value;
      continue;
    }
    if (current.kind === "array") {
      const idx = Number(seg);
      if (!Number.isInteger(idx) || idx < 0 || idx >= current.items.length) return null;
      lastEntry = null;
      const item = current.items[idx];
      if (item === void 0) return null;
      current = item;
      continue;
    }
    return null;
  }
  if (lastEntry !== null && current === lastEntry.value)
    return {
      kind: "object-entry",
      node: lastEntry,
      path: walked,
    };
  return {
    kind: "value",
    node: current,
    path: walked,
  };
}
function positionalForJsonc$1(node, seg) {
  if (node.kind === "object") {
    const keys = node.entries.map((e) => e.key);
    return resolvePositionalSeg(seg, {
      indexable: false,
      size: keys.length,
      keys,
    });
  }
  if (node.kind === "array")
    return resolvePositionalSeg(seg, {
      indexable: true,
      size: node.items.length,
    });
  return null;
}
//#endregion
//#region src/oc-path/jsonl/edit.ts
function setJsonlOcPath(ast, path, newValue) {
  const head = path.section;
  if (head === void 0)
    return {
      ok: false,
      reason: "unresolved",
    };
  const lineIdx = pickLineIndex(ast, head);
  if (lineIdx === -1)
    return {
      ok: false,
      reason: "unresolved",
    };
  const target = ast.lines[lineIdx];
  if (target === void 0)
    return {
      ok: false,
      reason: "unresolved",
    };
  if (path.item === void 0 && path.field === void 0) {
    if (target.kind !== "value")
      return {
        ok: false,
        reason: "not-a-value-line",
      };
    return finalize$1(
      ast,
      lineIdx,
      {
        kind: "value",
        line: target.line,
        value: newValue,
        raw: target.raw,
      },
      path.file,
    );
  }
  if (target.kind !== "value")
    return {
      ok: false,
      reason: "not-a-value-line",
    };
  const segments = [];
  if (path.item !== void 0) segments.push(...splitRespectingBrackets(path.item, "."));
  if (path.field !== void 0) segments.push(...splitRespectingBrackets(path.field, "."));
  const replaced = replaceAt(target.value, segments, 0, newValue);
  if (replaced === null)
    return {
      ok: false,
      reason: "unresolved",
    };
  return finalize$1(
    ast,
    lineIdx,
    {
      kind: "value",
      line: target.line,
      value: replaced,
      raw: target.raw,
    },
    path.file,
  );
}
function replaceAt(current, segments, i, newValue) {
  const seg = segments[i];
  if (seg === void 0) return newValue;
  if (seg.length === 0) return null;
  if (current.kind === "object") {
    let segNorm = seg;
    if (isPositionalSeg(seg)) {
      const resolved = resolvePositionalSeg(seg, {
        indexable: false,
        size: current.entries.length,
        keys: current.entries.map((e) => e.key),
      });
      if (resolved === null) return null;
      segNorm = resolved;
    }
    const lookupKey = isQuotedSeg(segNorm) ? unquoteSeg(segNorm) : segNorm;
    const idx = current.entries.findIndex((e) => e.key === lookupKey);
    if (idx === -1) return null;
    const child = current.entries[idx];
    if (child === void 0) return null;
    const replacedChild = replaceAt(child.value, segments, i + 1, newValue);
    if (replacedChild === null) return null;
    const newEntry = {
      ...child,
      value: replacedChild,
    };
    const newEntries = current.entries.slice();
    newEntries[idx] = newEntry;
    return {
      kind: "object",
      entries: newEntries,
      ...(current.line !== void 0 ? { line: current.line } : {}),
    };
  }
  if (current.kind === "array") {
    let segNorm = seg;
    if (isPositionalSeg(seg)) {
      const resolved = resolvePositionalSeg(seg, {
        indexable: true,
        size: current.items.length,
      });
      if (resolved === null) return null;
      segNorm = resolved;
    }
    const idx = Number(segNorm);
    if (!Number.isInteger(idx) || idx < 0 || idx >= current.items.length) return null;
    const child = current.items[idx];
    if (child === void 0) return null;
    const replacedChild = replaceAt(child, segments, i + 1, newValue);
    if (replacedChild === null) return null;
    const newItems = current.items.slice();
    newItems[idx] = replacedChild;
    return {
      kind: "array",
      items: newItems,
      ...(current.line !== void 0 ? { line: current.line } : {}),
    };
  }
  return null;
}
function pickLineIndex(ast, addr) {
  if (addr === "$last") {
    for (let i = ast.lines.length - 1; i >= 0; i--) {
      const l = ast.lines[i];
      if (l !== void 0 && l.kind === "value") return i;
    }
    return -1;
  }
  if (addr === "$first") {
    for (let i = 0; i < ast.lines.length; i++) {
      const l = ast.lines[i];
      if (l !== void 0 && l.kind === "value") return i;
    }
    return -1;
  }
  if (/^-\d+$/.test(addr)) {
    const valueIndices = [];
    for (let i = 0; i < ast.lines.length; i++) {
      const l = ast.lines[i];
      if (l !== void 0 && l.kind === "value") valueIndices.push(i);
    }
    const n = valueIndices.length + Number(addr);
    return n >= 0 && n < valueIndices.length ? (valueIndices[n] ?? -1) : -1;
  }
  const m = /^L(\d+)$/.exec(addr);
  if (m === null || m[1] === void 0) return -1;
  const target = Number(m[1]);
  return ast.lines.findIndex((l) => l.line === target);
}
function finalize$1(ast, lineIdx, newLine, fileName) {
  const newLines = ast.lines.slice();
  newLines[lineIdx] = newLine;
  const next = {
    kind: "jsonl",
    raw: "",
    lines: newLines,
    ...(ast.lineEnding !== void 0 ? { lineEnding: ast.lineEnding } : {}),
  };
  const rendered = emitJsonl(
    next,
    fileName !== void 0
      ? {
          mode: "render",
          fileNameForGuard: fileName,
        }
      : { mode: "render" },
  );
  return {
    ok: true,
    ast: {
      ...next,
      raw: rendered,
    },
  };
}
/**
 * Append a new value as the next line. Useful for session checkpointing
 * (each event is a new line). Returns a new AST. The `path` parameter
 * is accepted for OcPath-naming consistency but jsonl append addresses
 * the file as a whole (line numbers are assigned by the substrate).
 */
function appendJsonlOcPath(ast, value) {
  const newLine = {
    kind: "value",
    line: ast.lines.length === 0 ? 1 : (ast.lines[ast.lines.length - 1]?.line ?? 0) + 1,
    value,
    raw: "",
  };
  const next = {
    kind: "jsonl",
    raw: "",
    lines: [...ast.lines, newLine],
  };
  const rendered = emitJsonl(next, { mode: "render" });
  return {
    ...next,
    raw: rendered,
  };
}
//#endregion
//#region src/oc-path/jsonl/resolve.ts
function resolveJsonlOcPath(ast, path) {
  const head = path.section;
  if (head === void 0)
    return {
      kind: "root",
      node: ast,
    };
  const lineEntry = pickLine$1(ast, head);
  if (lineEntry === null) return null;
  if (path.item === void 0 && path.field === void 0)
    return {
      kind: "line",
      node: lineEntry,
    };
  if (lineEntry.kind !== "value") return null;
  const segments = [];
  if (path.item !== void 0)
    for (const s of splitRespectingBrackets(path.item, "."))
      segments.push(isQuotedSeg(s) ? unquoteSeg(s) : s);
  if (path.field !== void 0)
    for (const s of splitRespectingBrackets(path.field, "."))
      segments.push(isQuotedSeg(s) ? unquoteSeg(s) : s);
  let current = lineEntry.value;
  let lastEntry = null;
  const walked = [];
  for (let seg of segments) {
    if (seg.length === 0) return null;
    if (isPositionalSeg(seg)) {
      const concrete = positionalForJsonc(current, seg);
      if (concrete !== null) seg = concrete;
    }
    walked.push(seg);
    if (current.kind === "object") {
      const entry = current.entries.find((e) => e.key === seg);
      if (entry === void 0) return null;
      lastEntry = entry;
      current = entry.value;
      continue;
    }
    if (current.kind === "array") {
      const idx = Number(seg);
      if (!Number.isInteger(idx) || idx < 0 || idx >= current.items.length) return null;
      lastEntry = null;
      const item = current.items[idx];
      if (item === void 0) return null;
      current = item;
      continue;
    }
    return null;
  }
  if (lastEntry !== null && current === lastEntry.value)
    return {
      kind: "object-entry",
      node: lastEntry,
      line: lineEntry.line,
      path: walked,
    };
  return {
    kind: "value",
    node: current,
    line: lineEntry.line,
    path: walked,
  };
}
function pickLine$1(ast, addr) {
  if (addr === "$last") {
    for (let i = ast.lines.length - 1; i >= 0; i--) {
      const l = ast.lines[i];
      if (l !== void 0 && l.kind === "value") return l;
    }
    return null;
  }
  if (addr === "$first") {
    for (const l of ast.lines) if (l.kind === "value") return l;
    return null;
  }
  if (/^-\d+$/.test(addr)) {
    const valueLines = ast.lines.filter((l) => l.kind === "value");
    const n = valueLines.length + Number(addr);
    return n >= 0 && n < valueLines.length ? valueLines[n] : null;
  }
  const m = /^L(\d+)$/.exec(addr);
  if (m === null || m[1] === void 0) return null;
  const target = Number(m[1]);
  for (const l of ast.lines) if (l.line === target) return l;
  return null;
}
function positionalForJsonc(node, seg) {
  if (node.kind === "object") {
    const keys = node.entries.map((e) => e.key);
    return resolvePositionalSeg(seg, {
      indexable: false,
      size: keys.length,
      keys,
    });
  }
  if (node.kind === "array")
    return resolvePositionalSeg(seg, {
      indexable: true,
      size: node.items.length,
    });
  return null;
}
//#endregion
//#region src/oc-path/edit.ts
/**
 * Replace the value at `path` with `newValue`. The new AST has fresh
 * `raw` re-rendered from the structural fields.
 */
function setMdOcPath(ast, path, newValue) {
  if (path.section === "[frontmatter]") {
    const key = path.item ?? path.field;
    if (key === void 0)
      return {
        ok: false,
        reason: "unresolved",
      };
    const idx = ast.frontmatter.findIndex((e) => e.key === key);
    if (idx === -1)
      return {
        ok: false,
        reason: "unresolved",
      };
    const existing = ast.frontmatter[idx];
    if (existing === void 0)
      return {
        ok: false,
        reason: "unresolved",
      };
    const newEntry = {
      ...existing,
      value: newValue,
    };
    const newFm = ast.frontmatter.slice();
    newFm[idx] = newEntry;
    return finalize({
      ...ast,
      frontmatter: newFm,
    });
  }
  if (path.section === void 0 || path.item === void 0 || path.field === void 0)
    return {
      ok: false,
      reason: "not-writable",
    };
  const sectionSlug = path.section.toLowerCase();
  const blockIdx = ast.blocks.findIndex((b) => b.slug === sectionSlug);
  if (blockIdx === -1)
    return {
      ok: false,
      reason: "unresolved",
    };
  const block = ast.blocks[blockIdx];
  if (block === void 0)
    return {
      ok: false,
      reason: "unresolved",
    };
  const itemSlug = path.item.toLowerCase();
  const itemIdx = block.items.findIndex((i) => i.slug === itemSlug);
  if (itemIdx === -1)
    return {
      ok: false,
      reason: "unresolved",
    };
  const item = block.items[itemIdx];
  if (item === void 0)
    return {
      ok: false,
      reason: "unresolved",
    };
  if (item.kv === void 0)
    return {
      ok: false,
      reason: "no-item-kv",
    };
  if (item.kv.key.toLowerCase() !== path.field.toLowerCase())
    return {
      ok: false,
      reason: "unresolved",
    };
  const newItem = {
    ...item,
    kv: {
      key: item.kv.key,
      value: newValue,
    },
  };
  const newItems = block.items.slice();
  newItems[itemIdx] = newItem;
  const newBlock = {
    ...block,
    items: newItems,
    bodyText: rebuildBlockBody(block, newItems),
  };
  const newBlocks = ast.blocks.slice();
  newBlocks[blockIdx] = newBlock;
  return finalize({
    ...ast,
    blocks: newBlocks,
  });
}
/**
 * Rebuild block.bodyText so emit-roundtrip mode reflects the edit. We
 * do a minimal in-place substitution on the existing bodyText: find
 * each `- key: value` line for a touched item and rewrite the value.
 *
 * For items without a matching bullet line, we leave bodyText alone
 * (the structural fields take precedence in render mode anyway).
 */
function rebuildBlockBody(block, newItems) {
  let body = block.bodyText;
  for (let i = 0; i < newItems.length; i++) {
    const newItem = newItems[i];
    const oldItem = block.items[i];
    if (newItem === void 0 || oldItem === void 0) continue;
    if (newItem.kv === void 0 || oldItem.kv === void 0) continue;
    if (newItem.kv.value === oldItem.kv.value) continue;
    const re = new RegExp(`^(\\s*-\\s*${escapeRegex(oldItem.kv.key)}\\s*:\\s*).*$`, "m");
    body = body.replace(re, `$1${newItem.kv.value}`);
  }
  return body;
}
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/**
 * Re-render `ast.raw` from the (possibly mutated) tree using the same
 * shape the round-trip emitter expects.
 */
function finalize(ast) {
  const parts = [];
  if (ast.frontmatter.length > 0) {
    parts.push("---");
    for (const fm of ast.frontmatter)
      parts.push(`${fm.key}: ${formatFrontmatterValue$1(fm.value)}`);
    parts.push("---");
  }
  if (ast.preamble.length > 0) {
    if (parts.length > 0) parts.push("");
    parts.push(ast.preamble);
  }
  for (const block of ast.blocks) {
    if (parts.length > 0) parts.push("");
    parts.push(`## ${block.heading}`);
    if (block.bodyText.length > 0) parts.push(block.bodyText);
  }
  const raw = parts.join("\n");
  return {
    ok: true,
    ast: {
      ...ast,
      raw,
    },
  };
}
function formatFrontmatterValue$1(value) {
  if (value.length === 0) return '""';
  if (/[:#&*?|<>=!%@`,[\]{}\r\n]/.test(value)) return JSON.stringify(value);
  return value;
}
//#endregion
//#region src/oc-path/resolve.ts
/**
 * Resolve an `OcPath` against an AST. Returns the matched node or
 * `null`. Slugs match case-insensitively against `slugify(input)` —
 * "Boundaries" matches a section heading "## Boundaries" because both
 * slugify to "boundaries".
 *
 * Special-case: `OcPath.section === '[frontmatter]'` (literal) addresses
 * frontmatter; `field` then names the frontmatter key. This lets a
 * single OcPath shape address both prose-tree fields and frontmatter
 * fields without growing the tuple.
 */
function resolveMdOcPath(ast, path) {
  if (path.section === "[frontmatter]") {
    const key = path.item ?? path.field;
    if (key === void 0) return null;
    const entry = ast.frontmatter.find((e) => e.key === key);
    if (entry === void 0) return null;
    return {
      kind: "frontmatter",
      node: entry,
    };
  }
  if (path.section === void 0)
    return {
      kind: "root",
      node: ast,
    };
  const sectionSlug = path.section.toLowerCase();
  const block = ast.blocks.find((b) => b.slug === sectionSlug);
  if (block === void 0) return null;
  if (path.item === void 0)
    return {
      kind: "block",
      node: block,
    };
  let item;
  if (isOrdinalSeg(path.item)) {
    const n = parseOrdinalSeg(path.item);
    if (n === null || n < 0 || n >= block.items.length) return null;
    item = block.items[n];
  } else if (isPositionalSeg(path.item)) {
    const concrete = resolvePositionalSeg(path.item, {
      indexable: true,
      size: block.items.length,
    });
    if (concrete === null) return null;
    item = block.items[Number(concrete)];
  } else {
    const itemSlug = path.item.toLowerCase();
    item = block.items.find((i) => i.slug === itemSlug);
  }
  if (item === void 0) return null;
  if (path.field === void 0)
    return {
      kind: "item",
      node: item,
      block,
    };
  if (item.kv === void 0) return null;
  if (item.kv.key.toLowerCase() !== path.field.toLowerCase()) return null;
  return {
    kind: "item-field",
    node: item,
    block,
    value: item.kv.value,
  };
}
//#endregion
//#region src/oc-path/yaml/edit.ts
/**
 * Mutate a `YamlAst` at an OcPath. Returns a new AST with the value
 * replaced.
 *
 * Implementation uses `doc.setIn(path, value)` from the `yaml` package
 * — comment-preserving on edit. Adding a new key does NOT preserve
 * surrounding formatting verbatim (the `yaml` library handles
 * pretty-printing); for byte-exact preservation use round-trip emit
 * on unmodified ASTs.
 *
 * @module @openclaw/oc-path/yaml/edit
 */
function setYamlOcPath(ast, path, newValue) {
  if (ast.doc.contents === null)
    return {
      ok: false,
      reason: "no-root",
    };
  const rawSegments = pathSegments(path);
  if (rawSegments.length === 0)
    return {
      ok: false,
      reason: "unresolved",
    };
  const segments = resolvePositionalSegments(ast.doc.contents, rawSegments);
  if (segments === null)
    return {
      ok: false,
      reason: "unresolved",
    };
  if (!ast.doc.hasIn(segments))
    return {
      ok: false,
      reason: "unresolved",
    };
  const { doc: cloned, lineCounter } = cloneDoc(ast.doc);
  cloned.setIn(segments, newValue);
  return {
    ok: true,
    ast: {
      kind: "yaml",
      raw: cloned.toString(),
      doc: cloned,
      lineCounter,
    },
  };
}
/**
 * Append-style insertion: add a new key to a map or push to a seq at
 * `path`. Used by the universal `setOcPath` when the path carries a
 * `+` / `+key` / `+nnn` insertion marker.
 */
function insertYamlOcPath(ast, parentPath, marker, newValue) {
  if (ast.doc.contents === null)
    return {
      ok: false,
      reason: "no-root",
    };
  const rawParentSegments = pathSegments(parentPath);
  const segments =
    rawParentSegments.length === 0
      ? rawParentSegments
      : resolvePositionalSegments(ast.doc.contents, rawParentSegments);
  if (segments === null)
    return {
      ok: false,
      reason: "unresolved",
    };
  const { doc: cloned, lineCounter } = cloneDoc(ast.doc);
  const parent = segments.length === 0 ? cloned.contents : cloned.getIn(segments, false);
  if (parent === void 0 || parent === null)
    return {
      ok: false,
      reason: "unresolved",
    };
  if (typeof parent === "object" && "items" in parent && Array.isArray(parent.items)) {
    const items = parent.items;
    if (items.every((p) => "key" in p)) {
      if (typeof marker !== "object" || marker.kind !== "keyed")
        return {
          ok: false,
          reason: "unresolved",
        };
      if (cloned.hasIn([...segments, marker.key]))
        return {
          ok: false,
          reason: "unresolved",
        };
      cloned.setIn([...segments, marker.key], newValue);
      return {
        ok: true,
        ast: {
          kind: "yaml",
          raw: cloned.toString(),
          doc: cloned,
          lineCounter,
        },
      };
    }
    if (typeof marker === "object" && marker.kind === "keyed")
      return {
        ok: false,
        reason: "unresolved",
      };
    const seqItems = items;
    if (marker === "+") cloned.addIn(segments, newValue);
    else if (typeof marker === "object" && marker.kind === "indexed") {
      const idx = Math.min(marker.index, seqItems.length);
      const current = cloned.getIn(segments);
      if (!Array.isArray(current))
        return {
          ok: false,
          reason: "unresolved",
        };
      const newArr = [...current];
      newArr.splice(idx, 0, newValue);
      cloned.setIn(segments, newArr);
    }
    return {
      ok: true,
      ast: {
        kind: "yaml",
        raw: cloned.toString(),
        doc: cloned,
        lineCounter,
      },
    };
  }
  return {
    ok: false,
    reason: "unresolved",
  };
}
/**
 * Walk `segments` against the live document, replacing each positional
 * token (`$first` / `$last` / `-N`) with the concrete key (for maps) or
 * index (for seqs) at that depth. Returns `null` if a positional token
 * targets a missing or non-container node — caller treats that as
 * `unresolved` and refuses to write.
 *
 * Mirrors `positionalForYaml` in resolve.ts so read and write agree on
 * which child each token names.
 */
function resolvePositionalSegments(root, segments) {
  const out = [];
  let node = root;
  for (const seg of segments) {
    if (node === null) return null;
    let segNorm = seg;
    if (isPositionalSeg(seg)) {
      const concrete = positionalForYamlNode$1(node, seg);
      if (concrete === null) return null;
      segNorm = concrete;
    }
    out.push(segNorm);
    if (isMap(node)) {
      node =
        node.items.find((p) => {
          const k = isScalar(p.key) ? p.key.value : p.key;
          return String(k) === segNorm;
        })?.value ?? null;
      continue;
    }
    if (isSeq(node)) {
      const idx = Number(segNorm);
      if (!Number.isInteger(idx) || idx < 0 || idx >= node.items.length) return null;
      node = node.items[idx] ?? null;
      continue;
    }
    node = null;
  }
  return out;
}
function positionalForYamlNode$1(node, seg) {
  if (isMap(node)) {
    const keys = node.items.map((p) => String(isScalar(p.key) ? p.key.value : p.key));
    return resolvePositionalSeg(seg, {
      indexable: false,
      size: keys.length,
      keys,
    });
  }
  if (isSeq(node)) {
    const items = node.items;
    return resolvePositionalSeg(seg, {
      indexable: true,
      size: items.length,
    });
  }
  return null;
}
function pathSegments(path) {
  const segs = [];
  const collect = (slot) => {
    if (slot === void 0) return;
    for (const sub of splitRespectingBrackets(slot, "."))
      segs.push(isQuotedSeg(sub) ? unquoteSeg(sub) : sub);
  };
  collect(path.section);
  collect(path.item);
  collect(path.field);
  return segs;
}
function cloneDoc(doc) {
  const lineCounter = new LineCounter();
  return {
    doc: parseDocument(doc.toString(), {
      keepSourceTokens: true,
      prettyErrors: false,
      lineCounter,
    }),
    lineCounter,
  };
}
//#endregion
//#region src/oc-path/yaml/resolve.ts
/**
 * Resolve an `OcPath` against a `YamlAst`.
 *
 * YAML's structural shape mirrors JSONC: objects (`Map`), arrays
 * (`Seq`), and scalars. Addressing follows the same dotted-path
 * convention used by JSONC:
 *
 *   oc://workflow.yaml/steps.0.command           → command on first step
 *   oc://workflow.yaml/name                       → top-level name
 *   oc://workflow.yaml/steps.+command             → insertion (handled by edit)
 *
 * @module @openclaw/oc-path/yaml/resolve
 */
function resolveYamlOcPath(ast, path) {
  const segments = [];
  if (path.section !== void 0)
    for (const s of splitRespectingBrackets(path.section, "."))
      segments.push(isQuotedSeg(s) ? unquoteSeg(s) : s);
  if (path.item !== void 0)
    for (const s of splitRespectingBrackets(path.item, "."))
      segments.push(isQuotedSeg(s) ? unquoteSeg(s) : s);
  if (path.field !== void 0)
    for (const s of splitRespectingBrackets(path.field, "."))
      segments.push(isQuotedSeg(s) ? unquoteSeg(s) : s);
  if (segments.length === 0)
    return {
      kind: "root",
      node: ast,
    };
  const root = ast.doc.contents;
  if (root === null) return null;
  return walkNode(root, segments, 0, []);
}
function walkNode(node, segments, i, walked) {
  if (node === null) return null;
  let seg = segments[i];
  if (seg === void 0) {
    if (isMap(node))
      return {
        kind: "map",
        path: walked,
      };
    if (isSeq(node))
      return {
        kind: "seq",
        path: walked,
      };
    if (isScalar(node))
      return {
        kind: "scalar",
        value: node.value,
        path: walked,
      };
    return null;
  }
  if (seg.length === 0) return null;
  if (isPositionalSeg(seg)) {
    const concrete = positionalForYaml(node, seg);
    if (concrete !== null) seg = concrete;
  }
  if (isMap(node)) {
    const pair = node.items.find((p) => {
      const k = isScalar(p.key) ? p.key.value : p.key;
      return String(k) === seg;
    });
    if (pair === void 0) return null;
    const childWalked = [...walked, seg];
    if (i === segments.length - 1) {
      const child = pair.value;
      if (isScalar(child))
        return {
          kind: "pair",
          key: seg,
          value: child.value,
          path: childWalked,
        };
      return walkNode(child, segments, i + 1, childWalked);
    }
    return walkNode(pair.value, segments, i + 1, childWalked);
  }
  if (isSeq(node)) {
    const idx = Number(seg);
    if (!Number.isInteger(idx) || idx < 0 || idx >= node.items.length) return null;
    const child = node.items[idx];
    return walkNode(child, segments, i + 1, [...walked, seg]);
  }
  return null;
}
function positionalForYaml(node, seg) {
  if (isMap(node)) {
    const keys = node.items.map((p) => String(isScalar(p.key) ? p.key.value : p.key));
    return resolvePositionalSeg(seg, {
      indexable: false,
      size: keys.length,
      keys,
    });
  }
  if (isSeq(node)) {
    const items = node.items;
    return resolvePositionalSeg(seg, {
      indexable: true,
      size: items.length,
    });
  }
  return null;
}
//#endregion
//#region src/oc-path/universal.ts
function detectInsertion(path) {
  const segments = [];
  if (path.section !== void 0)
    segments.push({
      slot: "section",
      value: path.section,
    });
  if (path.item !== void 0)
    segments.push({
      slot: "item",
      value: path.item,
    });
  if (path.field !== void 0)
    segments.push({
      slot: "field",
      value: path.field,
    });
  if (segments.length === 0) return null;
  const last = segments[segments.length - 1];
  if (!last.value.startsWith("+")) return null;
  const rest = last.value.slice(1);
  let marker;
  if (rest.length === 0) marker = "+";
  else if (/^\d+$/.test(rest))
    marker = {
      kind: "indexed",
      index: Number(rest),
    };
  else
    marker = {
      kind: "keyed",
      key: rest,
    };
  return {
    parentPath: {
      file: path.file,
      ...(last.slot !== "section" && path.section !== void 0 ? { section: path.section } : {}),
      ...(last.slot !== "item" && path.item !== void 0 ? { item: path.item } : {}),
      ...(last.slot !== "field" && path.field !== void 0 ? { field: path.field } : {}),
      ...(path.session !== void 0 ? { session: path.session } : {}),
    },
    marker,
  };
}
/**
 * Resolve an `OcPath` against any AST. Returns a kind-agnostic match
 * shape or `null` when the path doesn't resolve.
 *
 * Insertion-marker paths return `{kind: 'insertion-point', container}`
 * if the parent is a valid container; otherwise `null`.
 */
function resolveOcPath(ast, path) {
  if (hasWildcard(path))
    throw new OcPathError(
      `resolveOcPath received a wildcard pattern; use findOcPaths instead: ${formatOcPath(path)}`,
      formatOcPath(path),
      "OC_PATH_WILDCARD_IN_RESOLVE",
    );
  const insertion = detectInsertion(path);
  if (insertion !== null) return resolveInsertion(ast, insertion);
  switch (ast.kind) {
    case "md":
      return resolveMdToUniversal(ast, path);
    case "jsonc":
      return resolveJsoncToUniversal(ast, path);
    case "jsonl":
      return resolveJsonlToUniversal(ast, path);
    case "yaml":
      return resolveYamlToUniversal(ast, path);
  }
  return null;
}
function resolveYamlToUniversal(ast, path) {
  const m = resolveYamlOcPath(ast, path);
  if (m === null) return null;
  if (m.kind === "root")
    return {
      kind: "root",
      ast,
      line: 1,
    };
  const line = locateYamlLine(ast, path);
  if (m.kind === "map")
    return {
      kind: "node",
      descriptor: "yaml-map",
      line,
    };
  if (m.kind === "seq")
    return {
      kind: "node",
      descriptor: "yaml-seq",
      line,
    };
  if (m.kind === "scalar" || m.kind === "pair") {
    const v = m.value;
    if (v === null)
      return {
        kind: "leaf",
        valueText: "null",
        leafType: "null",
        line,
      };
    if (typeof v === "string")
      return {
        kind: "leaf",
        valueText: v,
        leafType: "string",
        line,
      };
    if (typeof v === "number")
      return {
        kind: "leaf",
        valueText: String(v),
        leafType: "number",
        line,
      };
    if (typeof v === "boolean")
      return {
        kind: "leaf",
        valueText: String(v),
        leafType: "boolean",
        line,
      };
    return {
      kind: "leaf",
      valueText: JSON.stringify(v) ?? "null",
      leafType: "string",
      line,
    };
  }
  return null;
}
function locateYamlLine(ast, path) {
  const segments = [];
  const collect = (slot) => {
    if (slot === void 0) return;
    for (const sub of splitRespectingBrackets(slot, "."))
      segments.push(isQuotedSeg(sub) ? unquoteSeg(sub) : sub);
  };
  collect(path.section);
  collect(path.item);
  collect(path.field);
  if (segments.length === 0) return 1;
  let node = ast.doc.contents;
  for (const seg of segments) {
    if (node === null || node === void 0) return 1;
    const n = node;
    if (Array.isArray(n.items)) {
      const items = n.items;
      if (
        items.length > 0 &&
        typeof items[0] === "object" &&
        items[0] !== null &&
        "key" in items[0]
      ) {
        const pair = items.find((p) => {
          const k =
            p.key !== null && typeof p.key === "object" && "value" in p.key ? p.key.value : p.key;
          return String(k) === seg;
        });
        if (pair === void 0) return 1;
        node = pair.value;
      } else {
        const idx = Number(seg);
        if (!Number.isInteger(idx) || idx < 0 || idx >= items.length) return 1;
        node = items[idx];
      }
    } else return 1;
  }
  if (node === null || typeof node !== "object") return 1;
  const range = node.range;
  if (range === void 0) return 1;
  return ast.lineCounter.linePos(range[0]).line;
}
function resolveMdToUniversal(ast, path) {
  const m = resolveMdOcPath(ast, path);
  if (m === null) return null;
  switch (m.kind) {
    case "root":
      return {
        kind: "root",
        ast,
        line: 1,
      };
    case "frontmatter":
      return {
        kind: "leaf",
        valueText: m.node.value,
        leafType: "string",
        line: m.node.line,
      };
    case "block":
      return {
        kind: "node",
        descriptor: "md-block",
        line: m.node.line,
      };
    case "item":
      return {
        kind: "node",
        descriptor: "md-item",
        line: m.node.line,
      };
    case "item-field":
      return {
        kind: "leaf",
        valueText: m.value,
        leafType: "string",
        line: m.node.line,
      };
  }
  return null;
}
function resolveJsoncToUniversal(ast, path) {
  const m = resolveJsoncOcPath(ast, path);
  if (m === null) return null;
  if (m.kind === "root")
    return {
      kind: "root",
      ast,
      line: 1,
    };
  if (m.kind === "object-entry") return jsoncValueToMatch(m.node.value, m.node.line);
  return jsoncValueToMatch(m.node, m.node.line ?? 1);
}
function jsoncValueToMatch(value, line) {
  switch (value.kind) {
    case "object":
      return {
        kind: "node",
        descriptor: "jsonc-object",
        line,
      };
    case "array":
      return {
        kind: "node",
        descriptor: "jsonc-array",
        line,
      };
    case "string":
      return {
        kind: "leaf",
        valueText: value.value,
        leafType: "string",
        line,
      };
    case "number":
      return {
        kind: "leaf",
        valueText: String(value.value),
        leafType: "number",
        line,
      };
    case "boolean":
      return {
        kind: "leaf",
        valueText: String(value.value),
        leafType: "boolean",
        line,
      };
    case "null":
      return {
        kind: "leaf",
        valueText: "null",
        leafType: "null",
        line,
      };
  }
  throw new Error(`unreachable: jsoncValueToMatch kind`);
}
function resolveJsonlToUniversal(ast, path) {
  const m = resolveJsonlOcPath(ast, path);
  if (m === null) return null;
  if (m.kind === "root")
    return {
      kind: "root",
      ast,
      line: 1,
    };
  if (m.kind === "line")
    return {
      kind: "node",
      descriptor: "jsonl-line",
      line: m.node.line,
    };
  if (m.kind === "object-entry") return jsoncValueToMatch(m.node.value, m.line);
  return jsoncValueToMatch(m.node, m.line);
}
function resolveInsertion(ast, info) {
  switch (ast.kind) {
    case "md":
      return resolveMdInsertion(ast, info);
    case "jsonc":
      return resolveJsoncInsertion(ast, info);
    case "jsonl":
      return resolveJsonlInsertion(ast, info);
    case "yaml":
      return resolveYamlInsertion(ast, info);
  }
  return null;
}
function resolveYamlInsertion(ast, info) {
  const m = resolveYamlOcPath(ast, info.parentPath);
  if (m === null) return null;
  const line = locateYamlLine(ast, info.parentPath);
  if (m.kind === "map")
    return {
      kind: "insertion-point",
      container: "yaml-map",
      line,
    };
  if (m.kind === "seq")
    return {
      kind: "insertion-point",
      container: "yaml-seq",
      line,
    };
  if (m.kind === "root") {
    const root = ast.doc.contents;
    if (root === null) return null;
    if ("items" in root)
      return {
        kind: "insertion-point",
        container: root.items.every((p) => "key" in p) ? "yaml-map" : "yaml-seq",
        line: 1,
      };
    return null;
  }
  return null;
}
function resolveMdInsertion(ast, info) {
  const p = info.parentPath;
  if (p.section === void 0)
    return {
      kind: "insertion-point",
      container: "md-file",
      line: 1,
    };
  if (p.section === "[frontmatter]")
    return {
      kind: "insertion-point",
      container: "md-frontmatter",
      line: 1,
    };
  if (p.item === void 0 && p.field === void 0) {
    const m = resolveMdOcPath(ast, p);
    if (m === null || m.kind !== "block") return null;
    return {
      kind: "insertion-point",
      container: "md-section",
      line: m.node.line,
    };
  }
  return null;
}
function resolveJsoncInsertion(ast, info) {
  const m = resolveJsoncOcPath(ast, info.parentPath);
  if (m === null) return null;
  let containerNode;
  if (m.kind === "root") {
    if (ast.root === null) return null;
    containerNode = ast.root;
  } else if (m.kind === "object-entry") containerNode = m.node.value;
  else containerNode = m.node;
  const line = containerNode.line ?? 1;
  if (containerNode.kind === "object")
    return {
      kind: "insertion-point",
      container: "jsonc-object",
      line,
    };
  if (containerNode.kind === "array")
    return {
      kind: "insertion-point",
      container: "jsonc-array",
      line,
    };
  return null;
}
function resolveJsonlInsertion(ast, info) {
  if (info.parentPath.section !== void 0) return null;
  return {
    kind: "insertion-point",
    container: "jsonl-file",
    line: (ast.lines.length > 0 ? ast.lines[ast.lines.length - 1].line : 0) + 1,
  };
}
/**
 * Replace or insert at `path` with `value` (always a string).
 * Substrate dispatches via `ast.kind` and coerces value at leaves
 * based on the existing AST shape at the path location.
 *
 * For insertion-marker paths (`+`, `+key`, `+nnn`) the value is parsed
 * as kind-appropriate content (JSON for jsonc/jsonl; plain text for md).
 *
 * Returns a structured result; never throws on parser-tolerated input.
 * Sentinel-guard violations DO throw `OcEmitSentinelError` (defense in
 * depth — refuse to write redacted content even when caller "asked").
 */
function setOcPath(ast, path, value) {
  if (hasWildcard(path))
    return {
      ok: false,
      reason: "wildcard-not-allowed",
      detail: "setOcPath requires a concrete path; use findOcPaths to enumerate matches first",
    };
  const insertion = detectInsertion(path);
  if (insertion !== null) return setInsertion(ast, insertion, value);
  switch (ast.kind) {
    case "md":
      return setMdLeaf(ast, path, value);
    case "jsonc":
      return setJsoncLeaf(ast, path, value);
    case "jsonl":
      return setJsonlLeaf(ast, path, value);
    case "yaml":
      return setYamlLeaf(ast, path, value);
  }
  throw new Error(`unreachable: setOcPath kind`);
}
function setYamlLeaf(ast, path, value) {
  const existing = resolveYamlOcPath(ast, path);
  if (existing === null)
    return {
      ok: false,
      reason: "unresolved",
    };
  if (existing.kind === "root")
    return {
      ok: false,
      reason: "not-writable",
      detail: "root replacement not supported via setOcPath",
    };
  let coerced = value;
  if (existing.kind === "scalar" || existing.kind === "pair") {
    const cur = existing.value;
    if (typeof cur === "number") {
      const n = Number(value);
      if (!Number.isFinite(n))
        return {
          ok: false,
          reason: "parse-error",
        };
      coerced = n;
    } else if (typeof cur === "boolean")
      if (value === "true") coerced = true;
      else if (value === "false") coerced = false;
      else
        return {
          ok: false,
          reason: "parse-error",
        };
    else if (cur === null && value !== "null")
      return {
        ok: false,
        reason: "parse-error",
      };
    else if (cur === null && value === "null") coerced = null;
  }
  const r = setYamlOcPath(ast, path, coerced);
  if (r.ok)
    return {
      ok: true,
      ast: r.ast,
    };
  return {
    ok: false,
    reason: r.reason,
  };
}
function setMdLeaf(ast, path, value) {
  const r = setMdOcPath(ast, path, value);
  if (r.ok)
    return {
      ok: true,
      ast: r.ast,
    };
  return {
    ok: false,
    reason: r.reason,
  };
}
function setJsoncLeaf(ast, path, value) {
  const existing = resolveJsoncOcPath(ast, path);
  if (existing === null)
    return {
      ok: false,
      reason: "unresolved",
    };
  if (existing.kind === "root")
    return {
      ok: false,
      reason: "not-writable",
      detail: "root replacement is not supported via setOcPath",
    };
  const leafValue = existing.kind === "object-entry" ? existing.node.value : existing.node;
  const coerced = coerceJsoncLeaf(value, leafValue);
  if (coerced === null)
    return {
      ok: false,
      reason: "parse-error",
      detail: `cannot coerce "${value}" to ${leafValue.kind}`,
    };
  const r = setJsoncOcPath(ast, path, coerced);
  if (r.ok)
    return {
      ok: true,
      ast: r.ast,
    };
  return {
    ok: false,
    reason: r.reason,
  };
}
function setJsonlLeaf(ast, path, value) {
  const existing = resolveJsonlOcPath(ast, path);
  if (existing === null)
    return {
      ok: false,
      reason: "unresolved",
    };
  if (existing.kind === "root")
    return {
      ok: false,
      reason: "not-writable",
      detail: "root replacement is not supported via setOcPath",
    };
  if (existing.kind === "line") {
    const parsed = tryParseJson(value);
    if (parsed === void 0)
      return {
        ok: false,
        reason: "parse-error",
        detail: `line replacement requires JSON value`,
      };
    const r = setJsonlOcPath(ast, path, jsonToJsoncValue(parsed));
    if (r.ok)
      return {
        ok: true,
        ast: r.ast,
      };
    return {
      ok: false,
      reason: r.reason,
    };
  }
  const leafValue = existing.kind === "object-entry" ? existing.node.value : existing.node;
  const coerced = coerceJsoncLeaf(value, leafValue);
  if (coerced === null)
    return {
      ok: false,
      reason: "parse-error",
      detail: `cannot coerce "${value}" to ${leafValue.kind}`,
    };
  const r = setJsonlOcPath(ast, path, coerced);
  if (r.ok)
    return {
      ok: true,
      ast: r.ast,
    };
  return {
    ok: false,
    reason: r.reason,
  };
}
function setInsertion(ast, info, value) {
  switch (ast.kind) {
    case "md":
      return setMdInsertion(ast, info, value);
    case "jsonc":
      return setJsoncInsertion(ast, info, value);
    case "jsonl":
      return setJsonlInsertion(ast, info, value);
    case "yaml":
      return setYamlInsertion(ast, info, value);
  }
  throw new Error(`unreachable: setInsertion kind`);
}
function setYamlInsertion(ast, info, value) {
  const parsed = tryParseJson(value);
  if (parsed === void 0)
    return {
      ok: false,
      reason: "parse-error",
      detail: "yaml insertion requires JSON value",
    };
  const r = insertYamlOcPath(ast, info.parentPath, info.marker, parsed);
  if (r.ok)
    return {
      ok: true,
      ast: r.ast,
    };
  return {
    ok: false,
    reason: r.reason,
  };
}
function setMdInsertion(ast, info, value) {
  const p = info.parentPath;
  if (p.section === void 0) {
    if (info.marker !== "+")
      return {
        ok: false,
        reason: "not-writable",
        detail: "md file-level insertion uses bare `+`",
      };
    return {
      ok: true,
      ast: rebuildMdRaw({
        ...ast,
        blocks: [
          ...ast.blocks,
          {
            heading: value,
            slug: slugifyHeading(value),
            line: 0,
            bodyText: "",
            items: [],
            tables: [],
            codeBlocks: [],
          },
        ],
      }),
    };
  }
  if (p.section === "[frontmatter]") {
    if (typeof info.marker !== "object" || info.marker.kind !== "keyed")
      return {
        ok: false,
        reason: "not-writable",
        detail: "md frontmatter insertion requires +key",
      };
    const key = info.marker.key;
    if (ast.frontmatter.some((e) => e.key === key))
      return {
        ok: false,
        reason: "type-mismatch",
        detail: `frontmatter key '${key}' already exists; use set, not insert`,
      };
    return {
      ok: true,
      ast: rebuildMdRaw({
        ...ast,
        frontmatter: [
          ...ast.frontmatter,
          {
            key,
            value,
            line: 0,
          },
        ],
      }),
    };
  }
  if (p.item === void 0 && p.field === void 0) {
    if (info.marker !== "+")
      return {
        ok: false,
        reason: "not-writable",
        detail: "md section insertion uses bare `+`",
      };
    const blockIdx = ast.blocks.findIndex((b) => b.slug === p.section.toLowerCase());
    if (blockIdx === -1)
      return {
        ok: false,
        reason: "unresolved",
      };
    const block = ast.blocks[blockIdx];
    const kvMatch = /^([^:]+?)\s*:\s*(.+)$/.exec(value);
    const itemLine = `- ${value}`;
    const newItem = {
      text: value,
      slug: slugifyHeading(kvMatch ? kvMatch[1] : value),
      line: 0,
      ...(kvMatch !== null
        ? {
            kv: {
              key: kvMatch[1].trim(),
              value: kvMatch[2].trim(),
            },
          }
        : {}),
    };
    const newBodyText =
      block.bodyText.length === 0 ? itemLine : block.bodyText.replace(/\n*$/, "\n") + itemLine;
    const newBlocks = ast.blocks.slice();
    newBlocks[blockIdx] = {
      ...block,
      items: [...block.items, newItem],
      bodyText: newBodyText,
    };
    return {
      ok: true,
      ast: rebuildMdRaw({
        ...ast,
        blocks: newBlocks,
      }),
    };
  }
  return {
    ok: false,
    reason: "not-writable",
  };
}
function setJsoncInsertion(ast, info, value) {
  const containerMatch = resolveJsoncInsertion(ast, info);
  if (containerMatch === null)
    return {
      ok: false,
      reason: "unresolved",
    };
  const parsed = tryParseJson(value);
  if (parsed === void 0)
    return {
      ok: false,
      reason: "parse-error",
      detail: "jsonc insertion requires JSON value",
    };
  const newJsoncValue = jsonToJsoncValue(parsed);
  if (containerMatch.kind !== "insertion-point")
    return {
      ok: false,
      reason: "unresolved",
    };
  if (containerMatch.container === "jsonc-array") {
    if (typeof info.marker === "object" && info.marker.kind === "keyed")
      return {
        ok: false,
        reason: "type-mismatch",
        detail: "cannot insert by key into array",
      };
    return mutateJsoncContainer(ast, info.parentPath, (container) => {
      if (container.kind !== "array") return null;
      const items = container.items.slice();
      if (info.marker === "+") items.push(newJsoncValue);
      else if (typeof info.marker === "object" && info.marker.kind === "indexed") {
        const idx = Math.min(info.marker.index, items.length);
        items.splice(idx, 0, newJsoncValue);
      }
      return {
        kind: "array",
        items,
        ...(container.line !== void 0 ? { line: container.line } : {}),
      };
    });
  }
  if (typeof info.marker !== "object" || info.marker.kind !== "keyed")
    return {
      ok: false,
      reason: "type-mismatch",
      detail: "jsonc object insertion requires +key",
    };
  const key = info.marker.key;
  return mutateJsoncContainer(ast, info.parentPath, (container) => {
    if (container.kind !== "object") return null;
    if (container.entries.some((e) => e.key === key)) return null;
    const newEntry = {
      key,
      value: newJsoncValue,
      line: 0,
    };
    return {
      kind: "object",
      entries: [...container.entries, newEntry],
      ...(container.line !== void 0 ? { line: container.line } : {}),
    };
  });
}
function setJsonlInsertion(ast, info, value) {
  if (info.parentPath.section !== void 0 || info.marker !== "+")
    return {
      ok: false,
      reason: "not-writable",
      detail: "jsonl insertion only supports oc://FILE/+ append",
    };
  const parsed = tryParseJson(value);
  if (parsed === void 0)
    return {
      ok: false,
      reason: "parse-error",
      detail: "jsonl line append requires JSON value",
    };
  return {
    ok: true,
    ast: appendJsonlOcPath(ast, jsonToJsoncValue(parsed)),
  };
}
function coerceJsoncLeaf(valueText, existing) {
  const lineExt = existing.line !== void 0 ? { line: existing.line } : {};
  if (existing.kind === "string")
    return {
      kind: "string",
      value: valueText,
      ...lineExt,
    };
  if (existing.kind === "number") {
    const n = Number(valueText);
    return Number.isFinite(n)
      ? {
          kind: "number",
          value: n,
          ...lineExt,
        }
      : null;
  }
  if (existing.kind === "boolean") {
    if (valueText === "true")
      return {
        kind: "boolean",
        value: true,
        ...lineExt,
      };
    if (valueText === "false")
      return {
        kind: "boolean",
        value: false,
        ...lineExt,
      };
    return null;
  }
  if (existing.kind === "null")
    return valueText === "null"
      ? {
          kind: "null",
          ...lineExt,
        }
      : null;
  return null;
}
function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return;
  }
}
function jsonToJsoncValue(v) {
  if (v === null) return { kind: "null" };
  if (typeof v === "string")
    return {
      kind: "string",
      value: v,
    };
  if (typeof v === "number")
    return {
      kind: "number",
      value: v,
    };
  if (typeof v === "boolean")
    return {
      kind: "boolean",
      value: v,
    };
  if (Array.isArray(v))
    return {
      kind: "array",
      items: v.map(jsonToJsoncValue),
    };
  if (typeof v === "object")
    return {
      kind: "object",
      entries: Object.entries(v).map(([key, value]) => ({
        key,
        value: jsonToJsoncValue(value),
        line: 0,
      })),
    };
  throw new Error(`unsupported JSON value type: ${typeof v}`);
}
function mutateJsoncContainer(ast, parentPath, mutate) {
  if (ast.root === null)
    return {
      ok: false,
      reason: "no-root",
    };
  const segments = [];
  if (parentPath.section !== void 0)
    segments.push(...splitRespectingBrackets(parentPath.section, "."));
  if (parentPath.item !== void 0) segments.push(...splitRespectingBrackets(parentPath.item, "."));
  if (parentPath.field !== void 0) segments.push(...splitRespectingBrackets(parentPath.field, "."));
  const newRoot =
    segments.length === 0 ? mutate(ast.root) : mutateAt(ast.root, segments, 0, mutate);
  if (newRoot === null)
    return {
      ok: false,
      reason: "unresolved",
    };
  const next = {
    kind: "jsonc",
    raw: "",
    root: newRoot,
  };
  return {
    ok: true,
    ast: {
      ...next,
      raw: emitJsonc(next, { mode: "render" }),
    },
  };
}
function mutateAt(current, segments, i, mutate) {
  const seg = segments[i];
  if (seg === void 0) return mutate(current);
  if (seg.length === 0) return null;
  if (current.kind === "object") {
    const lookupKey = isQuotedSeg(seg) ? unquoteSeg(seg) : seg;
    const idx = current.entries.findIndex((e) => e.key === lookupKey);
    if (idx === -1) return null;
    const child = current.entries[idx];
    const replaced = mutateAt(child.value, segments, i + 1, mutate);
    if (replaced === null) return null;
    const newEntries = current.entries.slice();
    newEntries[idx] = {
      ...child,
      value: replaced,
    };
    return {
      kind: "object",
      entries: newEntries,
      ...(current.line !== void 0 ? { line: current.line } : {}),
    };
  }
  if (current.kind === "array") {
    const idx = Number(seg);
    if (!Number.isInteger(idx) || idx < 0 || idx >= current.items.length) return null;
    const child = current.items[idx];
    const replaced = mutateAt(child, segments, i + 1, mutate);
    if (replaced === null) return null;
    const newItems = current.items.slice();
    newItems[idx] = replaced;
    return {
      kind: "array",
      items: newItems,
      ...(current.line !== void 0 ? { line: current.line } : {}),
    };
  }
  return null;
}
function rebuildMdRaw(ast) {
  const parts = [];
  if (ast.frontmatter.length > 0) {
    parts.push("---");
    for (const fm of ast.frontmatter) parts.push(`${fm.key}: ${formatFrontmatterValue(fm.value)}`);
    parts.push("---");
  }
  if (ast.preamble.length > 0) {
    if (parts.length > 0) parts.push("");
    parts.push(ast.preamble);
  }
  for (const block of ast.blocks) {
    if (parts.length > 0) parts.push("");
    parts.push(`## ${block.heading}`);
    if (block.bodyText.length > 0) parts.push(block.bodyText);
  }
  return {
    ...ast,
    raw: parts.join("\n"),
  };
}
function formatFrontmatterValue(value) {
  if (value.length === 0) return '""';
  if (/[:#&*?|<>=!%@`,[\]{}\r\n]/.test(value)) return JSON.stringify(value);
  return value;
}
function slugifyHeading(s) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
//#endregion
//#region src/oc-path/find.ts
/**
 * `findOcPaths` — universal multi-match verb. Pattern syntax extends
 * `OcPath` with two wildcard tokens:
 *
 *   `*`   — match a single sub-segment (one map key / one array index)
 *   `**`  — match zero or more sub-segments at any depth (recursive)
 *
 * **Why a separate verb**: `resolveOcPath` and `setOcPath` are
 * single-match — they require an exact path because they return one
 * value or write one leaf. A pattern would be ambiguous. `findOcPaths`
 * is the search verb: pass a pattern, get every concrete OcPath that
 * matches plus its `OcMatch` (kind + leaf text / node descriptor).
 *
 * Every returned `OcPathMatch` carries a concrete (wildcard-free)
 * `OcPath`, so callers can pipe results through `setOcPath` or
 * `resolveOcPath` without rebuilding the path. The slot shape of the
 * input pattern is preserved (a `*` in the `item` slot produces a
 * concrete path with the matched value still in `item`).
 *
 * **Use cases driving v0**:
 *   - lint rules iterating `oc://workflow.lobster/steps/* /command`
 *   - jsonl session walks `oc://session/* /eventType`
 *   - md frontmatter sweeps `oc://SOUL.md/[frontmatter]/*`
 *
 * @module @openclaw/oc-path/find
 */
/**
 * Match `pattern` against `ast` and return every concrete OcPath that
 * resolves. Empty array when nothing matches.
 *
 * Pattern semantics: same shape as `OcPath`, but any sub-segment may be
 * `*` (single-segment wildcard) or `**` (recursive descent). A pattern
 * with no wildcards is equivalent to a single `resolveOcPath` call,
 * wrapped into the find shape.
 *
 * **Insertion-marker patterns are not supported**: a `+`/`+key`/`+nnn`
 * suffix is meaningless in find context (you don't search for a place
 * to insert). Such patterns return an empty array.
 */
function findOcPaths(ast, pattern) {
  const subs = patternSubs(pattern);
  if (
    !subs.some(
      (s) =>
        s.value === "*" ||
        s.value === "**" ||
        isPositionalSeg(s.value) ||
        isUnionSeg(s.value) ||
        isPredicateSeg(s.value),
    )
  ) {
    const m = resolveOcPath(ast, pattern);
    return m === null
      ? []
      : [
          {
            path: pattern,
            match: m,
          },
        ];
  }
  const concretePaths = expand(ast, subs, pattern);
  const out = [];
  for (const concrete of concretePaths) {
    const m = resolveOcPath(ast, concrete);
    if (m !== null)
      out.push({
        path: concrete,
        match: m,
      });
  }
  return out;
}
function patternSubs(pattern) {
  const out = [];
  if (pattern.section !== void 0)
    for (const v of splitRespectingBrackets(pattern.section, "."))
      out.push({
        slot: "section",
        value: v,
      });
  if (pattern.item !== void 0)
    for (const v of splitRespectingBrackets(pattern.item, "."))
      out.push({
        slot: "item",
        value: v,
      });
  if (pattern.field !== void 0)
    for (const v of splitRespectingBrackets(pattern.field, "."))
      out.push({
        slot: "field",
        value: v,
      });
  return out;
}
function repackSlotSubs(pattern, slotSubs) {
  const sectionSubs = [];
  const itemSubs = [];
  const fieldSubs = [];
  for (const s of slotSubs)
    if (s.slot === "section") sectionSubs.push(s.value);
    else if (s.slot === "item") itemSubs.push(s.value);
    else fieldSubs.push(s.value);
  return {
    file: pattern.file,
    ...(sectionSubs.length > 0 ? { section: sectionSubs.join(".") } : {}),
    ...(itemSubs.length > 0 ? { item: itemSubs.join(".") } : {}),
    ...(fieldSubs.length > 0 ? { field: fieldSubs.join(".") } : {}),
    ...(pattern.session !== void 0 ? { session: pattern.session } : {}),
  };
}
function expand(ast, subs, pattern) {
  const concretePaths = [];
  const onMatch = (slotSubs) => {
    concretePaths.push(repackSlotSubs(pattern, slotSubs));
  };
  switch (ast.kind) {
    case "yaml":
      walkYaml(ast.doc.contents, subs, 0, [], onMatch);
      break;
    case "jsonc":
      if (ast.root !== null) walkJsonc(ast.root, subs, 0, [], onMatch);
      break;
    case "jsonl":
      walkJsonl(ast, subs, 0, [], onMatch);
      break;
    case "md":
      walkMd(ast, subs, 0, [], onMatch);
      break;
  }
  return concretePaths;
}
function walkYaml(node, subs, i, walked, onMatch) {
  if (walked.length > 256)
    throw new OcPathError(
      `findOcPaths exceeded MAX_TRAVERSAL_DEPTH (256) — likely a cycle or pathological pattern`,
      "",
      "OC_PATH_DEPTH_EXCEEDED",
    );
  if (i >= subs.length) {
    onMatch(walked);
    return;
  }
  if (node === null) return;
  let cur = subs[i];
  if (isUnionSeg(cur.value)) {
    const alts = parseUnionSeg(cur.value);
    if (alts === null) return;
    for (const alt of alts) {
      const altSubs = subs.slice();
      altSubs[i] = {
        slot: cur.slot,
        value: alt,
      };
      walkYaml(node, altSubs, i, walked, onMatch);
    }
    return;
  }
  if (isPredicateSeg(cur.value)) {
    const pred = parsePredicateSeg(cur.value);
    if (pred === null) return;
    if (isMap(node))
      for (const pair of node.items) {
        const k = isScalar(pair.key) ? String(pair.key.value) : String(pair.key);
        const childVal = pair.value;
        if (yamlChildMatchesPredicate(childVal, pred))
          walkYaml(
            childVal,
            subs,
            i + 1,
            [
              ...walked,
              {
                slot: cur.slot,
                value: quoteSeg(k),
              },
            ],
            onMatch,
          );
      }
    else if (isSeq(node))
      node.items.forEach((child, idx) => {
        if (yamlChildMatchesPredicate(child, pred))
          walkYaml(
            child,
            subs,
            i + 1,
            [
              ...walked,
              {
                slot: cur.slot,
                value: String(idx),
              },
            ],
            onMatch,
          );
      });
    return;
  }
  if (isPositionalSeg(cur.value)) {
    const concrete = positionalForYamlNode(node, cur.value);
    if (concrete === null) return;
    cur = {
      slot: cur.slot,
      value: concrete,
    };
  }
  if (cur.value === "**") {
    walkYaml(node, subs, i + 1, walked, onMatch);
    if (isMap(node))
      for (const pair of node.items) {
        const k = isScalar(pair.key) ? String(pair.key.value) : String(pair.key);
        walkYaml(
          pair.value,
          subs,
          i,
          [
            ...walked,
            {
              slot: cur.slot,
              value: quoteSeg(k),
            },
          ],
          onMatch,
        );
      }
    else if (isSeq(node))
      node.items.forEach((child, idx) => {
        walkYaml(
          child,
          subs,
          i,
          [
            ...walked,
            {
              slot: cur.slot,
              value: String(idx),
            },
          ],
          onMatch,
        );
      });
    return;
  }
  if (cur.value === "*") {
    if (isMap(node))
      for (const pair of node.items) {
        const k = isScalar(pair.key) ? String(pair.key.value) : String(pair.key);
        walkYaml(
          pair.value,
          subs,
          i + 1,
          [
            ...walked,
            {
              slot: cur.slot,
              value: quoteSeg(k),
            },
          ],
          onMatch,
        );
      }
    else if (isSeq(node))
      node.items.forEach((child, idx) => {
        walkYaml(
          child,
          subs,
          i + 1,
          [
            ...walked,
            {
              slot: cur.slot,
              value: String(idx),
            },
          ],
          onMatch,
        );
      });
    return;
  }
  const literal = isQuotedSeg(cur.value) ? unquoteSeg(cur.value) : cur.value;
  if (isMap(node)) {
    const pair = node.items.find((p) => {
      return (isScalar(p.key) ? String(p.key.value) : String(p.key)) === literal;
    });
    if (pair === void 0) return;
    walkYaml(
      pair.value,
      subs,
      i + 1,
      [
        ...walked,
        {
          slot: cur.slot,
          value: cur.value,
        },
      ],
      onMatch,
    );
    return;
  }
  if (isSeq(node)) {
    const idx = Number(literal);
    if (!Number.isInteger(idx) || idx < 0 || idx >= node.items.length) return;
    walkYaml(
      node.items[idx],
      subs,
      i + 1,
      [
        ...walked,
        {
          slot: cur.slot,
          value: cur.value,
        },
      ],
      onMatch,
    );
    return;
  }
}
function walkJsonc(node, subs, i, walked, onMatch) {
  if (walked.length > 256)
    throw new OcPathError(
      `findOcPaths exceeded MAX_TRAVERSAL_DEPTH (256) — likely a pathological pattern`,
      "",
      "OC_PATH_DEPTH_EXCEEDED",
    );
  if (i >= subs.length) {
    onMatch(walked);
    return;
  }
  let cur = subs[i];
  if (isUnionSeg(cur.value)) {
    const alts = parseUnionSeg(cur.value);
    if (alts === null) return;
    for (const alt of alts) {
      const altSubs = subs.slice();
      altSubs[i] = {
        slot: cur.slot,
        value: alt,
      };
      walkJsonc(node, altSubs, i, walked, onMatch);
    }
    return;
  }
  if (isPredicateSeg(cur.value)) {
    const pred = parsePredicateSeg(cur.value);
    if (pred === null) return;
    if (node.kind === "object") {
      for (const e of node.entries)
        if (jsoncChildMatchesPredicate(e.value, pred))
          walkJsonc(
            e.value,
            subs,
            i + 1,
            [
              ...walked,
              {
                slot: cur.slot,
                value: quoteSeg(e.key),
              },
            ],
            onMatch,
          );
    } else if (node.kind === "array")
      node.items.forEach((child, idx) => {
        if (jsoncChildMatchesPredicate(child, pred))
          walkJsonc(
            child,
            subs,
            i + 1,
            [
              ...walked,
              {
                slot: cur.slot,
                value: String(idx),
              },
            ],
            onMatch,
          );
      });
    return;
  }
  if (isPositionalSeg(cur.value)) {
    const concrete = positionalForJsoncNode(node, cur.value);
    if (concrete === null) return;
    cur = {
      slot: cur.slot,
      value: concrete,
    };
  }
  if (cur.value === "**") {
    walkJsonc(node, subs, i + 1, walked, onMatch);
    if (node.kind === "object")
      for (const e of node.entries)
        walkJsonc(
          e.value,
          subs,
          i,
          [
            ...walked,
            {
              slot: cur.slot,
              value: quoteSeg(e.key),
            },
          ],
          onMatch,
        );
    else if (node.kind === "array")
      node.items.forEach((child, idx) => {
        walkJsonc(
          child,
          subs,
          i,
          [
            ...walked,
            {
              slot: cur.slot,
              value: String(idx),
            },
          ],
          onMatch,
        );
      });
    return;
  }
  if (cur.value === "*") {
    if (node.kind === "object")
      for (const e of node.entries)
        walkJsonc(
          e.value,
          subs,
          i + 1,
          [
            ...walked,
            {
              slot: cur.slot,
              value: quoteSeg(e.key),
            },
          ],
          onMatch,
        );
    else if (node.kind === "array")
      node.items.forEach((child, idx) => {
        walkJsonc(
          child,
          subs,
          i + 1,
          [
            ...walked,
            {
              slot: cur.slot,
              value: String(idx),
            },
          ],
          onMatch,
        );
      });
    return;
  }
  if (node.kind === "object") {
    const lookupKey = isQuotedSeg(cur.value) ? unquoteSeg(cur.value) : cur.value;
    const e = node.entries.find((entry) => entry.key === lookupKey);
    if (e === void 0) return;
    walkJsonc(
      e.value,
      subs,
      i + 1,
      [
        ...walked,
        {
          slot: cur.slot,
          value: cur.value,
        },
      ],
      onMatch,
    );
    return;
  }
  if (node.kind === "array") {
    const idx = Number(cur.value);
    if (!Number.isInteger(idx) || idx < 0 || idx >= node.items.length) return;
    walkJsonc(
      node.items[idx],
      subs,
      i + 1,
      [
        ...walked,
        {
          slot: cur.slot,
          value: cur.value,
        },
      ],
      onMatch,
    );
  }
}
function walkJsonl(ast, subs, i, walked, onMatch) {
  if (walked.length > 256)
    throw new OcPathError(
      `findOcPaths exceeded MAX_TRAVERSAL_DEPTH (256) — likely a pathological JSONL pattern`,
      "",
      "OC_PATH_DEPTH_EXCEEDED",
    );
  if (i >= subs.length) {
    onMatch(walked);
    return;
  }
  const cur = subs[i];
  if (walked.length === 0) {
    if (cur.value === "**") {
      forEachValueLine(ast, (l, addr) => {
        walkJsonlInsideLine(
          l,
          subs,
          i,
          [
            {
              slot: cur.slot,
              value: addr,
            },
          ],
          onMatch,
        );
      });
      return;
    }
    if (cur.value === "*") {
      forEachValueLine(ast, (l, addr) => {
        walkJsonlInsideLine(
          l,
          subs,
          i + 1,
          [
            {
              slot: cur.slot,
              value: addr,
            },
          ],
          onMatch,
        );
      });
      return;
    }
    if (isUnionSeg(cur.value)) {
      const alts = parseUnionSeg(cur.value);
      if (alts === null) return;
      for (const alt of alts) {
        const line = pickLine(ast, alt);
        if (line === null) continue;
        const concreteAddr = line.kind === "value" ? `L${line.line}` : alt;
        walkJsonlInsideLine(
          line,
          subs,
          i + 1,
          [
            {
              slot: cur.slot,
              value: concreteAddr,
            },
          ],
          onMatch,
        );
      }
      return;
    }
    if (isPredicateSeg(cur.value)) {
      const pred = parsePredicateSeg(cur.value);
      if (pred === null) return;
      forEachValueLine(ast, (l, addr) => {
        if (l.kind !== "value") return;
        if (!evaluatePredicate(topLevelLeafText(l.value, pred.key), pred)) return;
        walkJsonlInsideLine(
          l,
          subs,
          i + 1,
          [
            {
              slot: cur.slot,
              value: addr,
            },
          ],
          onMatch,
        );
      });
      return;
    }
    const line = pickLine(ast, cur.value);
    if (line === null) return;
    const concreteAddr = line.kind === "value" ? `L${line.line}` : cur.value;
    walkJsonlInsideLine(
      line,
      subs,
      i + 1,
      [
        {
          slot: cur.slot,
          value: concreteAddr,
        },
      ],
      onMatch,
    );
    return;
  }
}
/**
 * Stringify the top-level field's leaf value for predicate evaluation
 * at the jsonl line slot. Only string/number/boolean/null leaves
 * compare; nested objects/arrays return `null` (predicate doesn't
 * match a non-leaf sibling).
 */
function topLevelLeafText(value, key) {
  if (value.kind !== "object") return null;
  const entry = value.entries.find((e) => e.key === key);
  if (entry === void 0) return null;
  const v = entry.value;
  if (v.kind === "string") return v.value;
  if (v.kind === "number" || v.kind === "boolean") return String(v.value);
  if (v.kind === "null") return null;
  return null;
}
function walkJsonlInsideLine(line, subs, i, walked, onMatch) {
  if (walked.length > 256)
    throw new OcPathError(
      `findOcPaths exceeded MAX_TRAVERSAL_DEPTH (256) — likely a pathological JSONL pattern`,
      "",
      "OC_PATH_DEPTH_EXCEEDED",
    );
  if (i >= subs.length) {
    onMatch(walked);
    return;
  }
  if (line.kind !== "value") return;
  walkJsonc(line.value, subs, i, walked, onMatch);
}
function forEachValueLine(ast, visit) {
  for (const l of ast.lines) if (l.kind === "value") visit(l, `L${l.line}`);
}
function pickLine(ast, addr) {
  if (addr === "$last") {
    for (let i = ast.lines.length - 1; i >= 0; i--) {
      const l = ast.lines[i];
      if (l !== void 0 && l.kind === "value") return l;
    }
    return null;
  }
  if (addr === "$first") {
    for (const l of ast.lines) if (l.kind === "value") return l;
    return null;
  }
  if (/^-\d+$/.test(addr)) {
    const valueLines = ast.lines.filter((l) => l.kind === "value");
    const n = valueLines.length + Number(addr);
    return n >= 0 && n < valueLines.length ? valueLines[n] : null;
  }
  const m = /^L(\d+)$/.exec(addr);
  if (m === null || m[1] === void 0) return null;
  const target = Number(m[1]);
  for (const l of ast.lines) if (l.line === target) return l;
  return null;
}
function positionalForYamlNode(node, seg) {
  if (isMap(node)) {
    const keys = node.items.map((p) => String(isScalar(p.key) ? p.key.value : p.key));
    return resolvePositionalSeg(seg, {
      indexable: false,
      size: keys.length,
      keys,
    });
  }
  if (isSeq(node)) {
    const items = node.items;
    return resolvePositionalSeg(seg, {
      indexable: true,
      size: items.length,
    });
  }
  return null;
}
function positionalForJsoncNode(node, seg) {
  if (node.kind === "object") {
    const keys = node.entries.map((e) => e.key);
    return resolvePositionalSeg(seg, {
      indexable: false,
      size: keys.length,
      keys,
    });
  }
  if (node.kind === "array")
    return resolvePositionalSeg(seg, {
      indexable: true,
      size: node.items.length,
    });
  return null;
}
function yamlChildMatchesPredicate(node, pred) {
  return evaluatePredicate(yamlChildFieldText(node, pred.key), pred);
}
function yamlChildFieldText(node, key) {
  if (node === null) return null;
  if (!isMap(node)) return null;
  for (const pair of node.items) {
    if ((isScalar(pair.key) ? String(pair.key.value) : String(pair.key)) !== key) continue;
    const v = pair.value;
    if (isScalar(v)) {
      const sv = v.value;
      if (sv === null) return "null";
      if (typeof sv === "string") return sv;
      if (typeof sv === "number" || typeof sv === "boolean") return String(sv);
      return JSON.stringify(sv) ?? "null";
    }
    return null;
  }
  return null;
}
function jsoncChildMatchesPredicate(node, pred) {
  return evaluatePredicate(jsoncChildFieldText(node, pred.key), pred);
}
function jsoncChildFieldText(node, key) {
  if (node.kind !== "object") return null;
  const e = node.entries.find((entry) => entry.key === key);
  if (e === void 0) return null;
  const v = e.value;
  if (v.kind === "string") return v.value;
  if (v.kind === "number") return String(v.value);
  if (v.kind === "boolean") return String(v.value);
  if (v.kind === "null") return "null";
  return null;
}
function walkMd(ast, subs, i, walked, onMatch) {
  if (i >= subs.length) {
    onMatch(walked);
    return;
  }
  const cur = subs[i];
  if (walked.length === 0 && cur.value === "[frontmatter]") {
    const next = subs[i + 1];
    if (next === void 0) {
      onMatch([
        {
          slot: cur.slot,
          value: cur.value,
        },
      ]);
      return;
    }
    if (next.value === "*" || next.value === "**") {
      for (const fm of ast.frontmatter)
        onMatch([
          {
            slot: cur.slot,
            value: cur.value,
          },
          {
            slot: next.slot,
            value: fm.key,
          },
        ]);
      return;
    }
    const fmKey = isQuotedSeg(next.value) ? unquoteSeg(next.value) : next.value;
    if (ast.frontmatter.find((e) => e.key === fmKey) === void 0) return;
    onMatch([
      {
        slot: cur.slot,
        value: cur.value,
      },
      {
        slot: next.slot,
        value: next.value,
      },
    ]);
    return;
  }
  if (walked.length === 0) {
    if (cur.value === "*" || cur.value === "**") {
      for (const block of ast.blocks) {
        walkMdInsideBlock(
          block,
          ast,
          subs,
          i + 1,
          [
            {
              slot: cur.slot,
              value: block.slug,
            },
          ],
          onMatch,
        );
        if (cur.value === "**")
          walkMdInsideBlock(
            block,
            ast,
            subs,
            i,
            [
              {
                slot: cur.slot,
                value: block.slug,
              },
            ],
            onMatch,
          );
      }
      if (cur.value === "**" && i + 1 >= subs.length) onMatch([]);
      return;
    }
    const targetSlug = cur.value.toLowerCase();
    const block = ast.blocks.find((b) => b.slug === targetSlug);
    if (block === void 0) return;
    walkMdInsideBlock(
      block,
      ast,
      subs,
      i + 1,
      [
        {
          slot: cur.slot,
          value: cur.value,
        },
      ],
      onMatch,
    );
  }
}
function walkMdInsideBlock(block, ast, subs, i, walked, onMatch) {
  if (i >= subs.length) {
    onMatch(walked);
    return;
  }
  const cur = subs[i];
  if (cur.value === "*" || cur.value === "**") {
    const slugCounts = /* @__PURE__ */ new Map();
    for (const item of block.items) slugCounts.set(item.slug, (slugCounts.get(item.slug) ?? 0) + 1);
    block.items.forEach((item, idx) => {
      const seg = (slugCounts.get(item.slug) ?? 0) > 1 ? `#${idx}` : item.slug;
      walkMdInsideItem(
        item,
        ast,
        subs,
        i + 1,
        [
          ...walked,
          {
            slot: cur.slot,
            value: seg,
          },
        ],
        onMatch,
      );
    });
    if (cur.value === "**" && i + 1 >= subs.length) onMatch(walked);
    return;
  }
  let item;
  if (isOrdinalSeg(cur.value)) {
    const n = parseOrdinalSeg(cur.value);
    if (n === null || n < 0 || n >= block.items.length) return;
    item = block.items[n];
  } else if (isPositionalSeg(cur.value)) {
    const concrete = resolvePositionalSeg(cur.value, {
      indexable: true,
      size: block.items.length,
    });
    if (concrete === null) return;
    item = block.items[Number(concrete)];
  } else {
    const targetItemSlug = cur.value.toLowerCase();
    item = block.items.find((it) => it.slug === targetItemSlug);
  }
  if (item === void 0) return;
  walkMdInsideItem(
    item,
    ast,
    subs,
    i + 1,
    [
      ...walked,
      {
        slot: cur.slot,
        value: cur.value,
      },
    ],
    onMatch,
  );
}
function walkMdInsideItem(item, _ast, subs, i, walked, onMatch) {
  if (i >= subs.length) {
    onMatch(walked);
    return;
  }
  const cur = subs[i];
  if (item.kv === void 0) return;
  if (cur.value === "*" || cur.value === "**") {
    onMatch([
      ...walked,
      {
        slot: cur.slot,
        value: item.kv.key,
      },
    ]);
    return;
  }
  if (item.kv.key.toLowerCase() !== cur.value.toLowerCase()) return;
  onMatch([
    ...walked,
    {
      slot: cur.slot,
      value: cur.value,
    },
  ]);
}
//#endregion
//#region src/oc-path/dispatch.ts
/**
 * Recommend a kind from a filename. Pure convention helper — returns
 * the substrate's default mapping. Consumers can override.
 */
function inferKind(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".md")) return "md";
  if (lower.endsWith(".jsonl") || lower.endsWith(".ndjson")) return "jsonl";
  if (lower.endsWith(".jsonc") || lower.endsWith(".json")) return "jsonc";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml") || lower.endsWith(".lobster"))
    return "yaml";
  return null;
}
//#endregion
//#region src/commands/path.ts
/**
 * `openclaw path` — shell-level access to the OcPath substrate verbs.
 * Self-hosters and editor extensions use it to inspect and surgically
 * edit workspace files without scripting against the SDK directly.
 *
 * Subcommands:
 *   - `resolve <oc-path>`     — print the match at the path
 *   - `set <oc-path> <value>` — write a leaf at the path; supports `--dry-run`
 *   - `find <pattern>`        — enumerate matches for a wildcard/predicate path
 *   - `validate <oc-path>`    — parse-only; print structure
 *   - `emit <file>`           — read + parseXxx + emitXxx; verifies byte-fidelity
 *
 * Output is TTY-aware: defaults to human-readable when stdout is a TTY,
 * switches to JSON otherwise (so pipes don't get formatting noise).
 * `--json` and `--human` flags override the auto-detection.
 *
 * Boundaries this CLI does NOT cross (v0):
 *   - Doesn't know about LKG. `set` writes raw bytes through the
 *     substrate emit; if the file is LKG-tracked, the next observe
 *     call decides whether to promote / recover.
 *   - Doesn't know about lint rules or doctor fixers — that's a
 *     different surface.
 */
const SCRUB_PLACEHOLDER = "[REDACTED]";
/**
 * Output-boundary sentinel scrub. Replaces every occurrence of the
 * redaction sentinel with `[REDACTED]` before writing to the output
 * stream. Defense-in-depth — even if a future code path surfaces raw
 * file content carrying the sentinel, the CLI must not echo it.
 */
function scrubSentinel(s) {
  if (!s.includes("__OPENCLAW_REDACTED__")) return s;
  return s.split(REDACTED_SENTINEL).join(SCRUB_PLACEHOLDER);
}
function detectMode(options) {
  if (options.json === true) return "json";
  if (options.human === true) return "human";
  return process.stdout.isTTY ? "human" : "json";
}
function emit(runtime, mode, value, humanFallback) {
  if (mode === "json") {
    runtime.writeStdout(scrubSentinel(JSON.stringify(value, null, 2)));
    return;
  }
  runtime.writeStdout(scrubSentinel(humanFallback()));
}
function emitError(runtime, mode, message, code = "ERR") {
  const scrubbed = scrubSentinel(message);
  if (mode === "json") {
    runtime.error(
      JSON.stringify({
        error: {
          code,
          message: scrubbed,
        },
      }),
    );
    return;
  }
  runtime.error(`${code}: ${scrubbed}`);
}
async function loadAst(absPath, fileName) {
  const raw = await promises.readFile(absPath, "utf-8");
  const kind = inferKind(fileName);
  if (kind === "jsonc") return parseJsonc(raw).ast;
  if (kind === "jsonl") return parseJsonl(raw).ast;
  if (kind === "yaml") return parseYaml(raw).ast;
  return parseMd(raw).ast;
}
function emitForKind(ast, fileName) {
  const opts = fileName !== void 0 ? { fileNameForGuard: fileName } : {};
  switch (ast.kind) {
    case "jsonc":
      return emitJsonc(ast, opts);
    case "jsonl":
      return emitJsonl(ast, opts);
    case "yaml":
      return emitYaml(ast, opts);
    case "md":
      return emitMd(ast, opts);
  }
  throw new Error(`unreachable: emitForKind kind`);
}
function resolveFsPath(path, options) {
  const cwd = options.cwd ?? process.cwd();
  if (options.file !== void 0) return resolve(options.file);
  return resolve(cwd, path.file);
}
function formatMatchHuman(match) {
  if (match.kind === "leaf")
    return `leaf @ L${match.line}: ${JSON.stringify(match.valueText)} (${match.leafType})`;
  if (match.kind === "node") return `node @ L${match.line} [${match.descriptor}]`;
  if (match.kind === "insertion-point")
    return `insertion-point @ L${match.line} [${match.container}]`;
  return `root @ L${match.line}`;
}
async function pathResolveCommand(pathStr, options, runtime) {
  const mode = detectMode(options);
  if (pathStr === void 0) {
    emitError(runtime, mode, "resolve: missing <oc-path> argument");
    runtime.exit(2);
    return;
  }
  let ocPath;
  try {
    ocPath = parseOcPath(pathStr);
  } catch (err) {
    if (err instanceof OcPathError) {
      emitError(runtime, mode, `parse failed: ${err.message}`, err.code);
      runtime.exit(2);
      return;
    }
    throw err;
  }
  const ast = await loadAst(resolveFsPath(ocPath, options), ocPath.file);
  let match;
  try {
    match = resolveOcPath(ast, ocPath);
  } catch (err) {
    if (err instanceof OcPathError) {
      emitError(runtime, mode, `resolve refused: ${err.message}`, err.code);
      runtime.exit(2);
      return;
    }
    throw err;
  }
  if (match === null) {
    emit(
      runtime,
      mode,
      {
        resolved: false,
        ocPath: pathStr,
      },
      () => `not found: ${pathStr}`,
    );
    runtime.exit(1);
    return;
  }
  emit(
    runtime,
    mode,
    {
      resolved: true,
      ocPath: pathStr,
      match,
    },
    () => formatMatchHuman(match),
  );
}
async function pathSetCommand(pathStr, value, options, runtime) {
  const mode = detectMode(options);
  if (pathStr === void 0 || value === void 0) {
    emitError(runtime, mode, "set: requires <oc-path> <value>");
    runtime.exit(2);
    return;
  }
  let ocPath;
  try {
    ocPath = parseOcPath(pathStr);
  } catch (err) {
    if (err instanceof OcPathError) {
      emitError(runtime, mode, `parse failed: ${err.message}`, err.code);
      runtime.exit(2);
      return;
    }
    throw err;
  }
  const fsPath = resolveFsPath(ocPath, options);
  const ast = await loadAst(fsPath, ocPath.file);
  let result;
  try {
    result = setOcPath(ast, ocPath, value);
  } catch (err) {
    if (err instanceof OcEmitSentinelError) {
      emitError(runtime, mode, `set refused: ${err.message}`, "OC_EMIT_SENTINEL");
      runtime.exit(1);
      return;
    }
    throw err;
  }
  if (!result.ok) {
    const detail = "detail" in result ? result.detail : void 0;
    emit(
      runtime,
      mode,
      {
        ok: false,
        reason: result.reason,
        detail,
      },
      () => `set failed: ${result.reason}${detail !== void 0 ? ` — ${detail}` : ""}`,
    );
    runtime.exit(1);
    return;
  }
  let newBytes;
  try {
    newBytes = emitForKind(result.ast, ocPath.file);
  } catch (err) {
    if (err instanceof OcEmitSentinelError) {
      emitError(runtime, mode, `emit refused: ${err.message}`, "OC_EMIT_SENTINEL");
      runtime.exit(1);
      return;
    }
    throw err;
  }
  const formatLossWarning = new Set(["jsonc", "yaml"]).has(result.ast.kind)
    ? `note: ${result.ast.kind} edit-then-emit drops comments / original formatting (render mode)`
    : null;
  if (options.dryRun === true) {
    emit(
      runtime,
      mode,
      {
        ok: true,
        dryRun: true,
        bytes: newBytes,
        ...(formatLossWarning !== null ? { warning: formatLossWarning } : {}),
      },
      () => {
        const lines = [`--dry-run: would write ${newBytes.length} bytes to ${fsPath}`];
        if (formatLossWarning !== null) lines.push(formatLossWarning);
        lines.push(newBytes);
        return lines.join("\n");
      },
    );
    return;
  }
  await promises.writeFile(fsPath, newBytes, "utf-8");
  emit(
    runtime,
    mode,
    {
      ok: true,
      dryRun: false,
      bytesWritten: newBytes.length,
      fsPath,
      ...(formatLossWarning !== null ? { warning: formatLossWarning } : {}),
    },
    () => {
      const lines = [`wrote ${newBytes.length} bytes to ${fsPath}`];
      if (formatLossWarning !== null) lines.push(formatLossWarning);
      return lines.join("\n");
    },
  );
}
async function pathFindCommand(patternStr, options, runtime) {
  const mode = detectMode(options);
  if (patternStr === void 0) {
    emitError(runtime, mode, "find: missing <pattern> argument");
    runtime.exit(2);
    return;
  }
  let pattern;
  try {
    pattern = parseOcPath(patternStr);
  } catch (err) {
    if (err instanceof OcPathError) {
      emitError(runtime, mode, `parse failed: ${err.message}`, err.code);
      runtime.exit(2);
      return;
    }
    throw err;
  }
  if (/[*?]/.test(pattern.file)) {
    emitError(
      runtime,
      mode,
      `find: file-slot wildcards are not supported (got "${pattern.file}"). Pass a concrete file path; multi-file globbing is a follow-up feature.`,
      "OC_PATH_FILE_WILDCARD_UNSUPPORTED",
    );
    runtime.exit(2);
    return;
  }
  const matches = findOcPaths(
    await loadAst(resolveFsPath(pattern, options), pattern.file),
    pattern,
  );
  emit(
    runtime,
    mode,
    {
      pattern: patternStr,
      count: matches.length,
      matches: matches.map((m) => ({
        path: formatOcPath(m.path),
        match: m.match,
      })),
    },
    () => {
      if (matches.length === 0) return `0 matches for ${patternStr}`;
      const plural = matches.length === 1 ? "" : "es";
      const lines = [`${matches.length} match${plural} for ${patternStr}:`];
      for (const m of matches)
        lines.push(`  ${formatOcPath(m.path)}  →  ${formatMatchHuman(m.match)}`);
      return lines.join("\n");
    },
  );
  if (matches.length === 0) runtime.exit(1);
}
function pathValidateCommand(pathStr, options, runtime) {
  const mode = detectMode(options);
  if (pathStr === void 0) {
    emitError(runtime, mode, "validate: missing <oc-path> argument");
    runtime.exit(2);
    return;
  }
  try {
    const ocPath = parseOcPath(pathStr);
    emit(
      runtime,
      mode,
      {
        valid: true,
        ocPath: pathStr,
        formatted: formatOcPath(ocPath),
        structure: {
          file: ocPath.file,
          section: ocPath.section,
          item: ocPath.item,
          field: ocPath.field,
          session: ocPath.session,
        },
      },
      () => {
        const lines = [`valid: ${pathStr}`, `  file:    ${ocPath.file}`];
        if (ocPath.section !== void 0) lines.push(`  section: ${ocPath.section}`);
        if (ocPath.item !== void 0) lines.push(`  item:    ${ocPath.item}`);
        if (ocPath.field !== void 0) lines.push(`  field:   ${ocPath.field}`);
        if (ocPath.session !== void 0) lines.push(`  session: ${ocPath.session}`);
        return lines.join("\n");
      },
    );
    return;
  } catch (err) {
    if (err instanceof OcPathError) {
      emit(
        runtime,
        mode,
        {
          valid: false,
          code: err.code,
          message: err.message,
        },
        () => `INVALID: ${err.code}: ${err.message}`,
      );
      runtime.exit(1);
      return;
    }
    throw err;
  }
}
async function pathEmitCommand(fileArg, options, runtime) {
  const mode = detectMode(options);
  if (fileArg === void 0) {
    emitError(runtime, mode, "emit: missing <file> argument");
    runtime.exit(2);
    return;
  }
  const fsPath =
    options.file !== void 0
      ? resolve(options.file)
      : resolve(options.cwd ?? process.cwd(), fileArg);
  const fileName = fsPath.split(/[\\/]/).pop() ?? fileArg;
  const ast = await loadAst(fsPath, fileName);
  let bytes;
  try {
    bytes = emitForKind(ast, fileName);
  } catch (err) {
    if (err instanceof OcEmitSentinelError) {
      emitError(runtime, mode, `emit refused: ${err.message}`, "OC_EMIT_SENTINEL");
      runtime.exit(1);
      return;
    }
    throw err;
  }
  if (mode === "json") {
    runtime.writeStdout(
      JSON.stringify({
        ok: true,
        kind: ast.kind,
        bytes,
      }),
    );
    return;
  }
  runtime.writeStdout(bytes);
}
//#endregion
//#region src/cli/path-cli.ts
function normalize(opts) {
  return {
    json: opts.json,
    human: opts.human,
    cwd: opts.cwd,
    file: opts.file,
    dryRun: opts.dryRun,
  };
}
function registerPathCli(program) {
  const path = program
    .command("path")
    .description("Inspect and edit workspace files via the oc:// addressing scheme")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/path", "docs.openclaw.ai/cli/path")}\n`,
    );
  path
    .command("resolve")
    .description("Print the match at an oc:// path")
    .argument("<oc-path>", "oc:// path to resolve")
    .option("--json", "Force JSON output")
    .option("--human", "Force human output")
    .option("--cwd <dir>", "Resolve file slot against this directory")
    .option("--file <file>", "Override the file slot's resolved path (absolute access)")
    .action(async (pathStr, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await pathResolveCommand(pathStr, normalize(opts), defaultRuntime);
      });
    });
  path
    .command("find")
    .description("Enumerate matches for a wildcard / predicate oc:// pattern")
    .argument("<pattern>", "oc:// pattern (supports * and **)")
    .option("--json", "Force JSON output")
    .option("--human", "Force human output")
    .option("--cwd <dir>", "Resolve file slot against this directory")
    .option("--file <file>", "Override the file slot's resolved path (absolute access)")
    .action(async (patternStr, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await pathFindCommand(patternStr, normalize(opts), defaultRuntime);
      });
    });
  path
    .command("set")
    .description("Write a leaf value at an oc:// path")
    .argument("<oc-path>", "oc:// path to write")
    .argument("<value>", "string value to write")
    .option("--dry-run", "Print bytes without writing")
    .option("--json", "Force JSON output")
    .option("--human", "Force human output")
    .option("--cwd <dir>", "Resolve file slot against this directory")
    .option("--file <file>", "Override the file slot's resolved path (absolute access)")
    .action(async (pathStr, value, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await pathSetCommand(pathStr, value, normalize(opts), defaultRuntime);
      });
    });
  path
    .command("validate")
    .description("Parse an oc:// path and print its slot structure")
    .argument("<oc-path>", "oc:// path to validate")
    .option("--json", "Force JSON output")
    .option("--human", "Force human output")
    .action((pathStr, opts) => {
      pathValidateCommand(pathStr, normalize(opts), defaultRuntime);
    });
  path
    .command("emit")
    .description("Round-trip a file through parseXxx + emitXxx (byte-fidelity diagnostic)")
    .argument("<file>", "Path to a workspace file (md / jsonc / jsonl / yaml)")
    .option("--cwd <dir>", "Resolve <file> against this directory (default: process.cwd())")
    .option("--file <file>", "Override the file's resolved path (absolute access)")
    .option("--json", "Force JSON output")
    .option("--human", "Force human output")
    .action(async (fileArg, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await pathEmitCommand(fileArg, normalize(opts), defaultRuntime);
      });
    });
  applyParentDefaultHelpAction(path);
}
//#endregion
export { registerPathCli };
