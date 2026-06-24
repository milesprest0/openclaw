import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildAgentSystemPrompt } from "./system-prompt.js";

function projectRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../");
}

function fixtureWorkspaceDir(): string {
  return path.join(projectRoot(), "test/eval/instruction-following/fixtures/workspace");
}

function loadFixtureContextFiles() {
  return fs
    .readdirSync(fixtureWorkspaceDir())
    .toSorted((a, b) => a.localeCompare(b, "en"))
    .map((name) => ({
      path: name,
      content: fs.readFileSync(path.join(fixtureWorkspaceDir(), name), "utf-8"),
    }));
}

describe("system prompt golden (phase3 default-off)", () => {
  it("stays byte-identical when phase3 flags are unset", () => {
    const prompt = buildAgentSystemPrompt({
      workspaceDir: "/tmp/openclaw-golden",
      contextFiles: loadFixtureContextFiles(),
      // Intentionally omit projectContextOptimization/historyOptimization flags.
    });
    const goldenPath = path.join(projectRoot(), "src/agents/fixtures/system-prompt.golden.txt");
    if (process.env.UPDATE_GOLDEN_PROMPT === "1") {
      fs.mkdirSync(path.dirname(goldenPath), { recursive: true });
      fs.writeFileSync(goldenPath, prompt, "utf-8");
    }
    const golden = fs.readFileSync(goldenPath, "utf-8");
    expect(prompt).toBe(golden);
  });
});
