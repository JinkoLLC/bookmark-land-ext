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

export const formatCount = (n: number) => n.toLocaleString();

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
  // All of them restored: the heading says so, and no line repeats the number.
  const verb = result.imported === 0 ? "restored from Trash" : "imported";
  switch (importOutcome(result)) {
    case "imported":
      return `${added} ${verb}`;
    case "partial":
      return `${added} ${verb}, ${formatCount(result.skipped)} could not be imported`;
    case "already-here":
      return "Already all here";
    case "nothing":
      return "Nothing was imported";
  }
}

/**
 * The lines under the heading, only those that apply. Each count is said
 * once on the screen, so a line never repeats a number the heading gave.
 * `planLimit`: the plan's bookmark limit, when the library is at it after the import.
 */
export function importLines(result: ImportResult, planLimit: number | null = null): string[] {
  const outcome = importOutcome(result);
  const lines: string[] = [];
  if (outcome === "imported")
    lines.push("Your library just grew. Everything is searchable on bookmark.land and in the Library panel.");
  if (outcome === "nothing") lines.push(`${bookmarks(result.skipped)} could not be imported.`);
  // Only a mix needs the split: all new or all restored, the heading is the whole story.
  if (result.imported > 0 && result.restored > 0)
    lines.push(`Imported: ${formatCount(result.imported)} new · ${formatCount(result.restored)} restored from Trash`);
  if (result.duplicates > 0)
    lines.push(`${formatCount(result.duplicates)} ${result.duplicates === 1 ? "was" : "were"} already in your library.`);
  // A fact beside the skips, not their cause: the result doesn't say why each was skipped.
  if (planLimit !== null) lines.push(`Your library is at its ${formatCount(planLimit)}-bookmark limit.`);
  return lines;
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

/** The sample is drawn from the selection, so it is only called "what was
 * imported" when every picked bookmark was. */
export function sampleTitle(result: ImportResult): string {
  return result.skipped > 0 || result.duplicates > 0
    ? "Some of what you picked"
    : "Some of what was imported";
}

/**
 * The rows of the sample list, from the bookmarks that were sent. Only a
 * complete import shows it: the sample is drawn from the selection, so after
 * skips it could list bookmarks that weren't imported. One row per address
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
