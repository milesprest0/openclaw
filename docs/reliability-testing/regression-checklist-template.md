# Extension Regression Checklist (Template)

Use this per extension release or integration change.

## Metadata

- Extension: `<name>`
- Owner: `<person>`
- Date (UTC): `<YYYY-MM-DD>`
- Commit / branch: `<sha | branch>`
- Environment: `<local | CI | staging>`
- Test run command(s):
  - `<exact command>`
- Evidence artifacts:
  - `<path to json report>`
  - `<path to log / screenshot / trace>`

---

## Contract Dimension A — Authentication

> Cover whichever auth modes the extension supports (API key, OAuth, webhook signature, authz policy).

| Check                                                                      | Pass/Fail           | Evidence                 | Notes |
| -------------------------------------------------------------------------- | ------------------- | ------------------------ | ----- |
| API key path works with valid credential (env/secret ref/config)           | ☐ Pass ☐ Fail ☐ N/A | `<file:test / log line>` |       |
| Missing API key is rejected with actionable error                          | ☐ Pass ☐ Fail ☐ N/A | `<file:test / log line>` |       |
| Invalid/expired API key classified as auth failure (not transient)         | ☐ Pass ☐ Fail ☐ N/A | `<file:test / log line>` |       |
| OAuth login flow succeeds (device/web/cli as applicable)                   | ☐ Pass ☐ Fail ☐ N/A | `<file:test / log line>` |       |
| OAuth state separation / token refresh behavior is safe                    | ☐ Pass ☐ Fail ☐ N/A | `<file:test / log line>` |       |
| Webhook signature verification accepts valid signature                     | ☐ Pass ☐ Fail ☐ N/A | `<file:test / log line>` |       |
| Webhook signature rejects tampered payload / stale timestamp / bad version | ☐ Pass ☐ Fail ☐ N/A | `<file:test / log line>` |       |
| Channel/actor authorization (allowFrom, group, permissions) enforced       | ☐ Pass ☐ Fail ☐ N/A | `<file:test / log line>` |       |

---

## Contract Dimension B — Request/Response Contract

| Check                                                             | Pass/Fail           | Evidence              | Notes |
| ----------------------------------------------------------------- | ------------------- | --------------------- | ----- |
| Request payload contains required fields for provider/channel API | ☐ Pass ☐ Fail ☐ N/A | `<file:test / trace>` |       |
| Optional fields are normalized correctly                          | ☐ Pass ☐ Fail ☐ N/A | `<file:test / trace>` |       |
| Response parsing handles success payload shape(s)                 | ☐ Pass ☐ Fail ☐ N/A | `<file:test / trace>` |       |
| Pagination / streaming / chunking contract behaves as expected    | ☐ Pass ☐ Fail ☐ N/A | `<file:test / trace>` |       |
| Model/tool/action routing resolves to expected provider call      | ☐ Pass ☐ Fail ☐ N/A | `<file:test / trace>` |       |
| Backward-compat mapping/normalization still honored               | ☐ Pass ☐ Fail ☐ N/A | `<file:test / trace>` |       |

---

## Contract Dimension C — Failure Handling

| Check                                                                | Pass/Fail           | Evidence                 | Notes |
| -------------------------------------------------------------------- | ------------------- | ------------------------ | ----- |
| Timeout behavior returns explicit timeout classification             | ☐ Pass ☐ Fail ☐ N/A | `<file:test / log line>` |       |
| Upstream 4xx/5xx provider errors are surfaced without secret leakage | ☐ Pass ☐ Fail ☐ N/A | `<file:test / log line>` |       |
| Retry policy does not retry non-recoverable auth failures            | ☐ Pass ☐ Fail ☐ N/A | `<file:test / log line>` |       |
| Retry policy handles transient network failures safely               | ☐ Pass ☐ Fail ☐ N/A | `<file:test / log line>` |       |
| Partial failures degrade gracefully (no process crash)               | ☐ Pass ☐ Fail ☐ N/A | `<file:test / log line>` |       |
| Error messages include remediation guidance                          | ☐ Pass ☐ Fail ☐ N/A | `<file:test / log line>` |       |

---

## Summary Gate

- Overall: ☐ PASS ☐ FAIL ☐ CONDITIONAL
- Blocking issues:
  1. `<issue>`
  2. `<issue>`
- Follow-ups / owners:
  1. `<owner> — <action> — <due>`
- Re-test required before close: ☐ Yes ☐ No
