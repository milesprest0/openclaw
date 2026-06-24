// Voice-discipline middleware for outbound Slack messages.
//
// Purpose: strip "thinking-style" process narration that some LLMs (notably
// Claude Opus with extended thinking enabled) emit as regular `text` content
// blocks instead of `type:"thinking"` blocks. The Anthropic transport stream
// already filters `type:"thinking"` blocks correctly, but the model
// sometimes puts reasoning narration inside ordinary assistant text — which
// leaks to the user as bolded headings and process talk like:
//   *Investigating the file*
//   *Analyzing the directory structure*
//   *Refining My Analysis*
// followed by paragraphs of "I am now examining...", "Let me determine...".
//
// This module strips such patterns from the message immediately before it
// hits the Slack chunker / API. It is conservative: it only matches well-
// known leading patterns and only removes them when the surrounding text
// looks like a real reply remains after the strip. It never silently drops
// the whole message — if stripping would leave the message empty or near-
// empty, the original text is returned unchanged so the user still sees
// something.
//
// Composes with:
//  - Identity rule "Prest0n User-Facing Voice Discipline" (MEMORY.md)
//  - Self-fix plan Pillars 1 + 4 (memory/reference/internal-prest0n-self-fix-plan-2026-05-25.md)
//
// History: added 2026-05-25 after Malaika reported the internal prest0-vm
// Prest0n bot (B0AL6593FLH) leaking verbose internal reasoning into Slack
// replies on #prest0-team-center.

export interface VoiceDisciplineOptions {
  /** Disable the strip entirely (e.g. for debugging or operator channels). */
  disabled?: boolean;
  /**
   * Minimum fraction of the original message that must remain after stripping.
   * If the stripped text falls below this fraction, the original message is
   * returned unchanged to avoid producing an empty or near-empty reply.
   * Default 0.10 (10%).
   */
  minRemainingFraction?: number;
}

/**
 * Regex patterns that match thinking-style "process header" lines emitted as
 * regular assistant text. Each pattern matches a single line that is either:
 *   - a bolded heading like `*Investigating the Image Access*`
 *   - a bolded heading like `**Refining My Analysis**`
 *   - a non-bolded process declaration like `I am now examining...`
 *
 * Matches are anchored to the start of a line and the regex is applied with
 * the `m` (multiline) flag so it can find any such heading anywhere in the
 * message.
 */
const PROCESS_HEADER_PATTERNS: ReadonlyArray<RegExp> = [
  // Slack-mrkdwn bold ( *Title* ) or Markdown bold ( **Title** ) headings
  // followed by a verb-of-internal-reasoning.
  /^\*{1,2}(Investigating|Analyzing|Examining|Refining|Determining|Identifying|Considering|Evaluating|Exploring|Verifying|Checking|Reviewing|Inspecting|Diagnosing|Deciding|Planning|Thinking|Reasoning|Reflecting|Reconsidering|Re-?evaluating|Synthesizing|Searching|Locating|Investigation|Analysis)\b[^\n]*\*{1,2}\s*$/gim,
  // Bare reasoning-narration lines that often precede the real reply.
  /^(?:I am now|I am going to|I am currently|I'll now|Let me now|Let me first|Let me start by|Let me determine|Let me figure out|I need to figure out|I need to determine|I'm going to|I will now|First, I'll|First, let me|Now I'll|Now let me)[^\n]*$/gim,
  // "Step N:" reasoning enumerations at start of line.
  /^Step\s+\d+\s*[:.-]\s+I[' ][^\n]*$/gim,
];

/**
 * Apply voice discipline to an outbound Slack message string.
 *
 * Returns the cleaned message. If the cleaned message would be empty or
 * shrink below `minRemainingFraction` of the original, the original is
 * returned unchanged.
 */
export function applyVoiceDiscipline(
  message: string,
  options: VoiceDisciplineOptions = {},
): string {
  if (options.disabled) {
    return message;
  }
  if (!message) {
    return message;
  }
  const originalLength = message.length;
  let cleaned = message;
  for (const pattern of PROCESS_HEADER_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }
  // Collapse 3+ consecutive blank lines down to a single blank line.
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  // Trim leading blank lines created by stripping a heading at the top.
  cleaned = cleaned.replace(/^\s+/, "");
  // Trim trailing whitespace.
  cleaned = cleaned.replace(/\s+$/, "");
  const minRemainingFraction = options.minRemainingFraction ?? 0.1;
  if (cleaned.length === 0) {
    return message;
  }
  if (cleaned.length < originalLength * minRemainingFraction) {
    return message;
  }
  return cleaned;
}

/**
 * Diagnostic helper: return the set of patterns that matched the input. Used
 * by tests and observability hooks to confirm the stripper is firing on the
 * patterns we expect. Not exported to runtime callers.
 */
export function _diagnoseVoiceDiscipline(message: string): string[] {
  const hits: string[] = [];
  for (const pattern of PROCESS_HEADER_PATTERNS) {
    const matches = message.match(pattern);
    if (matches) {
      hits.push(...matches);
    }
  }
  return hits;
}
