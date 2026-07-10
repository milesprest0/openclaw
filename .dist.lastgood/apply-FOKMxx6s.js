import fs from "node:fs/promises";
import path from "node:path";
import { t as backupCreateCommand } from "./backup-DWlOKtXX.js";
import { n as buildMigrationReportDir, t as buildMigrationContext } from "./context-Bkzpiuun.js";
import {
  d as markMigrationItemSkipped,
  v as summarizeMigrationItems,
} from "./migration-DAySQSKv.js";
import {
  i as writeApplyResult,
  n as assertConflictFreePlan,
  t as assertApplySucceeded,
} from "./output-C1i7i6K-.js";
import { v as resolveStateDir } from "./paths-Cnwfh6dH.js";
//#region src/commands/migrate/selection.ts
const MIGRATION_SKILL_NOT_SELECTED_REASON = "not selected for migration";
const MIGRATION_PLUGIN_NOT_SELECTED_REASON = "not selected for migration";
const MIGRATION_SKILL_SELECTION_TOGGLE_ALL_ON = "__openclaw_migrate_toggle_all_on__";
const MIGRATION_SKILL_SELECTION_TOGGLE_ALL_OFF = "__openclaw_migrate_toggle_all_off__";
const MIGRATION_SKILL_SELECTION_SKIP = "__openclaw_migrate_skip_for_now__";
function normalizeSelectionRef(value) {
  return value.trim().toLowerCase();
}
function readMigrationSkillName(item) {
  const value = item.details?.skillName;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : void 0;
}
function readMigrationSkillSourceLabel(item) {
  const value = item.details?.sourceLabel;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : void 0;
}
function readMigrationPluginName(item) {
  const value = item.details?.pluginName;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : void 0;
}
function readMigrationPluginConfigKey(item) {
  const value = item.details?.configKey;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : void 0;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function migrationSkillRefs(item) {
  const skillName = readMigrationSkillName(item);
  const idSuffix = item.id.startsWith("skill:") ? item.id.slice(6) : void 0;
  const sourceBase = item.source ? path.basename(item.source) : void 0;
  const targetBase = item.target ? path.basename(item.target) : void 0;
  return [item.id, idSuffix, skillName, sourceBase, targetBase].filter(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
}
function migrationPluginRefs(item) {
  const pluginName = readMigrationPluginName(item);
  const configKey = readMigrationPluginConfigKey(item);
  const idSuffix = item.id.startsWith("plugin:") ? item.id.slice(7) : void 0;
  const sourceBase = item.source ? path.basename(item.source) : void 0;
  const targetBase = item.target ? path.basename(item.target) : void 0;
  return [item.id, idSuffix, pluginName, configKey, sourceBase, targetBase].filter(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
}
function formatSelectionRefList(values) {
  if (values.length === 0) return "none";
  return values.map((value) => `"${value}"`).join(", ");
}
function buildSkillSelectionIndex(items) {
  const index = /* @__PURE__ */ new Map();
  for (const item of items)
    for (const ref of migrationSkillRefs(item)) {
      const normalized = normalizeSelectionRef(ref);
      if (!normalized) continue;
      const existing = index.get(normalized) ?? /* @__PURE__ */ new Set();
      existing.add(item.id);
      index.set(normalized, existing);
    }
  return index;
}
function buildPluginSelectionIndex(items) {
  const index = /* @__PURE__ */ new Map();
  for (const item of items)
    for (const ref of migrationPluginRefs(item)) {
      const normalized = normalizeSelectionRef(ref);
      if (!normalized) continue;
      const existing = index.get(normalized) ?? /* @__PURE__ */ new Set();
      existing.add(item.id);
      index.set(normalized, existing);
    }
  return index;
}
function resolveSelectedSkillItemIds(items, selectedRefs) {
  const index = buildSkillSelectionIndex(items);
  const selectedIds = /* @__PURE__ */ new Set();
  const unknownRefs = [];
  const ambiguousRefs = [];
  for (const ref of selectedRefs) {
    const normalized = normalizeSelectionRef(ref);
    if (!normalized) continue;
    const matches = index.get(normalized);
    if (!matches) {
      unknownRefs.push(ref);
      continue;
    }
    if (matches.size > 1) {
      ambiguousRefs.push(ref);
      continue;
    }
    const [id] = matches;
    if (id) selectedIds.add(id);
  }
  if (unknownRefs.length > 0 || ambiguousRefs.length > 0) {
    const available = items
      .map(formatMigrationSkillSelectionLabel)
      .toSorted((a, b) => a.localeCompare(b));
    const parts = [];
    if (unknownRefs.length > 0)
      parts.push(`No migratable skill matched ${formatSelectionRefList(unknownRefs)}.`);
    if (ambiguousRefs.length > 0)
      parts.push(`Skill selection ${formatSelectionRefList(ambiguousRefs)} was ambiguous.`);
    parts.push(`Available skills: ${available.length > 0 ? available.join(", ") : "none"}.`);
    throw new Error(parts.join(" "));
  }
  return selectedIds;
}
function resolveSelectedPluginItemIds(items, selectedRefs) {
  const index = buildPluginSelectionIndex(items);
  const selectedIds = /* @__PURE__ */ new Set();
  const unknownRefs = [];
  const ambiguousRefs = [];
  for (const ref of selectedRefs) {
    const normalized = normalizeSelectionRef(ref);
    if (!normalized) continue;
    const matches = index.get(normalized);
    if (!matches) {
      unknownRefs.push(ref);
      continue;
    }
    if (matches.size > 1) {
      ambiguousRefs.push(ref);
      continue;
    }
    const [id] = matches;
    if (id) selectedIds.add(id);
  }
  if (unknownRefs.length > 0 || ambiguousRefs.length > 0) {
    const available = items
      .map(formatMigrationPluginSelectionLabel)
      .toSorted((a, b) => a.localeCompare(b));
    const parts = [];
    if (unknownRefs.length > 0)
      parts.push(`No migratable plugin matched ${formatSelectionRefList(unknownRefs)}.`);
    if (ambiguousRefs.length > 0)
      parts.push(`Plugin selection ${formatSelectionRefList(ambiguousRefs)} was ambiguous.`);
    parts.push(`Available plugins: ${available.length > 0 ? available.join(", ") : "none"}.`);
    throw new Error(parts.join(" "));
  }
  return selectedIds;
}
function getSelectableMigrationSkillItems(plan) {
  return plan.items.filter(
    (item) =>
      item.kind === "skill" &&
      item.action === "copy" &&
      (item.status === "planned" || item.status === "conflict"),
  );
}
function getSelectableMigrationPluginItems(plan) {
  return plan.items.filter(
    (item) => item.kind === "plugin" && item.action === "install" && item.status === "planned",
  );
}
function getMigrationSkillSelectionValue(item) {
  return item.id;
}
function formatMigrationPluginSelectionLabel(item) {
  return readMigrationPluginName(item) ?? item.id.replace(/^plugin:/u, "");
}
function getDefaultMigrationSkillSelectionValues(items) {
  return items.filter((item) => item.status === "planned").map(getMigrationSkillSelectionValue);
}
function formatMigrationSkillSelectionLabel(item) {
  return readMigrationSkillName(item) ?? item.id.replace(/^skill:/u, "");
}
function formatMigrationSkillSelectionHint(item) {
  const parts = [readMigrationSkillSourceLabel(item)];
  if (item.status === "conflict") parts.push(item.reason ? `conflict: ${item.reason}` : "conflict");
  return (
    parts.filter((value) => typeof value === "string" && value.length > 0).join("; ") || void 0
  );
}
function applyMigrationSelectedSkillItemIds(plan, selectedItemIds) {
  const selectableIds = new Set(getSelectableMigrationSkillItems(plan).map((item) => item.id));
  const items = plan.items.map((item) => {
    if (!selectableIds.has(item.id) || selectedItemIds.has(item.id)) return item;
    return markMigrationItemSkipped(item, MIGRATION_SKILL_NOT_SELECTED_REASON);
  });
  return {
    ...plan,
    items,
    summary: summarizeMigrationItems(items),
  };
}
function applyMigrationSkillSelection(plan, selectedSkillRefs) {
  if (selectedSkillRefs === void 0) return plan;
  return applyMigrationSelectedSkillItemIds(
    plan,
    resolveSelectedSkillItemIds(getSelectableMigrationSkillItems(plan), selectedSkillRefs),
  );
}
function applyMigrationPluginSelection(plan, selectedPluginRefs) {
  if (selectedPluginRefs === void 0) return plan;
  const selectable = getSelectableMigrationPluginItems(plan);
  const selectedIds = resolveSelectedPluginItemIds(selectable, selectedPluginRefs);
  const selectableIds = new Set(selectable.map((item) => item.id));
  const selectedConfigKeys = new Set(
    selectable
      .filter((item) => selectedIds.has(item.id))
      .map(readMigrationPluginConfigKey)
      .filter((value) => value !== void 0),
  );
  const items = plan.items.map((item) => {
    if (isCodexPluginConfigItem(item))
      return applyCodexPluginConfigSelection(item, selectedConfigKeys);
    if (!selectableIds.has(item.id) || selectedIds.has(item.id)) return item;
    return markMigrationItemSkipped(item, MIGRATION_PLUGIN_NOT_SELECTED_REASON);
  });
  return {
    ...plan,
    items,
    summary: summarizeMigrationItems(items),
  };
}
function isCodexPluginConfigItem(item) {
  if (item.kind !== "config" || item.action !== "merge") return false;
  const value = item.details?.value;
  if (!isRecord(value)) return false;
  const config = value.config;
  if (!isRecord(config)) return false;
  const codexPlugins = config.codexPlugins;
  if (!isRecord(codexPlugins)) return false;
  return isRecord(codexPlugins.plugins);
}
function applyCodexPluginConfigSelection(item, selectedConfigKeys) {
  const value = item.details?.value;
  if (!isRecord(value)) return item;
  const config = value.config;
  if (!isRecord(config)) return item;
  const codexPlugins = config.codexPlugins;
  if (!isRecord(codexPlugins) || !isRecord(codexPlugins.plugins)) return item;
  const plugins = Object.fromEntries(
    Object.entries(codexPlugins.plugins).filter(([configKey]) => selectedConfigKeys.has(configKey)),
  );
  if (Object.keys(plugins).length === 0)
    return markMigrationItemSkipped(item, MIGRATION_PLUGIN_NOT_SELECTED_REASON);
  return {
    ...item,
    details: {
      ...item.details,
      value: {
        ...value,
        config: {
          ...config,
          codexPlugins: {
            ...codexPlugins,
            plugins,
          },
        },
      },
    },
  };
}
function resolveInteractiveMigrationSkillSelection(items, selectedValues) {
  const selectableIds = new Set(items.map(getMigrationSkillSelectionValue));
  const selectedItemIds = new Set(selectedValues.filter((value) => selectableIds.has(value)));
  if (selectedItemIds.size > 0)
    return {
      action: "select",
      selectedItemIds,
    };
  const selectedValueSet = new Set(selectedValues);
  if (selectedValueSet.has("__openclaw_migrate_skip_for_now__")) return { action: "skip" };
  if (selectedValueSet.has("__openclaw_migrate_toggle_all_off__"))
    return {
      action: "select",
      selectedItemIds: /* @__PURE__ */ new Set(),
    };
  if (selectedValueSet.has("__openclaw_migrate_toggle_all_on__"))
    return {
      action: "select",
      selectedItemIds: selectableIds,
    };
  return {
    action: "select",
    selectedItemIds,
  };
}
function reconcileInteractiveMigrationSkillToggleValues(
  selectedValues,
  activatedValue,
  selectableValues,
) {
  if (activatedValue === "__openclaw_migrate_skip_for_now__")
    return selectedValues.includes("__openclaw_migrate_skip_for_now__")
      ? [MIGRATION_SKILL_SELECTION_SKIP]
      : [];
  if (activatedValue === "__openclaw_migrate_toggle_all_on__")
    return [MIGRATION_SKILL_SELECTION_TOGGLE_ALL_ON, ...selectableValues];
  if (activatedValue === "__openclaw_migrate_toggle_all_off__")
    return [MIGRATION_SKILL_SELECTION_TOGGLE_ALL_OFF];
  if (activatedValue !== void 0 && selectableValues.includes(activatedValue))
    return selectedValues.filter(
      (value) =>
        value !== "__openclaw_migrate_toggle_all_on__" &&
        value !== "__openclaw_migrate_toggle_all_off__" &&
        value !== "__openclaw_migrate_skip_for_now__",
    );
  return selectedValues.filter(
    (value) =>
      value !== "__openclaw_migrate_toggle_all_on__" ||
      !selectedValues.includes("__openclaw_migrate_toggle_all_off__"),
  );
}
function reconcileInteractiveMigrationShortcutValues(
  previousValues,
  selectedValues,
  selectableValues,
  key,
) {
  const previousSelectable = previousValues.filter((value) => selectableValues.includes(value));
  if (
    key === "a" &&
    !previousValues.includes("__openclaw_migrate_skip_for_now__") &&
    previousSelectable.length === selectableValues.length
  )
    return [MIGRATION_SKILL_SELECTION_TOGGLE_ALL_OFF];
  const selectedSelectable = selectedValues.filter((value) => selectableValues.includes(value));
  if (selectedSelectable.length === selectableValues.length)
    return [MIGRATION_SKILL_SELECTION_TOGGLE_ALL_ON, ...selectableValues];
  if (selectedSelectable.length === 0) return [MIGRATION_SKILL_SELECTION_TOGGLE_ALL_OFF];
  return selectedSelectable;
}
//#endregion
//#region src/commands/migrate/apply.ts
function shouldTreatMissingBackupAsEmptyState(error) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("No local OpenClaw state was found to back up") ||
    message.includes("No OpenClaw config file was found to back up")
  );
}
async function createPreMigrationBackup(opts) {
  try {
    return (
      await backupCreateCommand(
        {
          log() {},
          error() {},
          exit(code) {
            throw new Error(`backup exited with ${code}`);
          },
        },
        {
          output: opts.output,
          verify: true,
        },
      )
    ).archivePath;
  } catch (err) {
    if (shouldTreatMissingBackupAsEmptyState(err)) return;
    throw err;
  }
}
async function runMigrationApply(params) {
  const selectedPlan = applyMigrationPluginSelection(
    applyMigrationSkillSelection(
      params.opts.preflightPlan ??
        (await params.provider.plan(
          buildMigrationContext({
            source: params.opts.source,
            includeSecrets: params.opts.includeSecrets,
            overwrite: params.opts.overwrite,
            runtime: params.runtime,
            json: params.opts.json,
          }),
        )),
      params.opts.skills,
    ),
    params.opts.plugins,
  );
  assertConflictFreePlan(selectedPlan, params.providerId);
  const stateDir = resolveStateDir();
  const reportDir = buildMigrationReportDir(params.providerId, stateDir);
  const backupPath = params.opts.noBackup
    ? void 0
    : await createPreMigrationBackup({ output: params.opts.backupOutput });
  await fs.mkdir(reportDir, { recursive: true });
  const ctx = buildMigrationContext({
    source: params.opts.source,
    includeSecrets: params.opts.includeSecrets,
    overwrite: params.opts.overwrite,
    runtime: params.runtime,
    backupPath,
    reportDir,
    json: params.opts.json,
  });
  const result = await params.provider.apply(ctx, selectedPlan);
  const withBackup = {
    ...result,
    backupPath: result.backupPath ?? backupPath,
    reportDir: result.reportDir ?? reportDir,
  };
  writeApplyResult(params.runtime, params.opts, withBackup);
  assertApplySucceeded(withBackup);
  return withBackup;
}
//#endregion
export {
  MIGRATION_SKILL_SELECTION_TOGGLE_ALL_ON as a,
  applyMigrationSkillSelection as c,
  getDefaultMigrationSkillSelectionValues as d,
  getMigrationSkillSelectionValue as f,
  resolveInteractiveMigrationSkillSelection as g,
  reconcileInteractiveMigrationSkillToggleValues as h,
  MIGRATION_SKILL_SELECTION_TOGGLE_ALL_OFF as i,
  formatMigrationSkillSelectionHint as l,
  reconcileInteractiveMigrationShortcutValues as m,
  runMigrationApply as n,
  applyMigrationPluginSelection as o,
  getSelectableMigrationSkillItems as p,
  MIGRATION_SKILL_SELECTION_SKIP as r,
  applyMigrationSelectedSkillItemIds as s,
  createPreMigrationBackup as t,
  formatMigrationSkillSelectionLabel as u,
};
