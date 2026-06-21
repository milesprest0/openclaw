import { formatSkillsForPrompt as upstreamFormatSkillsForPrompt } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import { createCanonicalFixtureSkill } from "../skills.test-helpers.js";
import {
  formatSkillsForPrompt,
  trimSkillDescription,
  type FormatSkillsForPromptOptions,
  type Skill,
} from "./skill-contract.js";
import type { SkillEntry } from "./types.js";
import { buildWorkspaceSkillsPrompt } from "./workspace.js";

function makeSkill(
  name: string,
  description: string,
  filePath = `/skills/${name}/SKILL.md`,
): Skill {
  return createCanonicalFixtureSkill({
    name,
    description,
    filePath,
    baseDir: `/skills/${name}`,
    source: "workspace",
  });
}

function makeEntry(skill: Skill): SkillEntry {
  return {
    skill,
    frontmatter: {},
    exposure: {
      includeInRuntimeRegistry: true,
      includeInAvailableSkillsPrompt: true,
      userInvocable: true,
    },
  };
}

function extractDescriptions(output: string): string[] {
  return Array.from(output.matchAll(/<description>([^<]*)<\/description>/g), (m) => m[1]);
}

describe("skill-contract trimming", () => {
  it("keeps default formatter output byte-identical when opts are undefined", () => {
    const skills = [
      makeSkill("weather", "Get weather <data> & forecasts"),
      makeSkill("notes", "Summarize notes", "/tmp/notes/SKILL.md"),
    ];

    const out = formatSkillsForPrompt(skills);
    const expectedGolden = [
      "",
      "",
      "The following skills provide specialized instructions for specific tasks.",
      "Use the read tool to load a skill's file when the task matches its description.",
      "When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.",
      "",
      "<available_skills>",
      "  <skill>",
      "    <name>weather</name>",
      "    <description>Get weather &lt;data&gt; &amp; forecasts</description>",
      "    <location>/skills/weather/SKILL.md</location>",
      "  </skill>",
      "  <skill>",
      "    <name>notes</name>",
      "    <description>Summarize notes</description>",
      "    <location>/tmp/notes/SKILL.md</location>",
      "  </skill>",
      "</available_skills>",
    ].join("\n");

    expect(out).toBe(expectedGolden);
    expect(out).toBe(upstreamFormatSkillsForPrompt(skills));
  });

  it("keeps short descriptions unchanged when trimming is on", () => {
    const skills = [makeSkill("quick", "Short description")];
    const opts: FormatSkillsForPromptOptions = { maxDescriptionChars: 160 };

    const out = formatSkillsForPrompt(skills, opts);
    expect(out).toContain("<description>Short description</description>");
    expect(out).toContain("<name>quick</name>");
    expect(out).toContain("<location>/skills/quick/SKILL.md</location>");
  });

  it("trims long descriptions at a word boundary with a single ellipsis", () => {
    const maxChars = 60;
    const longDescription =
      "Search distributed incident logs quickly across shards and summarize the most relevant failures for triage.";
    const trimmed = trimSkillDescription(longDescription, maxChars);
    const out = formatSkillsForPrompt([makeSkill("log-search", longDescription)], {
      maxDescriptionChars: maxChars,
    });

    expect(trimmed.endsWith("…")).toBe(true);
    expect(trimmed.length).toBeLessThanOrEqual(maxChars + 1);
    expect(trimmed).toBe("Search distributed incident logs quickly across shards and…");
    expect(out).toContain(`<description>${trimmed}</description>`);
  });

  it("keeps name/location unchanged and preserves XML escaping after trimming", () => {
    const name = "tool<planner>&v2";
    const location = "/tmp/skills/tool<planner>&v2/SKILL.md";
    const description =
      "Parse <xml> & preserve 'quotes' and \"double quotes\" while ensuring the output stays valid for prompt injection checks.";
    const out = formatSkillsForPrompt([makeSkill(name, description, location)], {
      maxDescriptionChars: 70,
    });

    expect(out).toContain("<name>tool&lt;planner&gt;&amp;v2</name>");
    expect(out).toContain("<location>/tmp/skills/tool&lt;planner&gt;&amp;v2/SKILL.md</location>");
    expect(out).toContain("&lt;xml&gt;");
    expect(out).toContain("&amp;");
    expect(out).toContain("&apos;");
    expect(out).toContain("&quot;");
  });

  it("is deterministic across repeated calls for prefix stability", () => {
    const skills = [
      makeSkill(
        "stable",
        "Summarize latency regressions by service and point to the exact deployment window that introduced the issue.",
      ),
    ];
    const opts: FormatSkillsForPromptOptions = { maxDescriptionChars: 64 };

    const first = formatSkillsForPrompt(skills, opts);
    const second = formatSkillsForPrompt(skills, opts);
    const third = formatSkillsForPrompt(skills, opts);
    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it("retains first-sentence selection keywords in trimmed descriptions", () => {
    const skills = [
      makeSkill(
        "search-index",
        "Search logs by incident id and service owner. Use indexed shards and rank by severity before deep analysis.",
      ),
      makeSkill(
        "pdf-brief",
        "Analyze PDF filings for compliance deltas. Compare quarterly language and flag unusual covenant changes.",
      ),
    ];

    const out = formatSkillsForPrompt(skills, { maxDescriptionChars: 70 });
    const descriptions = extractDescriptions(out).join("\n");
    expect(descriptions).toContain("Search");
    expect(descriptions).toContain("Analyze");
  });

  it("reduces available-skills prompt bytes over a 20-skill set", () => {
    const skills = Array.from({ length: 20 }, (_, index) =>
      makeSkill(
        `skill-${index}`,
        "Investigate cross-service failures with timeline reconstruction, shard-aware query plans, exact reproduction scripts, and mitigation sequencing for incident response handoffs.",
      ),
    );

    const fullOutput = formatSkillsForPrompt(skills);
    const trimmedOutput = formatSkillsForPrompt(skills, { maxDescriptionChars: 80 });
    expect(fullOutput.length - trimmedOutput.length).toBeGreaterThanOrEqual(1000);
  });

  it("threads config flag through workspace prompt rendering", () => {
    const skill = makeSkill(
      "workspace-long",
      "Search deployment timelines and compare rollback outcomes across clusters before writing the final recovery brief.",
    );
    const baseConfig: OpenClawConfig = {
      skills: {
        limits: {
          maxSkillsPromptChars: 100_000,
        },
      },
    };
    const promptOff = buildWorkspaceSkillsPrompt("/fake", {
      entries: [makeEntry(skill)],
      config: baseConfig,
    });
    const promptOn = buildWorkspaceSkillsPrompt("/fake", {
      entries: [makeEntry(skill)],
      config: {
        ...baseConfig,
        agents: {
          defaults: {
            skillsPromptOptimization: {
              trimDescriptions: true,
              maxDescriptionChars: 48,
            },
          },
        },
      } satisfies OpenClawConfig,
    });

    expect(promptOff).toContain(
      "Search deployment timelines and compare rollback outcomes across clusters before writing the final recovery brief.",
    );
    expect(promptOn).toContain(
      "<description>Search deployment timelines and compare…</description>",
    );
  });
});
