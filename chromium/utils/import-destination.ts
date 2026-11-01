/**
 * Pure model for the Browser import destination choice: where the imported
 * tree attaches. Every import lands in a collection, so the success screen
 * can link to it. Default is a new collection named after the moment of the
 * import ("Imported Nov 1, 2026, 3:42 PM"), so each run gets its own; the
 * other options are an existing collection or a new named collection.
 */

export type ImportDestination =
  | { kind: "imported" }
  | { kind: "existing"; id?: string }
  | { kind: "new"; name: string };

/** Shape of the importTree action's `destination` argument. */
export type DestinationArg =
  | { type: "create"; name: string }
  | { type: "collection"; id: string };

export const DEFAULT_DESTINATION: ImportDestination = { kind: "imported" };

/** Name of the default destination for an import started at `now`. */
export function importedCollectionName(now: Date): string {
  const when = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(now);
  return `Imported ${when}`;
}

/**
 * Collection depth at which imported TOP-LEVEL folders would sit, for the
 * preview's depth-flattening. `depthOf` resolves an existing collection's
 * depth; an unresolved/unpicked existing destination is treated like a
 * top-level one so the preview doesn't jump while the user is choosing.
 */
export function destinationBaseDepth(
  destination: ImportDestination,
  depthOf: (id: string) => number | undefined,
): number {
  switch (destination.kind) {
    case "imported":
    case "new":
      return 1;
    case "existing": {
      if (!destination.id) return 1;
      const depth = depthOf(destination.id);
      return depth === undefined ? 1 : depth + 1;
    }
  }
}

/**
 * Maps the UI choice to the action argument. Returns null while the choice
 * is incomplete (no collection picked yet / blank new-collection name) —
 * the Import button stays disabled. `now` names the default destination.
 */
export function destinationArgFor(
  destination: ImportDestination,
  now: Date = new Date(),
): DestinationArg | null {
  switch (destination.kind) {
    case "imported":
      return { type: "create", name: importedCollectionName(now) };
    case "new": {
      const name = destination.name.trim();
      return name ? { type: "create", name } : null;
    }
    case "existing":
      return destination.id ? { type: "collection", id: destination.id } : null;
  }
}
