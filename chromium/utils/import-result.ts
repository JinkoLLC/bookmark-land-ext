/**
 * What the Browser import's success screen shows and links to, from the
 * importTree action's result. Pure so the link choice is testable.
 */

export interface ImportResult {
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

/** Whether anything new reached the library (the festive case). */
export function importAddedAnything(result: ImportResult): boolean {
  return result.imported + result.restored > 0;
}
