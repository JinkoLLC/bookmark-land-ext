export function normalizeCollectionNoteHtml(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return "";
  if (/^<p>(?:\s|<br\s*\/?>|&nbsp;)*<\/p>$/i.test(trimmed)) return "";
  return html;
}
