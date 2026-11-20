/**
 * Pure model for the Browser import destination choice: where the imported
 * tree attaches. Every import lands in a collection, so the success screen
 * can link to it. Default is a new collection named after the moment of the
 * import ("Imported Nov 1, 2026, 3:42 PM"), so each run gets its own; the
 * other options are an existing collection or a new named collection.
 */

export type ImportDestination =
  | { kind: "imported" }
  // gone: the collection that was chosen is no longer in the loaded list.
  | { kind: "existing"; id?: string; gone?: true }
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
 * the Import button stays disabled. `importedName` is the default
 * destination's name, made once per run so the label and the import agree.
 */
export function destinationArgFor(
  destination: ImportDestination,
  importedName: string,
): DestinationArg | null {
  switch (destination.kind) {
    case "imported":
      return { type: "create", name: importedName };
    case "new": {
      const name = destination.name.trim();
      return name ? { type: "create", name } : null;
    }
    case "existing":
      return destination.id ? { type: "collection", id: destination.id } : null;
  }
}

/** What the preview calls the destination, for the folders that merge straight into it. */
export function destinationName(
  destination: ImportDestination,
  importedName: string,
  options: { id: string; name: string; depth: number }[],
): string {
  switch (destination.kind) {
    case "imported":
      return importedName;
    case "new":
      return destination.name.trim() || "the new collection";
    case "existing":
      return collectionWithPath(options, destination.id)?.name ?? "the collection you choose";
  }
}

/**
 * A collection's name and its parent path ("Research / Grid storage"; empty
 * at the top level), from the options in tree order with their depths.
 */
export function collectionWithPath(
  options: { id: string; name: string; depth: number }[],
  id: string | undefined,
): { name: string; path: string } | null {
  const index = options.findIndex((o) => o.id === id);
  if (index < 0) return null;
  const parents: string[] = [];
  // Walking back, the first option at each shallower depth is an ancestor.
  for (let i = index - 1, depth = options[index].depth; i >= 0 && depth > 0; i--) {
    if (options[i].depth < depth) {
      parents.unshift(options[i].name);
      depth = options[i].depth;
    }
  }
  return { name: options[index].name, path: parents.join(" / ") };
}

export type ReadState = "loading" | "failed" | "ready";

export const COLLECTION_GONE = "That collection is no longer available. Choose where to import again.";

/**
 * Whether Import may run, or the reason shown beside the button. The one
 * decision behind the button's state and the submit guard: an existing
 * destination counts only once it is in the loaded collections, so a retry
 * in flight can't send a tree planned without the destination's depth.
 */
export function importReadiness({
  destination,
  collections,
  livePages,
  selection,
}: {
  destination: ImportDestination;
  /** The loaded collections, or why there are none. */
  collections: "loading" | "failed" | readonly { id: string }[];
  livePages: ReadState;
  /** Taken so the rule is in one place: the plan only feeds a warning and never holds an import back. */
  plan: ReadState;
  selection: "none" | "nothing-importable" | "some";
}): { ready: true } | { ready: false; reason: string; /** Resolves by itself: shown with a spinner. */ waiting: boolean } {
  const no = (reason: string, waiting = false) => ({ ready: false as const, reason, waiting });
  if (selection === "none") return no("Select at least one folder");
  if (selection === "nothing-importable") return no("These folders have no bookmarks that can be imported.");
  if (destination.kind === "imported") return { ready: true };
  if (destination.kind === "new") {
    return destination.name.trim() ? { ready: true } : no("Name the new collection.");
  }
  if (collections === "loading") return no("Loading your collections…", true);
  if (collections === "failed") return no("Your collections didn’t load: retry in step 2, or import into a new collection.");
  if (!destination.id) return no(destination.gone ? COLLECTION_GONE : "Choose a collection to import into.");
  if (!collections.some((c) => c.id === destination.id)) return no(COLLECTION_GONE);
  // An import into a collection on a live page is public: not before its notice can appear.
  if (livePages === "loading") return no("Waiting for the live-page check in step 2.", true);
  if (livePages === "failed") return no("The live-page check failed: retry it in step 2.");
  return { ready: true };
}
