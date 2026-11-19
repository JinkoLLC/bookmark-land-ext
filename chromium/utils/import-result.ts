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
      // The skipped count and its cause are the subtext's; said once.
      return `Only ${added} ${result.imported + result.restored === 1 ? "was" : "were"} imported`;
    case "already-here":
      return "Already all here";
    case "nothing":
      return "Nothing was imported";
  }
}

/** `planLimit`: the plan's bookmark limit, when the library is at it after the import. */
export function importSubtext(result: ImportResult, planLimit: number | null = null): string {
  const outcome = importOutcome(result);
  if (outcome === "imported")
    return "Your library just grew. Everything is searchable on bookmark.land and in the Library panel.";
  if (outcome === "already-here")
    return "Every bookmark you picked was already in your library, so nothing new was added.";
  // Two facts side by side, not a cause: the result doesn't say why each bookmark was skipped.
  if (planLimit !== null) {
    // "other": apart from the restored and already-saved ones the counts line lists.
    const other = result.restored + result.duplicates > 0 ? "other " : "";
    return `${formatCount(result.skipped)} ${other}bookmark${result.skipped === 1 ? " wasn't" : "s weren't"} imported. Your library is at its ${formatCount(planLimit)}-bookmark limit.`;
  }
  // "partial" counts the rest of the selection, "nothing" counts bookmarks.
  const skipped = outcome === "partial" ? formatCount(result.skipped) : bookmarks(result.skipped);
  const could = `${skipped} could not be imported.`;
  return outcome === "partial"
    ? `${could} What came over is searchable on bookmark.land and in the Library panel.`
    : could;
}

/** The counts line: only the counts that aren't zero. The skipped count is
 * left out: the subtext always states it. */
export function importCounts(result: ImportResult): string[] {
  const parts: [number, string][] = [
    [result.imported, "new"],
    [result.restored, "restored from Trash"],
    [result.duplicates, "already in your library"],
  ];
  return parts.filter(([n]) => n > 0).map(([n, label]) => `${formatCount(n)} ${label}`);
}

/**
 * The plan's limit, when it is worth stating beside the skips: some were
 * skipped and the library's live count has reached the limit after the
 * import. Skips below the limit have another cause, so it isn't mentioned.
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

/**
 * The rows of the sample list, from the bookmarks that were sent. Only a
 * complete import shows it: the sample is drawn from the selection, so after
 * skips it could list bookmarks that didn't come over. One row per address
 * (the same page can sit in two folders) and per title.
 */
export function importSample<T extends { url: string; title?: string }>(
  result: ImportResult,
  sent: readonly T[],
  size: number,
): T[] {
  if (importOutcome(result) !== "imported") return [];
  // By address, then by the title a row shows: a sample needn't say one thing twice.
  const byUrl = new Map(sent.map((b) => [b.url, b])).values();
  const unique = [...new Map([...byUrl].map((b) => [b.title?.trim() || b.url, b])).values()];
  return unique.slice(0, Math.min(size, result.imported + result.restored));
}
