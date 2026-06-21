import type { Skill as CanonicalSkill, SourceInfo } from "@mariozechner/pi-coding-agent";

export type SourceScope = "user" | "project" | "temporary";
export type SourceOrigin = "package" | "top-level";

export type Skill = CanonicalSkill & {
  // Preserve legacy source reads while keeping the canonical upstream shape.
  source?: string;
};

const DEFAULT_MAX_SKILL_DESCRIPTION_CHARS = 160;
const TRAILING_DESCRIPTION_BOUNDARY_RE = /[\s.,;:!?"'`~\-_/\\()\[\]{}<>]+$/u;

export type FormatSkillsForPromptOptions = {
  maxDescriptionChars?: number;
};

export function createSyntheticSourceInfo(
  path: string,
  options: {
    source: string;
    scope?: SourceScope;
    origin?: SourceOrigin;
    baseDir?: string;
  },
): SourceInfo {
  return {
    path,
    source: options.source,
    scope: options.scope ?? "temporary",
    origin: options.origin ?? "top-level",
    baseDir: options.baseDir,
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function trimSkillDescription(desc: string, maxChars: number): string {
  if (desc.length <= maxChars) {
    return desc;
  }
  if (maxChars <= 0) {
    return "…";
  }

  const clipped = desc.slice(0, maxChars);
  let boundary = -1;
  for (let index = clipped.length - 1; index >= 0; index -= 1) {
    const ch = clipped.charCodeAt(index);
    if (ch === 32 || ch === 9 || ch === 10 || ch === 11 || ch === 12 || ch === 13) {
      boundary = index;
      break;
    }
  }

  let trimmed = (boundary > 0 ? clipped.slice(0, boundary) : clipped).replace(
    TRAILING_DESCRIPTION_BOUNDARY_RE,
    "",
  );
  if (!trimmed) {
    trimmed = clipped.trimEnd();
  }
  if (!trimmed) {
    return "…";
  }
  return `${trimmed}…`;
}

/**
 * Keep this formatter's XML layout byte-for-byte aligned with the upstream
 * Agent Skills formatter so we can avoid importing the full pi-coding-agent
 * package root on the cold skills path. Visibility policy is applied upstream
 * before calling this helper.
 */
export function formatSkillsForPrompt(
  skills: Skill[],
  opts?: FormatSkillsForPromptOptions,
): string {
  if (skills.length === 0) {
    return "";
  }
  const shouldTrimDescriptions = opts !== undefined;
  const maxDescriptionChars = opts?.maxDescriptionChars ?? DEFAULT_MAX_SKILL_DESCRIPTION_CHARS;
  const lines = [
    "\n\nThe following skills provide specialized instructions for specific tasks.",
    "Use the read tool to load a skill's file when the task matches its description.",
    "When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.",
    "",
    "<available_skills>",
  ];
  for (const skill of skills) {
    const description = shouldTrimDescriptions
      ? trimSkillDescription(skill.description, maxDescriptionChars)
      : skill.description;
    lines.push("  <skill>");
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(`    <description>${escapeXml(description)}</description>`);
    lines.push(`    <location>${escapeXml(skill.filePath)}</location>`);
    lines.push("  </skill>");
  }
  lines.push("</available_skills>");
  return lines.join("\n");
}
