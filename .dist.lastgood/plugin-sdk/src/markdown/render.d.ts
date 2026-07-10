import type { MarkdownIR, MarkdownLinkSpan, MarkdownStyle } from "./ir.js";
export type RenderStyleMarker = {
  open: string;
  close: string;
};
export type RenderStyleMap = Partial<Record<MarkdownStyle, RenderStyleMarker>>;
export type RenderLink = {
  start: number;
  end: number;
  open: string;
  close: string;
};
export type RenderOptions = {
  styleMarkers: RenderStyleMap;
  escapeText: (text: string) => string;
  /**
   * Optional escaper applied to literal text rendered INSIDE a code or
   * code_block span. Defaults to `escapeText` when omitted, so callers that do
   * not distinguish code interiors keep their existing behavior. Channels whose
   * `escapeText` mutates characters that are literal inside code (e.g. Slack
   * neutralizing `~` to avoid accidental strikethrough) should supply this to
   * preserve code-span content such as `~/path`.
   */
  escapeCode?: (text: string) => string;
  buildLink?: (link: MarkdownLinkSpan, text: string) => RenderLink | null;
};
export declare function renderMarkdownWithMarkers(ir: MarkdownIR, options: RenderOptions): string;
