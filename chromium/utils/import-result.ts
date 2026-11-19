/**
 * What the Browser import's success screen shows and links to, from the
 * importTree action's result. Pure so the link choice is testable.
 */

export interface ImportResult {
  /** Bookmarks sent in this import (not the library's size). */
  total?: number;
  imported: number;
  restored: number;
  duplicates: number;
  skipped: number;
  /** Absent on a backend that predates the field. */
  destinationId?: string;
  /** Top-level collections the import's folders became, in tree order.
   * Absent on a backend that predates the field. */
  collections?: { id: string; name: string }[];
}

export interface ImportLinks {
  /** The big "See my imported bookmarks" target (a web app path). */
  primaryPath: string;
  /** Every collection the import created at the top, to list as links. */
  collections: { name: string; path: string }[];
}

const collectionPath = (id: string) => `/collections/${id}`;

/**
 * The imported bookmarks live in the destination's subcollections (one per
 * browser folder), and a collection page lists only its own bookmarks, so
 * the primary link opens the first imported collection. With none (an old
 * backend, or every folder merged into the destination) it opens the
 * destination, and failing that the library.
 */
export function importLinks(result: ImportResult): ImportLinks {
  const collections = (result.collections ?? []).map((c) => ({
    name: c.name,
    path: collectionPath(c.id),
  }));
  const primaryPath =
    collections[0]?.path ??
    (result.destinationId ? collectionPath(result.destinationId) : "/dashboard");
  return { primaryPath, collections };
}

export const formatCount = (n: number) => n.toLocaleString("en-US");

const bookmarks = (n: number) => `${formatCount(n)} bookmark${n === 1 ? "" : "s"}`;

/**
 * The four endings of an import: everything arrived ("imported", the only
 * festive one), some arrived and some were skipped ("partial"), nothing new
 * and nothing skipped ("already-here"), nothing new but some skipped
 * ("nothing").
 */
export type ImportOutcome = "imported" | "partial" | "already-here" | "nothing";

export function importOutcome(result: ImportResult): ImportOutcome {
  const added = result.imported + result.restored;
  if (added > 0) return result.skipped > 0 ? "partial" : "imported";
  return result.skipped > 0 ? "nothing" : "already-here";
}

export function importHeading(result: ImportResult): string {
  const added = bookmarks(result.imported + result.restored);
  switch (importOutcome(result)) {
    case "imported":
      return `${added} imported`;
    case "partial":
      return `${added} imported, ${formatCount(result.skipped)} could not be imported`;
    case "already-here":
      return "Already all here";
    case "nothing":
      return "Nothing was imported";
  }
}

export function importSubtext(result: ImportResult): string {
  switch (importOutcome(result)) {
    case "imported":
      return "Your library just grew. Everything is searchable on bookmark.land and in the Library panel.";
    case "partial":
      return "What came over is searchable on bookmark.land and in the Library panel.";
    case "already-here":
      return "Every bookmark you picked was already in your library, so nothing new was added.";
    case "nothing":
      return `${bookmarks(result.skipped)} could not be imported.`;
  }
}

/** The counts line: only the counts that aren't zero. */
export function importCounts(result: ImportResult): string[] {
  const parts: [number, string][] = [
    [result.imported, "new"],
    [result.restored, "restored from Trash"],
    [result.duplicates, "already in your library"],
    [result.skipped, "could not be imported"],
  ];
  return parts.filter(([n]) => n > 0).map(([n, label]) => `${formatCount(n)} ${label}`);
}

/**
 * The plan's limit, when it explains the skips: some were skipped and the
 * library's live count has reached the limit after the import. Skips below
 * the limit have another cause, so the limit isn't blamed for them.
 */
export function reachedPlanLimit(
  result: ImportResult,
  library: { bookmarkCount: number; limit: number } | null | undefined,
): number | null {
  if (!library || result.skipped === 0) return null;
  return library.bookmarkCount >= library.limit ? library.limit : null;
}

/** The sample is drawn from the selection, so it is only called "what came
 * over" when every picked bookmark did. */
export function sampleTitle(result: ImportResult): string {
  return result.skipped > 0 || result.duplicates > 0
    ? "Some of what you picked"
    : "Some of what came over";
}
