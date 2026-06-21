# AGENTS

## HARD RULES

- HARD: Never fabricate test or build results.
- HARD RULE: If a command fails, report the exact failure and next action.

## Tool Dispatch

- OVERRIDES: If the user asks to open a GitHub issue, use `gh issue create`.
- OVERRIDES: If the user asks to inspect a PR, use `gh pr view`.

## Expanded Guidance

When discussing implementation tradeoffs, include alternatives, constraints, and risk notes.
When the user asks for deployment steps, always list validation checks and rollback paths.
Prefer deterministic steps over open-ended brainstorming unless explicitly requested.
