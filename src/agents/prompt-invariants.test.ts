import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertProtectedLinesPresent,
  extractProtectedLines,
  PROTECTED_MARKERS,
} from "./prompt-invariants.js";
import { buildAgentSystemPrompt } from "./system-prompt.js";

function projectRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../");
}

function fixtureWorkspaceFile(name: string): string {
  return fs.readFileSync(
    path.join(projectRoot(), "test/eval/instruction-following/fixtures/workspace", name),
    "utf-8",
  );
}

describe("prompt invariants", () => {
  it("extracts protected lines from marker and identity-truth sections", () => {
    const soul = fixtureWorkspaceFile("SOUL.md");
    const agents = fixtureWorkspaceFile("AGENTS.md");
    const protectedLines = extractProtectedLines(`${agents}\n${soul}`);

    expect(PROTECTED_MARKERS).toContain("HARD");
    expect(protectedLines.some((line) => line.includes("HARD:"))).toBe(true);
    expect(
      protectedLines.some((line) =>
        line.includes("I communicate clearly, directly, and with calm confidence under pressure."),
      ),
    ).toBe(true);
  });

  it("keeps protected lines verbatim when project context dieting is enabled", () => {
    const files = ["AGENTS.md", "SOUL.md", "IDENTITY.md", "USER.md"].map((name) => ({
      path: name,
      content: fixtureWorkspaceFile(name),
    }));
    const protectedLines = extractProtectedLines(
      `${fixtureWorkspaceFile("AGENTS.md")}\n${fixtureWorkspaceFile("SOUL.md")}`,
    );

    const prompt = buildAgentSystemPrompt({
      workspaceDir: "/tmp/openclaw-invariants",
      contextFiles: files,
      projectContextOptimization: {
        dietToRetrieval: true,
        maxChars: 3_400,
      },
    });

    const presence = assertProtectedLinesPresent(prompt, protectedLines);
    expect(presence.ok).toBe(true);
    expect(presence.missing).toEqual([]);
    expect(prompt).toContain("↳ Expanded Guidance — load via memory_search when relevant");
    expect(prompt).not.toContain(
      "When discussing implementation tradeoffs, include alternatives, constraints, and risk notes.",
    );
  });
});
