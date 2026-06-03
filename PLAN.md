# PLAN — Durable inbound uploads across a failed/timed-out turn

Branch: `fix/upload-persistence-on-failed-turn-20260603`
Worktree: `/home/miles/projects/wt-upload-persist`
Base: `main` @ e88713ea2d

## Incident

Fernando legal VM: user uploaded 12 fax PDFs; the turn failed (upstream timeout). The
uploaded originals had been saved into a transient dir that got swept, and were lost.
User had to re-upload. On a legal VM, a failed/timed-out turn must NEVER destroy the
user's uploaded documents.

## OWNERSHIP INVESTIGATION (honest result)

There are **two distinct attachment-persistence paths** in play. They are owned by
different codebases.

### Path A — Prest0n web-adapter `tmp/doc-intake/` (THE PATH THAT LOST THE 12 PDFs)

- **NOT in this fork.** Owned entirely by the VM-local `prest0n-web-adapter.service`.
- Source: `.../prest0nVm/web-adapter/server.mjs` (`processAttachments`, `ATTACHMENT_DIR =
WORKSPACE_DIR/tmp/doc-intake`) + `attachmentAutofile.js`.
- The adapter writes originals synchronously to `WORKSPACE_DIR/tmp/doc-intake/<taskId>/`
  before the turn, runs `doc-processor.py` → `extracted/*.txt` + `manifest.json`, then
  `file-dropped-doc.py` (autofile, `caseId:null`). It emits the exact log events from the
  incident (`attachments.received`, `attachment.saved`, `attachments.extract.*`,
  `attachment.autofiled`, `attachments.extracted`).
- The adapter itself does **NOT** sweep `tmp/doc-intake`. The sweeper is a VM-local
  workspace cleanup process (the workspace "3PM self-improvement / cleanup" cron and/or a
  generic `tmp/` reaper), operating purely on path/age — with **no turn-success awareness**.
- Searched this fork for `doc-intake`, `attachments.received`, `attachment.saved`,
  `attachment.autofiled`, `task_<id>` → **zero hits.** This pipeline does not exist in the
  fork and cannot be fixed here.

**Recommended adapter-side change (VM-local, NOT in this fork):**

1. Write uploads to a DURABLE, non-swept location keyed by session/task, e.g.
   `WORKSPACE_DIR/intake/attachments/<taskId>/` (outside any `tmp/` sweep path), NOT
   `tmp/doc-intake/`. Keep `manifest.json` + originals there.
2. Retain on turn failure/timeout. Only delete after SUCCESSFUL completion or a generous
   TTL (recommend ≥ 7 days for a legal VM), never on failure.
3. Make the persisted path discoverable (return it in the manifest / task record) so a
   retried turn re-attaches without re-upload.
4. Exclude the durable dir from the workspace-cleanup cron's `tmp/` sweep.

### Path B — Gateway inbound-attachment offload (FORK-OWNED, same class of bug)

- **In this fork.** `src/gateway/chat-attachments.ts:parseMessageWithAttachments` offloads
  non-image / large attachments via `saveMediaBuffer(buf, mime, "inbound", ...)`
  (`src/media/store.ts`) → `media://inbound/<id>`, then `chat.send`
  (`src/gateway/server-methods/chat.ts`) stages them into the agent workspace and runs the
  turn.
- **The gap:** after offload, those `media/inbound/<id>` files are reclaimed ONLY by the
  periodic, purely time-based sweep `cleanOldMedia(ttlMs)` (`server-maintenance.ts` →
  `media/store.ts`). The sweep deletes by file age (`pruneExpired({ttlMs})`) with **no
  awareness of whether a turn is in-flight, succeeded, failed, or is being retried.**
  `chat.send` never explicitly retains them; it relies on the wall clock.
- Consequence: a slow / timed-out multi-file turn whose wall-clock duration approaches or
  exceeds the configured `media.ttlHours` window — or any post-failure retry — can have its
  offloaded originals swept mid-turn or right after failure. Same data-loss class as the
  incident, in fork-owned code. (In prod `media.ttlHours` floors to ≥ 1h, but the default
  `cleanOldMedia()` TTL is 2 min, and any long/queued legal turn + retry is exposed.)

## FORK-SIDE FIX (Path B — what this branch implements)

Make fork-owned inbound offload media **durable across an in-flight turn and a failed turn**
by pinning it against the time-based sweep, instead of trusting wall-clock age.

1. New module `src/media/inbound-retention.ts`: an in-process retention registry.
   - `pinInboundMedia(ids, ttlMs)` — mark inbound media IDs as protected until `now + ttlMs`.
   - `releaseInboundMedia(ids, graceMs)` — on turn completion, downgrade the pin to a grace
     window (`now + graceMs`) instead of deleting. Used for BOTH success and failure so a
     retried/failed turn keeps its originals through the grace window. Never hard-deletes.
   - `pinnedInboundIds(now)` — IDs still protected at `now`.
   - `clearInboundRetention()` — test reset.
2. `src/media/store.ts:cleanOldMedia` — before pruning, **refresh the mtime** of every
   currently-pinned inbound file to `now`, so the age-based `pruneExpired` cannot delete a
   pinned file. Self-contained: requires no change to the external `@openclaw/fs-safe`
   prune walk and is race-safe (mtime bump precedes the walk). Expired pins are dropped so
   abandoned media still ages out normally.
3. `src/gateway/server-methods/chat.ts:chat.send` — pin offloaded inbound IDs at offload
   time for `timeoutMs + RETENTION_GRACE_MS`; on the `.finally` of the run, release them
   with `RETENTION_GRACE_MS` grace (success and failure alike). This guarantees a
   failed/timed-out turn retains the user's uploads for the grace window.

### Honesty note

The literal 12-PDF loss was **Path A (web-adapter, VM-local), not this fork.** The crisp
boundary + recommended adapter change is documented above. The fork-side fix closes the
**same data-loss class** in the fork-owned offload path (Path B) and adds the durable
retention/pin contract the gateway can own — which is the concrete, valuable fork-side
improvement the incident calls for. We do NOT invent a fake `tmp/doc-intake` fix in the
fork, because that pipeline does not live here.

## Tests

`src/media/inbound-retention.test.ts` (+ a `cleanOldMedia` retention test):

- pinned inbound media is retained when a sweep runs during an in-flight turn (not pruned);
- on simulated turn FAILURE (release with grace), media is still retained through the grace
  window and only ages out after grace expires (cleaned only on success/grace-expiry, never
  on failure);
- unpinned / grace-expired media still ages out normally.
