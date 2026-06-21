## Phase 2 / Lever 5 plan

1. Read the Lever 5 spec and current skills/config seams to confirm exact constraints.
2. Add additive `agents.defaults.skillsPromptOptimization` config types + schema wiring (match the Phase 1 file set used by `toolExposure.lazy`).
3. Implement pure `trimSkillDescription(desc, maxChars)` in `src/agents/skills/skill-contract.ts` and add optional formatter opts so default behavior stays byte-identical.
4. Thread config to the `formatSkillsForPrompt` call site in `src/agents/skills/workspace.ts` with default OFF / 160 behavior.
5. Add focused tests for skill trimming behavior (default-off golden/byte-identical, ON behaviors, XML escaping, deterministic output, keyword retention, token reduction).
6. Extend config schema tests for parse/default/round-trip behavior of `skillsPromptOptimization`.
7. Run targeted tests, then full required Vitest coverage for this change.
8. Run `npm run build` in worktree and also on `main` to confirm the pre-existing plugin-sdk d.ts failure reproduces unchanged.
9. Commit, push branch, open PR with the requested title.
10. Emit completion event via `openclaw system event ...` with done/blocked status and verification summary.
