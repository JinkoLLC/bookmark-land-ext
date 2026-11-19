export function normalizeCollectionNoteHtml(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return "";
  if (/^<p>(?:\s|<br\s*\/?>|&nbsp;)*<\/p>$/i.test(trimmed)) return "";
  return html;
}

/** What the note editor can write; the reader renders these and nothing else. */
export const NOTE_READER_TAGS = new Set([
  "h2", "h3", "p", "ul", "ol", "li", "strong", "em", "s", "u", "code", "pre",
  "blockquote", "br", "hr", "a",
  // A task item is li > label > input + span, then a div with the text.
  "label", "input", "span", "div",
]);

/** The link target when it is one the editor accepts, else null. */
export function safeNoteHref(href: string | null): string | null {
  const trimmed = href?.trim() ?? "";
  return /^(https?:|mailto:)/i.test(trimmed) ? trimmed : null;
}
