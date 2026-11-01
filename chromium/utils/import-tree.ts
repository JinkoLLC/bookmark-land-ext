import { isSaveableUrl } from "./quick-save";

/**
 * Pure mapping from the native browser bookmark tree to the Browser import
 * payload. Pinned semantics:
 *
 * - Every non-empty native root (bookmarks bar, other, mobile) is a
 *   toggleable section. Top-level folders under a root become top-level
 *   Collections; subfolders become subcollections.
 * - Loose bookmarks sitting directly on a root are gathered into a synthetic
 *   collection named after that root.
 * - Non-web schemes are excluded upfront and counted.
 * - Folders nested beyond the 5-level collection limit don't become
 *   collections; their bookmarks merge into the deepest ancestor within the
 *   limit (depth 4). The preview marks those folders as merged.
 * - Excluding a folder (or root) excludes its entire subtree.
 * - Bookmarks are emitted in the tree's depth-first order — the order the
 *   allowance is consumed in.
 */

/** Subset of chrome.bookmarks.BookmarkTreeNode the mapping needs. */
export interface NativeNode {
  id: string;
  title: string;
  url?: string;
  children?: NativeNode[];
}

export interface PayloadFolder {
  key: string;
  name: string;
  parentKey?: string;
}

export interface PayloadBookmark {
  url: string;
  title?: string;
  folderKey?: string;
}

export interface ImportModel {
  folders: PayloadFolder[];
  bookmarks: PayloadBookmark[];
  importableCount: number;
  excludedSchemeCount: number;
  /** Folder ids (native) beyond the depth limit, merged into an ancestor —
   * the preview marks these. */
  mergedFolderIds: string[];
}

const MAX_DEPTH = 5; // collections may nest 5 levels: depths 0..4

/**
 * Builds the import payload from the native roots (the children of the
 * browser's invisible root node), honoring the excluded-id set. Roots are
 * excluded the same way as folders (by their native id).
 *
 * `baseDepth` is the collection depth at which imported top-level folders
 * would sit (0 = library root; 1 = inside a top-level destination
 * collection; …). Folders that would land beyond the limit merge exactly
 * like over-deep folders do.
 */
export function buildImportModel(
  roots: NativeNode[],
  excludedIds: ReadonlySet<string>,
  baseDepth = 0,
): ImportModel {
  const folders: PayloadFolder[] = [];
  const bookmarks: PayloadBookmark[] = [];
  const mergedFolderIds: string[] = [];
  let excludedSchemeCount = 0;

  const emitBookmark = (node: NativeNode, folderKey: string | undefined) => {
    if (!isSaveableUrl(node.url)) {
      excludedSchemeCount += 1;
      return;
    }
    bookmarks.push({
      url: node.url,
      title: node.title.trim() ? node.title : undefined,
      folderKey,
    });
  };

  // depth = collection depth the folder WOULD get (top-level folder = 0).
  // ancestry = payload keys of within-limit ancestors, nearest last.
  const walkFolder = (
    node: NativeNode,
    parentKey: string | undefined,
    depth: number,
    nearestWithinLimitKey: string | undefined,
  ) => {
    if (excludedIds.has(node.id)) return;

    const withinLimit = baseDepth + depth < MAX_DEPTH;
    let ownKey: string | undefined;
    if (withinLimit) {
      ownKey = node.id;
      folders.push({ key: ownKey, name: node.title || "Untitled", parentKey });
    } else {
      mergedFolderIds.push(node.id);
      ownKey = nearestWithinLimitKey;
    }

    for (const child of node.children ?? []) {
      if (child.url !== undefined) {
        emitBookmark(child, ownKey);
      } else {
        walkFolder(
          child,
          withinLimit ? ownKey : nearestWithinLimitKey,
          depth + 1,
          withinLimit ? ownKey : nearestWithinLimitKey,
        );
      }
    }
  };

  for (const root of roots) {
    if (excludedIds.has(root.id)) continue;
    const children = root.children ?? [];
    if (children.length === 0) continue;

    // Loose bookmarks directly on the root → synthetic root-named folder,
    // created lazily so empty selections don't produce empty collections.
    // When even top-level folders are beyond the limit (deep destination),
    // loose bookmarks fall through to the destination itself.
    let rootFolderKey: string | undefined;
    let rootMarkedMerged = false;
    const ensureRootFolder = () => {
      if (baseDepth >= MAX_DEPTH) {
        if (!rootMarkedMerged) {
          rootMarkedMerged = true;
          mergedFolderIds.push(root.id);
        }
        return undefined;
      }
      if (!rootFolderKey) {
        rootFolderKey = `root:${root.id}`;
        folders.push({
          key: rootFolderKey,
          name: root.title || "Imported",
        });
      }
      return rootFolderKey;
    };

    for (const child of children) {
      if (child.url !== undefined) {
        if (!isSaveableUrl(child.url)) {
          excludedSchemeCount += 1;
          continue;
        }
        emitBookmark(child, ensureRootFolder());
      } else {
        walkFolder(child, undefined, 0, undefined);
      }
    }
  }

  return {
    folders,
    bookmarks,
    importableCount: bookmarks.length,
    excludedSchemeCount,
    mergedFolderIds,
  };
}
