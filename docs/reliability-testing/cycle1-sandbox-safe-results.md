# Cycle 1 Sandbox-Safe Results

Date (UTC): 2026-07-09
Repo: `/home/miles/projects/openclaw-fork`
Scope: `anthropic`, `openai`, `google`, `openrouter`, `groq`, `slack`, `discord`, `telegram`, `whatsapp`, `elevenlabs`

## Notes

- No live-network tests were intentionally enabled (no `OPENCLAW_LIVE_TEST=1` / provider live flags set in this run).
- Provider extensions in cycle-1 are grouped under shared Vitest projects, so include filters were used via `OPENCLAW_VITEST_INCLUDE_FILE` to scope to each extension.
- `elevenlabs` is grouped under the media config; root project filtering with `--project extension-media` fails in the root config and is flagged below.

## Commands + Results

| Extension                                   | Exact command run                                                                                                                                                                                                                                                                            | Status                                                         | Files | Tests (pass/fail) | Evidence                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----: | ----------------: | -------------------------------------------------------------------------------- |
| anthropic                                   | `cd /home/miles/projects/openclaw-fork && OPENCLAW_VITEST_INCLUDE_FILE=/tmp/cycle1-includes/anthropic.json npx vitest run --project extension-providers --reporter=json --outputFile=/tmp/vitest-cycle1-rerun-anthropic.json`                                                                | PASS                                                           |    17 |              67/0 | `/tmp/vitest-cycle1-rerun-anthropic.json`, `/tmp/cycle1-logs/anthropic.stdout`   |
| openai                                      | `cd /home/miles/projects/openclaw-fork && npx vitest run --project extension-provider-openai --reporter=json --outputFile=/tmp/vitest-cycle1-rerun-openai.json`                                                                                                                              | PASS                                                           |    52 |             235/0 | `/tmp/vitest-cycle1-rerun-openai.json`, `/tmp/cycle1-logs/openai.stdout`         |
| google                                      | `cd /home/miles/projects/openclaw-fork && OPENCLAW_VITEST_INCLUDE_FILE=/tmp/cycle1-includes/google.json npx vitest run --project extension-providers --reporter=json --outputFile=/tmp/vitest-cycle1-rerun-google.json`                                                                      | **FAIL**                                                       |    50 |             248/2 | `/tmp/vitest-cycle1-rerun-google.json`, `/tmp/cycle1-logs/google.stdout`         |
| openrouter                                  | `cd /home/miles/projects/openclaw-fork && OPENCLAW_VITEST_INCLUDE_FILE=/tmp/cycle1-includes/openrouter.json npx vitest run --project extension-providers --reporter=json --outputFile=/tmp/vitest-cycle1-rerun-openrouter.json`                                                              | PASS                                                           |    12 |              33/0 | `/tmp/vitest-cycle1-rerun-openrouter.json`, `/tmp/cycle1-logs/openrouter.stdout` |
| groq                                        | `cd /home/miles/projects/openclaw-fork && OPENCLAW_VITEST_INCLUDE_FILE=/tmp/cycle1-includes/groq.json npx vitest run --project extension-providers --reporter=json --outputFile=/tmp/vitest-cycle1-rerun-groq.json`                                                                          | PASS                                                           |     2 |               4/0 | `/tmp/vitest-cycle1-rerun-groq.json`, `/tmp/cycle1-logs/groq.stdout`             |
| slack                                       | `cd /home/miles/projects/openclaw-fork && npx vitest run --project extension-slack --reporter=json --outputFile=/tmp/vitest-cycle1-rerun-slack.json`                                                                                                                                         | PASS                                                           |   274 |            1035/0 | `/tmp/vitest-cycle1-rerun-slack.json`, `/tmp/cycle1-logs/slack.stdout`           |
| discord                                     | `cd /home/miles/projects/openclaw-fork && npx vitest run --project extension-discord --reporter=json --outputFile=/tmp/vitest-cycle1-rerun-discord.json`                                                                                                                                     | PASS                                                           |   381 |            1395/0 | `/tmp/vitest-cycle1-rerun-discord.json`, `/tmp/cycle1-logs/discord.stdout`       |
| telegram                                    | `cd /home/miles/projects/openclaw-fork && npx vitest run --project extension-telegram --reporter=json --outputFile=/tmp/vitest-cycle1-rerun-telegram.json`                                                                                                                                   | PASS                                                           |   327 |            1504/0 | `/tmp/vitest-cycle1-rerun-telegram.json`, `/tmp/cycle1-logs/telegram.stdout`     |
| whatsapp                                    | `cd /home/miles/projects/openclaw-fork && npx vitest run --project extension-whatsapp --reporter=json --outputFile=/tmp/vitest-cycle1-rerun-whatsapp.json`                                                                                                                                   | PASS                                                           |   182 |             709/0 | `/tmp/vitest-cycle1-rerun-whatsapp.json`, `/tmp/cycle1-logs/whatsapp.stdout`     |
| elevenlabs (root project filter attempt)    | `cd /home/miles/projects/openclaw-fork && OPENCLAW_VITEST_INCLUDE_FILE=/tmp/cycle1-includes/elevenlabs.json npx vitest run --project extension-media --reporter=json --outputFile=/tmp/vitest-cycle1-rerun-elevenlabs.json`                                                                  | **ERROR** (`No projects matched the filter "extension-media"`) |     0 |               0/0 | `/tmp/cycle1-logs/elevenlabs-project-extension-media.stdout`                     |
| elevenlabs (validated media config command) | `cd /home/miles/projects/openclaw-fork && OPENCLAW_VITEST_INCLUDE_FILE=/tmp/cycle1-includes/elevenlabs.json npx vitest run -c test/vitest/vitest.extension-media.config.ts --project extension-media --reporter=json --outputFile=/tmp/vitest-cycle1-rerun-elevenlabs-project-filtered.json` | PASS                                                           |    10 |              18/0 | `/tmp/vitest-cycle1-rerun-elevenlabs-project-filtered.json`                      |

## Failure details

### google (2 failing tests)

- File: `extensions/google/default-model.test.ts`
- Failing tests:
  1. `google default model sets defaults when model is unset`
  2. `google default model overrides existing models`
- Root-cause summary: expected model ref is not normalized in test assertions; runtime normalizes to canonical form (`google/~google/gemini-pro-latest`).
- Detailed write-up: `docs/reliability-testing/cycle1-findings.md`

## Sandbox-safe aggregate

- Extensions passing sandbox-safe suites: **9/10** (all except google assertion drift)
- Total passing tests in cycle-1 sandbox-safe subset: **5,248**
- Total failing tests: **2** (both in google default-model test)
