import type { MarkdownTableMode } from "openclaw/plugin-sdk/config-types";
import {
  markdownToIR,
  type MarkdownLinkSpan,
  renderMarkdownIRChunksWithinLimit,
} from "openclaw/plugin-sdk/text-runtime";
import { renderMarkdownWithMarkers } from "openclaw/plugin-sdk/text-runtime";

// Escape special characters for Slack mrkdwn format.
// Preserve Slack's angle-bracket tokens so mentions and links stay intact.
function escapeSlackMrkdwnSegment(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const SLACK_ANGLE_TOKEN_RE = /<[^>\n]+>/g;

function isAllowedSlackAngleToken(token: string): boolean {
  if (!token.startsWith("<") || !token.endsWith(">")) {
    return false;
  }
  const inner = token.slice(1, -1);
  return (
    inner.startsWith("@") ||
    inner.startsWith("#") ||
    inner.startsWith("!") ||
    inner.startsWith("mailto:") ||
    inner.startsWith("tel:") ||
    inner.startsWith("http://") ||
    inner.startsWith("https://") ||
    inner.startsWith("slack://")
  );
}

function escapeSlackMrkdwnContent(text: string): string {
  if (!text) {
    return "";
  }
  if (!text.includes("&") && !text.includes("<") && !text.includes(">")) {
    return text;
  }

  SLACK_ANGLE_TOKEN_RE.lastIndex = 0;
  const out: string[] = [];
  let lastIndex = 0;

  for (
    let match = SLACK_ANGLE_TOKEN_RE.exec(text);
    match;
    match = SLACK_ANGLE_TOKEN_RE.exec(text)
  ) {
    const matchIndex = match.index ?? 0;
    out.push(escapeSlackMrkdwnSegment(text.slice(lastIndex, matchIndex)));
    const token = match[0] ?? "";
    out.push(isAllowedSlackAngleToken(token) ? token : escapeSlackMrkdwnSegment(token));
    lastIndex = matchIndex + token.length;
  }

  out.push(escapeSlackMrkdwnSegment(text.slice(lastIndex)));
  return out.join("");
}

// Slack mrkdwn renders a pair of bare `~` as strikethrough (single tilde, not
// `~~`). Models routinely emit `~` as shorthand for "approximately" (`~$12K`,
// `~85%`, `~300`), and Slack greedily pairs those stray tildes, striking through
// everything between them. Backslash-escaping (`\~`) is unreliable on outbound
// bot messages, so we deterministically replace literal ASCII tildes in normal
// text with the visually identical Unicode tilde operator (U+223C), which Slack
// never treats as a strikethrough delimiter. This runs ONLY on non-code text:
// genuine strikethrough is emitted via Slack style markers (not text), and code
// span interiors (`~/path`) are routed through escapeSlackMrkdwnCode instead, so
// neither is affected. Applied fleet-wide to every Slack tenant via this shared
// outbound formatter.
const SLACK_TILDE_OPERATOR = "\u223c";

function neutralizeStraySlackTildes(text: string): string {
  return text.includes("~") ? text.replace(/~/g, SLACK_TILDE_OPERATOR) : text;
}

function escapeSlackMrkdwnText(text: string): string {
  if (!text) {
    return "";
  }
  if (!text.includes("&") && !text.includes("<") && !text.includes(">") && !text.includes("~")) {
    return text;
  }

  return text
    .split("\n")
    .map((line) => {
      if (line.startsWith("> ")) {
        return `> ${neutralizeStraySlackTildes(escapeSlackMrkdwnContent(line.slice(2)))}`;
      }
      return neutralizeStraySlackTildes(escapeSlackMrkdwnContent(line));
    })
    .join("\n");
}

// Code-span interiors must keep literal `~` (e.g. `~/projects`, regex, ranges).
// Slack does NOT apply mrkdwn formatting inside backtick code spans, so a tilde
// there is harmless and must be preserved verbatim. We still HTML-escape so
// angle brackets / ampersands stay literal.
function escapeSlackMrkdwnCode(text: string): string {
  if (!text) {
    return "";
  }
  if (!text.includes("&") && !text.includes("<") && !text.includes(">")) {
    return text;
  }
  return text
    .split("\n")
    .map((line) => {
      if (line.startsWith("> ")) {
        return `> ${escapeSlackMrkdwnContent(line.slice(2))}`;
      }
      return escapeSlackMrkdwnContent(line);
    })
    .join("\n");
}

function buildSlackLink(link: MarkdownLinkSpan, text: string) {
  const href = link.href.trim();
  if (!href) {
    return null;
  }
  const label = text.slice(link.start, link.end);
  const trimmedLabel = label.trim();
  const comparableHref = href.startsWith("mailto:") ? href.slice("mailto:".length) : href;
  const useMarkup =
    trimmedLabel.length > 0 && trimmedLabel !== href && trimmedLabel !== comparableHref;
  if (!useMarkup) {
    return null;
  }
  const safeHref = escapeSlackMrkdwnSegment(href);
  return {
    start: link.start,
    end: link.end,
    open: `<${safeHref}|`,
    close: ">",
  };
}

type SlackMarkdownOptions = {
  tableMode?: MarkdownTableMode;
};

function buildSlackRenderOptions() {
  return {
    styleMarkers: {
      bold: { open: "*", close: "*" },
      italic: { open: "_", close: "_" },
      strikethrough: { open: "~", close: "~" },
      code: { open: "`", close: "`" },
      code_block: { open: "```\n", close: "```" },
    },
    escapeText: escapeSlackMrkdwnText,
    escapeCode: escapeSlackMrkdwnCode,
    buildLink: buildSlackLink,
  };
}

export function markdownToSlackMrkdwn(
  markdown: string,
  options: SlackMarkdownOptions = {},
): string {
  const ir = markdownToIR(markdown ?? "", {
    linkify: false,
    autolink: false,
    headingStyle: "bold",
    blockquotePrefix: "> ",
    tableMode: options.tableMode,
  });
  return renderMarkdownWithMarkers(ir, buildSlackRenderOptions());
}

export function normalizeSlackOutboundText(markdown: string): string {
  return markdownToSlackMrkdwn(markdown ?? "");
}

export function markdownToSlackMrkdwnChunks(
  markdown: string,
  limit: number,
  options: SlackMarkdownOptions = {},
): string[] {
  const ir = markdownToIR(markdown ?? "", {
    linkify: false,
    autolink: false,
    headingStyle: "bold",
    blockquotePrefix: "> ",
    tableMode: options.tableMode,
  });
  const renderOptions = buildSlackRenderOptions();
  return renderMarkdownIRChunksWithinLimit({
    ir,
    limit,
    renderChunk: (chunk) => renderMarkdownWithMarkers(chunk, renderOptions),
    measureRendered: (rendered) => rendered.length,
  }).map(({ rendered }) => rendered);
}
