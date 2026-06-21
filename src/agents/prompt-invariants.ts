export const PROTECTED_MARKERS = [
  "HARD",
  "HARD RULE",
  "identity-level",
  "IDENTITY-LEVEL",
  "OVERRIDES",
] as const;

const IDENTITY_TRUTH_HEADING = /^(#+)\s*identity\s+truth\b/iu;
const MARKDOWN_HEADING = /^(#{1,6})\s+/u;

function normalizeLineForPresence(line: string): string {
  return line.replace(/\s+/gu, " ").trim();
}

function hasProtectedMarker(line: string): boolean {
  const upper = line.toUpperCase();
  return PROTECTED_MARKERS.some((marker) => upper.includes(marker.toUpperCase()));
}

export function extractProtectedLines(sourceText: string): string[] {
  const lines = sourceText.split(/\r?\n/u);
  const protectedLines: string[] = [];
  let identityTruthLevel: number | undefined;

  for (const line of lines) {
    const headingMatch = line.match(MARKDOWN_HEADING);
    if (headingMatch) {
      const headingLevel = headingMatch[1]?.length ?? 0;
      if (identityTruthLevel !== undefined && headingLevel <= identityTruthLevel) {
        identityTruthLevel = undefined;
      }
      if (IDENTITY_TRUTH_HEADING.test(line)) {
        identityTruthLevel = headingLevel;
      }
    }

    const protectedByIdentityTruth =
      identityTruthLevel !== undefined && normalizeLineForPresence(line).length > 0;
    if (protectedByIdentityTruth || hasProtectedMarker(line)) {
      protectedLines.push(line);
    }
  }

  return protectedLines;
}

export function assertProtectedLinesPresent(
  assembledPrompt: string,
  protectedLines: string[],
): { ok: boolean; missing: string[] } {
  const normalizedAssembled = new Set(
    assembledPrompt
      .split(/\r?\n/u)
      .map((line) => normalizeLineForPresence(line))
      .filter((line) => line.length > 0),
  );

  const missing = protectedLines
    .map((line) => normalizeLineForPresence(line))
    .filter((line) => line.length > 0)
    .filter((line) => !normalizedAssembled.has(line));

  return {
    ok: missing.length === 0,
    missing,
  };
}
