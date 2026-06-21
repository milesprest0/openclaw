import { describe, expect, it } from "vitest";
import { buildAgentSystemPrompt } from "./system-prompt.js";

function extractProjectContext(prompt: string): string {
  const start = prompt.indexOf("# Project Context\n");
  if (start < 0) {
    return "";
  }
  const end = prompt.indexOf("## Silent Replies\n", start);
  if (end < 0) {
    return prompt.slice(start);
  }
  return prompt.slice(start, end);
}

describe("project context optimization", () => {
  it("inlines protected lines, pointers non-protected regions, and enforces maxChars", () => {
    const longProse = "Reference prose ".repeat(700);
    const prompt = buildAgentSystemPrompt({
      workspaceDir: "/tmp/openclaw-project-context-opt",
      contextFiles: [
        {
          path: "AGENTS.md",
          content: [
            "# AGENTS",
            "",
            "## HARD RULES",
            "- HARD: keep this line inline.",
            "",
            "## Dispatch",
            "- OVERRIDES: use gh for GitHub workflow actions.",
            "",
            "## Reference",
            longProse,
          ].join("\n"),
        },
        {
          path: "SOUL.md",
          content: [
            "# SOUL",
            "",
            "## Identity Truth 1",
            "I protect truthfulness under pressure.",
            "",
            "## Style",
            "Friendly and concise.",
          ].join("\n"),
        },
      ],
      projectContextOptimization: {
        dietToRetrieval: true,
        maxChars: 2_400,
      },
    });

    const projectContext = extractProjectContext(prompt);
    expect(projectContext.length).toBeLessThanOrEqual(2_400);
    expect(projectContext).toContain("HARD: keep this line inline.");
    expect(projectContext).toContain("OVERRIDES: use gh for GitHub workflow actions.");
    expect(projectContext).toContain("I protect truthfulness under pressure.");
    expect(projectContext).toContain("↳ Reference — load via memory_search when relevant");
    expect(projectContext).not.toContain(longProse);
  });
});
