## Phase 3 Levers 1+2 plan

1. Read Phase 3 spec + plan context and mirror existing Phase 1/2 flag wiring patterns.
2. Deliverable A first: add prompt invariants module + tests, golden system-prompt default-OFF snapshot test, and deterministic instruction-following harness + corpus.
3. Add additive config wiring for `agents.defaults.projectContextOptimization` and `agents.defaults.historyOptimization` across types, zod schema, schema labels/help, and schema tests (default-OFF/bounds).
4. Implement Lever 1 in `src/agents/system-prompt.ts` behind `dietToRetrieval===true` with fail-closed protected-line guard, deterministic inline/on-demand classification, pointer rendering, max-char enforcement, and diagnostics.
5. Implement Lever 2 in `src/agents/pi-embedded-runner/run/context-budget.ts` behind `digestOldToolResults===true` with pure helper, identifier preservation, recent-turn protection, and diagnostics.
6. Add/extend tests: lever-1 trim behavior, context-budget digest behavior (OFF identical / ON ids-preserved / recent-raw), and keep all default-OFF outputs byte-identical.
7. Run targeted vitest suites for new files plus existing system-prompt/context-budget/config-schema suites; report exact pass counts.
8. Run `npm run build` in this worktree and on `main` to confirm known pre-existing `build:plugin-sdk:dts` failures remain unchanged.
9. Commit, push `feat/phase3-levers-12`, and open a PR with the exact requested title and verification notes.
