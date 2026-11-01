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
