#!/usr/bin/env node
// cache-telemetry-audit.mjs — Phase A measurement-integrity harness.
//
// PURPOSE: produce a *trustworthy* cache hit-rate from the session-usage JSONL
// logs, by (1) de-duplicating double-logged rows, (2) detecting the
// "cross-model fabricated constant" defect (a non-zero cacheRead value shared
// by >=2 provider families — impossible for genuine per-provider reads because
// each provider tokenizes differently), (3) QUARANTINING contaminated rows from
// the headline instead of nuking the entire number, and (4) computing the
// hit-rate with the correct denominator cacheRead/(cacheRead+input). This is
// telemetry-only analysis — it changes no production code/flags.
//
// HISTORY: an earlier version had three math bugs that produced false
// "untrustworthy" verdicts: it required EVERY non-zero read to be identical
// (missed the frozen-mode leak where one value repeats 75x while others appear
// once), it flagged `cacheRead > lastCallInput` as impossible (legitimate on a
// high-hit call — cacheRead can exceed the freshly-billed input), and it used
// `cacheRead/input` for the hit-rate (overstates by the cached fraction). All
// three are fixed below.
//
// USAGE:
//   node scripts/cache-telemetry-audit.mjs [--dir /tmp/openclaw] [--hours 12] [--now ISO] [--json]
//
// Exit code 2 if the data is untrustworthy (constant detected or impossible rows),
// so this can gate a "is our cache metric real yet?" check in CI.

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
function opt(name, def) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : def;
}
const DIR = opt("--dir", "/tmp/openclaw");
const HOURS = Number(opt("--hours", "12"));
const NOW = opt("--now", null) ? new Date(opt("--now", null)) : new Date();
const AS_JSON = args.includes("--json");
const CUTOFF = new Date(NOW.getTime() - HOURS * 3600 * 1000);

function parseTs(r) {
  const t = r.ts || r.generatedAt;
  return t ? new Date(t) : null;
}

// Map a model ref to a provider family. Genuine per-provider cacheRead values
// cannot collide across families because each family tokenizes differently, so
// any nonzero value shared by >=2 families is a carry-forward fabrication.
function providerFamily(model) {
  const m = String(model || "").toLowerCase();
  if (m.includes("anthropic") || m.includes("claude")) {
    return "anthropic";
  }
  if (m.includes("gemini") || m.includes("google")) {
    return "google";
  }
  if (m.includes("gpt") || m.includes("openai") || m.includes("o1") || m.includes("o3")) {
    return "openai";
  }
  if (m.includes("grok") || m.includes("x-ai")) {
    return "xai";
  }
  if (m.includes("minimax")) {
    return "minimax";
  }
  if (m.includes("deepseek")) {
    return "deepseek";
  }
  if (m.includes("qwen")) {
    return "qwen";
  }
  if (m.includes("llama")) {
    return "meta";
  }
  return m || "(unknown)";
}

// promptTokens for a row, preferring the logged value, else reconstructing it
// from the fresh-billed input + the cached read (which together equal the full
// prompt the provider saw).
function promptTokensOf(r) {
  if (typeof r.promptTokens === "number" && r.promptTokens > 0) {
    return r.promptTokens;
  }
  return (r.lastCallInput || 0) + (r.cacheRead || 0);
}

