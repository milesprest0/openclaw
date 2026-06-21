import type { AgentProjectContextOptimizationConfig } from "../../config/types.agent-defaults.js";
import type { EmbeddedContextFile } from "../pi-embedded-helpers.js";
import { assertProtectedLinesPresent } from "../prompt-invariants.js";
import { buildAgentSystemPrompt } from "../system-prompt.js";

export type InstructionFollowingEvalCase = {
  id: string;
  promptContextFixture: string;
  mustContainVerbatim: string[];
  rubric: string;
};

export type InstructionFollowingHarnessResult = {
  id: string;
  ok: boolean;
  missing: string[];
  liveEval?: "skipped" | "passed" | "failed";
};

export function assemblePromptForEval(params: {
  contextFiles: EmbeddedContextFile[];
  projectContextOptimization?: AgentProjectContextOptimizationConfig;
}): string {
  return buildAgentSystemPrompt({
    workspaceDir: "/tmp/openclaw-eval",
    contextFiles: params.contextFiles,
    projectContextOptimization: params.projectContextOptimization,
  });
}

export async function runInstructionFollowingHarness(params: {
  cases: InstructionFollowingEvalCase[];
  resolveContextFiles: (fixturePath: string) => EmbeddedContextFile[];
  projectContextOptimization?: AgentProjectContextOptimizationConfig;
  runLiveEval?: boolean;
  gradeLiveRubric?: (input: {
    prompt: string;
    rubric: string;
    testCase: InstructionFollowingEvalCase;
  }) => Promise<boolean>;
}): Promise<InstructionFollowingHarnessResult[]> {
  const results: InstructionFollowingHarnessResult[] = [];
  for (const testCase of params.cases) {
    const contextFiles = params.resolveContextFiles(testCase.promptContextFixture);
    const prompt = assemblePromptForEval({
      contextFiles,
      projectContextOptimization: params.projectContextOptimization,
    });
    const presence = assertProtectedLinesPresent(prompt, testCase.mustContainVerbatim);
    let liveEval: InstructionFollowingHarnessResult["liveEval"] = "skipped";
    if (params.runLiveEval && params.gradeLiveRubric) {
      const passed = await params.gradeLiveRubric({
        prompt,
        rubric: testCase.rubric,
        testCase,
      });
      liveEval = passed ? "passed" : "failed";
    }
    results.push({
      id: testCase.id,
      ok: presence.ok,
      missing: presence.missing,
      liveEval,
    });
  }
  return results;
}
