import fs from "node:fs";
import { p as recomputeNextRuns } from "./jobs-SDHRSbuQ.js";
import { n as normalizeCronJobInput } from "./normalize-B47pyy0b.js";
import {
  a as cronSchedulingInputsEqual,
  i as saveCronStore,
  t as loadCronStore,
} from "./store-CuwH2dda.js";
import { c as normalizeOptionalString } from "./string-coerce-BdEutqX5.js";
import { r as isInvalidCronSessionTargetIdError } from "./webhook-url-CmRMvdiM.js";
//#region src/cron/normalize-job-identity.ts
function normalizeCronJobIdentityFields(raw) {
  const rawId = normalizeOptionalString(raw.id) ?? "";
  const legacyJobId = normalizeOptionalString(raw.jobId) ?? "";
  const hadJobIdKey = "jobId" in raw;
  const normalizedId = rawId || legacyJobId;
  const idChanged = Boolean(normalizedId && raw.id !== normalizedId);
  if (idChanged) raw.id = normalizedId;
  if (hadJobIdKey) delete raw.jobId;
  return {
    mutated: idChanged || hadJobIdKey,
    legacyJobIdIssue: hadJobIdKey,
  };
}
//#endregion
//#region src/cron/service/store.ts
function invalidateStaleNextRunOnScheduleChange(params) {
  const previousJob = params.previousJobsById.get(params.hydrated.id);
  if (!previousJob || cronSchedulingInputsEqual(previousJob, params.hydrated)) return;
  params.hydrated.state ??= {};
  params.hydrated.state.nextRunAtMs = void 0;
}
async function getFileMtimeMs(path) {
  try {
    return (await fs.promises.stat(path)).mtimeMs;
  } catch {
    return null;
  }
}
async function ensureLoaded(state, opts) {
  if (state.store && !opts?.forceReload) return;
  const previousJobsById = /* @__PURE__ */ new Map();
  for (const job of state.store?.jobs ?? []) previousJobsById.set(job.id, job);
  const fileMtimeMs = await getFileMtimeMs(state.deps.storePath);
  const jobs = (await loadCronStore(state.deps.storePath)).jobs ?? [];
  for (const [index, job] of jobs.entries()) {
    const raw = job;
    const { legacyJobIdIssue } = normalizeCronJobIdentityFields(raw);
    let normalized;
    try {
      normalized = normalizeCronJobInput(raw);
    } catch (error) {
      if (!isInvalidCronSessionTargetIdError(error)) throw error;
      normalized = null;
      state.deps.log.warn(
        {
          storePath: state.deps.storePath,
          jobId: typeof raw.id === "string" ? raw.id : void 0,
        },
        "cron: job has invalid persisted sessionTarget; run openclaw doctor --fix to repair",
      );
    }
    const hydrated = normalized && typeof normalized === "object" ? normalized : job;
    jobs[index] = hydrated;
    if (legacyJobIdIssue) {
      const resolvedId = typeof hydrated.id === "string" ? hydrated.id : void 0;
      state.deps.log.warn(
        {
          storePath: state.deps.storePath,
          jobId: resolvedId,
        },
        "cron: job used legacy jobId field; normalized id in memory (run openclaw doctor --fix to persist canonical shape)",
      );
    }
    if (typeof hydrated.enabled !== "boolean") hydrated.enabled = true;
    invalidateStaleNextRunOnScheduleChange({
      previousJobsById,
      hydrated,
    });
    if (typeof hydrated.sessionTarget !== "string") {
      const payload = hydrated.payload;
      const payloadKind =
        payload &&
        typeof payload === "object" &&
        !Array.isArray(payload) &&
        Object.hasOwn(payload, "kind")
          ? payload.kind
          : void 0;
      let defaulted;
      if (payloadKind === "systemEvent") defaulted = "main";
      else if (payloadKind === "agentTurn") defaulted = "isolated";
      if (defaulted) {
        hydrated.sessionTarget = defaulted;
        const jobId = typeof hydrated.id === "string" ? hydrated.id : void 0;
        const dedupeKey = jobId ?? "<unknown>";
        if (!state.warnedMissingSessionTargetJobIds.has(dedupeKey)) {
          state.warnedMissingSessionTargetJobIds.add(dedupeKey);
          state.deps.log.warn(
            {
              storePath: state.deps.storePath,
              jobId,
              defaulted,
            },
            "cron: job missing sessionTarget; defaulted in memory (edit jobs.json to persist canonical shape)",
          );
        }
      }
    }
  }
  state.store = {
    version: 1,
    jobs,
  };
  state.storeLoadedAtMs = state.deps.nowMs();
  state.storeFileMtimeMs = fileMtimeMs;
  if (!opts?.skipRecompute) recomputeNextRuns(state);
}
function warnIfDisabled(state, action) {
  if (state.deps.cronEnabled) return;
  if (state.warnedDisabled) return;
  state.warnedDisabled = true;
  state.deps.log.warn(
    {
      enabled: false,
      action,
      storePath: state.deps.storePath,
    },
    "cron: scheduler disabled; jobs will not run automatically",
  );
}
async function persist(state, opts) {
  if (!state.store) return;
  try {
    state.fileWatcher?.suppressFor(200);
  } catch {}
  await saveCronStore(state.deps.storePath, state.store, opts);
  state.storeFileMtimeMs = await getFileMtimeMs(state.deps.storePath);
}
//#endregion
export { persist as n, warnIfDisabled as r, ensureLoaded as t };