// Collect cache-bearing rows from all token-usage-*.jsonl files in window.
const files = fs
  .readdirSync(DIR)
  .filter((f) => /^token-usage-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
  .map((f) => path.join(DIR, f));

const rows = [];
for (const fp of files) {
  for (const line of fs.readFileSync(fp, "utf8").split("\n")) {
    const s = line.trim();
    if (!s) {
      continue;
    }
    let d;
    try {
      d = JSON.parse(s);
    } catch {
      continue;
    }
    if (!("cacheRead" in d)) {
      continue;
    } // only session-usage rows carry cache fields
    const t = parseTs(d);
    if (!t || t < CUTOFF || t > NOW) {
      continue;
    }
    rows.push(d);
  }
}

// --- Integrity check 1: cross-model fabricated-constant detector ------------
// A nonzero cacheRead value reported for >=2 distinct provider families is
// fabricated: different tokenizers cannot yield an identical integer read.
// Quarantine every row carrying such a value (regardless of which family).
const familiesByValue = new Map(); // cacheRead -> Set<family>
const countByValue = new Map(); // cacheRead -> occurrences
for (const r of rows) {
  const v = r.cacheRead || 0;
  if (v <= 0) {
    continue;
  }
  if (!familiesByValue.has(v)) {
    familiesByValue.set(v, new Set());
  }
  familiesByValue.get(v).add(providerFamily(r.model));
  countByValue.set(v, (countByValue.get(v) || 0) + 1);
}
const contaminatedValues = [...familiesByValue.entries()]
  .filter(([, fams]) => fams.size >= 2)
  .map(([v, fams]) => ({
    value: v,
    families: [...fams].toSorted((a, b) => a.localeCompare(b)),
    rows: countByValue.get(v),
  }))
  .toSorted((a, b) => b.rows - a.rows);
const contaminatedSet = new Set(contaminatedValues.map((c) => c.value));
const isContaminated = (r) => contaminatedSet.has(r.cacheRead || 0);
const constantDefect = contaminatedValues.length > 0;

// --- Integrity check 2: impossible rows (cacheRead > full prompt) -----------
// cacheRead may legitimately exceed *this call's* freshly-billed input on a
// high-hit call; it is only impossible when it exceeds the FULL prompt.
const impossible = rows.filter((r) => (r.cacheRead || 0) > promptTokensOf(r));

// --- Integrity check 3: de-dup double-logged rows ---------------------------
// A row is a duplicate if (sessionId, ts) repeats, or (sessionKey, lastCallInput,
// lastCallOutput, cacheRead) collide within the window.
const seen = new Set();
const deduped = [];
for (const r of rows) {
  const k = `${r.sessionId || r.sessionKey}|${r.ts}|${r.lastCallInput}|${r.lastCallOutput}`;
  if (seen.has(k)) {
    continue;
  }
  seen.add(k);
  deduped.push(r);
}

// Hit-rate = cacheRead / (cacheRead + freshly-billed input) = cacheRead / prompt.
function rate(rs) {
  const cr = rs.reduce((a, r) => a + (r.cacheRead || 0), 0);
  const inp = rs.reduce((a, r) => a + (r.lastCallInput || 0), 0);
  const denom = cr + inp;
  return { cr, inp, pct: denom ? (cr / denom) * 100 : 0 };
}

// Clean rows = de-duped minus cross-model-contaminated rows. The headline is
// computed on clean rows so one leaky value can't poison the whole metric.
const clean = deduped.filter((r) => !isContaminated(r));
const asLogged = rate(rows);
const dd = rate(deduped);
const cleanRate = rate(clean);

// Per-model breakdown (clean rows only — excludes contaminated carry-forward)
const byModel = {};
for (const r of clean) {
  const m = r.model || "(unknown)";
  byModel[m] ||= { n: 0, cr: 0, inp: 0, vals: new Set() };
  byModel[m].n++;
  byModel[m].cr += r.cacheRead || 0;
  byModel[m].inp += r.lastCallInput || 0;
  byModel[m].vals.add(r.cacheRead || 0);
}

// The headline is trustworthy once contaminated rows are quarantined and no
// genuinely-impossible rows remain among the clean set.
const cleanImpossible = clean.filter((r) => (r.cacheRead || 0) > promptTokensOf(r));
const trustworthy = cleanImpossible.length === 0;

const report = {
  window: { hours: HOURS, from: CUTOFF.toISOString(), to: NOW.toISOString() },
  rows: {
    cacheBearing: rows.length,
    afterDedup: deduped.length,
    dropped: rows.length - deduped.length,
    clean: clean.length,
    quarantined: deduped.length - clean.length,
  },
  integrity: {
    trustworthy,
    constantDefect,
    crossModelFabrication: contaminatedValues,
    impossibleRows: impossible.length,
    impossibleRowsAfterQuarantine: cleanImpossible.length,
  },
  hitRate: {
    asLogged: { pct: +asLogged.pct.toFixed(1), cacheRead: asLogged.cr, input: asLogged.inp },
    deduped: { pct: +dd.pct.toFixed(1), cacheRead: dd.cr, input: dd.inp },
    clean: { pct: +cleanRate.pct.toFixed(1), cacheRead: cleanRate.cr, input: cleanRate.inp },
    headline: trustworthy ? +cleanRate.pct.toFixed(1) : null,
  },
  perModel: Object.fromEntries(
    Object.entries(byModel)
      .toSorted((a, b) => b[1].n - a[1].n)
      .map(([m, b]) => [
        m,
        {
          calls: b.n,
          cacheRead: b.cr,
          input: b.inp,
          pct: b.cr + b.inp ? +((b.cr / (b.cr + b.inp)) * 100).toFixed(1) : 0,
          distinctReadValues: [...b.vals].toSorted((x, y) => x - y),
        },
      ]),
  ),
};

if (AS_JSON) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const r = report;
  console.log(`=== Cache Telemetry Audit — last ${r.window.hours}h ===`);
  console.log(`window: ${r.window.from} -> ${r.window.to}`);
  console.log(
    `rows: ${r.rows.cacheBearing} cache-bearing, ${r.rows.afterDedup} after de-dup (${r.rows.dropped} dropped), ${r.rows.clean} clean (${r.rows.quarantined} quarantined as cross-model-contaminated)\n`,
  );
  console.log(
    `INTEGRITY: ${r.integrity.trustworthy ? "OK (headline computed on clean rows)" : "FAILED — impossible rows remain after quarantine"}`,
  );
  if (r.integrity.constantDefect) {
    for (const c of r.integrity.crossModelFabrication) {
      console.log(
        `  ⚠ cross-model fabricated value ${c.value} reported by ${c.families.length} families [${c.families.join(",")}] across ${c.rows} rows — quarantined`,
      );
    }
  }
  if (r.integrity.impossibleRowsAfterQuarantine) {
    console.log(
      `  ⚠ ${r.integrity.impossibleRowsAfterQuarantine} impossible rows remain (cacheRead > full prompt) even after quarantine`,
    );
  }
  console.log();
  console.log(
    `HIT-RATE (as-logged):  ${r.hitRate.asLogged.pct}%  (${r.hitRate.asLogged.cacheRead}/${r.hitRate.asLogged.input} cacheRead/input)`,
  );
  console.log(
    `HIT-RATE (de-duped):   ${r.hitRate.deduped.pct}%  (${r.hitRate.deduped.cacheRead}/${r.hitRate.deduped.input})`,
  );
  console.log(
    `HIT-RATE (clean):      ${r.hitRate.clean.pct}%  (${r.hitRate.clean.cacheRead}/${r.hitRate.clean.input})`,
  );
  console.log(
    `HEADLINE: ${r.hitRate.headline === null ? "UNKNOWN (impossible rows remain)" : r.hitRate.headline + "%  (cacheRead / (cacheRead+input), clean rows)"}\n`,
  );
  console.log("PER-MODEL (de-duped):");
  for (const [m, b] of Object.entries(r.perModel)) {
    console.log(
      `  ${m.padEnd(36)} calls=${String(b.calls).padStart(3)}  read=${String(b.cacheRead).padStart(9)}  in=${String(b.input).padStart(9)}  ${b.pct}%  vals=[${b.distinctReadValues.join(",")}]`,
    );
  }
}

process.exit(trustworthy ? 0 : 2);
