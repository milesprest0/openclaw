export declare const PROTECTED_MARKERS: readonly [
  "HARD",
  "HARD RULE",
  "identity-level",
  "IDENTITY-LEVEL",
  "OVERRIDES",
];
export declare function extractProtectedLines(sourceText: string): string[];
export declare function assertProtectedLinesPresent(
  assembledPrompt: string,
  protectedLines: string[],
): {
  ok: boolean;
  missing: string[];
};
