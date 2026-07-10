import type { Skill as CanonicalSkill, SourceInfo } from "@mariozechner/pi-coding-agent";
export type SourceScope = "user" | "project" | "temporary";
export type SourceOrigin = "package" | "top-level";
export type Skill = CanonicalSkill & {
  source?: string;
};
export type FormatSkillsForPromptOptions = {
  maxDescriptionChars?: number;
};
export declare function createSyntheticSourceInfo(
  path: string,
  options: {
    source: string;
    scope?: SourceScope;
    origin?: SourceOrigin;
    baseDir?: string;
  },
): SourceInfo;
export declare function trimSkillDescription(desc: string, maxChars: number): string;
/**
 * Keep this formatter's XML layout byte-for-byte aligned with the upstream
 * Agent Skills formatter so we can avoid importing the full pi-coding-agent
 * package root on the cold skills path. Visibility policy is applied upstream
 * before calling this helper.
 */
export declare function formatSkillsForPrompt(
  skills: Skill[],
  opts?: FormatSkillsForPromptOptions,
): string;
