/**
 * Pure helpers for the popup's organize-after-save section.
 * The collection options builder is a popup-sized stand-in for the web app's
 * tree builder; the Library panel uses the full one in shared/.
 */

export interface CollectionLike {
  _id: string;
  name: string;
  parentId?: string;
  order: number;
  icon?: string;
  color?: string;
}

export interface CollectionOption {
  id: string;
  name: string;
  depth: number;
  icon?: string;
  color?: string;
}

/** Flattens collections into tree order (children under parents, siblings by
 * `order` then name) with depth for indentation. Orphaned subtrees (parent
 * missing from the list) are dropped — they aren't selectable anyway. */
export function buildCollectionOptions(
  collections: CollectionLike[],
): CollectionOption[] {
  const byParent = new Map<string | undefined, CollectionLike[]>();
  for (const c of collections) {
    const list = byParent.get(c.parentId) ?? [];
    list.push(c);
    byParent.set(c.parentId, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }

  const out: CollectionOption[] = [];
  const walk = (parentId: string | undefined, depth: number) => {
    for (const c of byParent.get(parentId) ?? []) {
      out.push({ id: c._id, name: c.name, depth, icon: c.icon, color: c.color });
      walk(c._id, depth + 1);
    }
  };
  walk(undefined, 0);
  return out;
}

/** A row of the popup's collection picker. No id = Unsorted. */
export interface PickerRow {
  id?: string;
  name: string;
  /** Names of the collections above it, outermost first; "" at the top level. */
  path: string;
  icon?: string;
  color?: string;
}

/** The picker's flat rows: Unsorted first, then the collections in tree order,
 * each nested one with its parent path (which tells same-named ones apart). */
export function pickerRows(collections: CollectionLike[]): PickerRow[] {
  const byId = new Map(collections.map((c) => [c._id, c]));
  const pathOf = (id: string) => {
    const names: string[] = [];
    // Options are reachable from a root, so this walk ends.
    for (let c = byId.get(byId.get(id)?.parentId ?? ""); c; c = byId.get(c.parentId ?? "")) {
      names.unshift(c.name);
    }
    return names.join(" / ");
  };
  return [
    { name: "Unsorted", path: "" },
    ...buildCollectionOptions(collections).map(({ id, name, icon, color }) => ({
      id,
      name,
      path: pathOf(id),
      icon,
      color,
    })),
  ];
}

/** Rows whose name or parent path contains the filter text. */
export function filterPickerRows(rows: PickerRow[], text: string): PickerRow[] {
  const q = text.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q));
}

export interface CollectionFeed {
  collectionId: string;
  pages: unknown[];
}

/** How many live pages show each collection: a bookmark saved into one is public there. */
export function livePageCounts(feeds: CollectionFeed[] | undefined): Map<string, number> {
  return new Map((feeds ?? []).map((feed) => [feed.collectionId, feed.pages.length]));
}

/** The warning for a collection that live pages show; undefined when none does. */
export function pageFeedNote(count: number | undefined, what: "bookmark" | "import"): string | undefined {
  if (!count) return undefined;
  const pages = count === 1 ? "1 live page" : `${count} live pages`;
  return what === "bookmark"
    ? `This bookmark appears on ${pages}: its title, site and link.`
    : `Bookmarks imported into this collection appear on ${pages}: each title, site and link.`;
}

/** Ranks tag suggestions for the input: prefix matches first, then substring
 * matches, alphabetical within each group; tags already on the bookmark are
 * excluded. Empty input suggests nothing (the datalist would just be noise). */
export function suggestTags(
  allTags: { name: string }[],
  input: string,
  currentTagNames: string[],
  limit = 8,
): string[] {
  const q = input.trim().toLowerCase();
  if (!q) return [];
  const current = new Set(currentTagNames.map((t) => t.toLowerCase()));
  const candidates = allTags
    .map((t) => t.name)
    .filter((name) => !current.has(name.toLowerCase()));

  const prefix: string[] = [];
  const substring: string[] = [];
  for (const name of candidates) {
    const lower = name.toLowerCase();
    if (lower.startsWith(q)) prefix.push(name);
    else if (lower.includes(q)) substring.push(name);
  }
  prefix.sort();
  substring.sort();
  return [...prefix, ...substring].slice(0, limit);
}

/** The tag field after a tag was saved: cleared, unless the user has typed something newer since. */
export const inputAfterTagSaved = (current: string, submitted: string): string =>
  current === submitted ? "" : current;
