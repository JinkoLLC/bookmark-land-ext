import type { Id } from "@convex/dataModel";
import { browser } from "wxt/browser";
import type { TreeNode } from "../shared/tree";
import { CollectionGlyph, Chevron, RadioIcon } from "@/components/collection-glyph";
import type { CollectionMenuState } from "@/components/collection-menu";

/**
 * A row of the collection tree. A focused row is raised so the selected
 * neighbour's fill can't cover its ring.
 */
export const treeRowClass = (isSelected: boolean) =>
  `relative flex min-h-7 cursor-default items-center gap-1 rounded border-l-2 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
    isSelected
      ? "border-primary bg-primary/10 font-medium"
      : "border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800"
  }`;

/** A pointer-only 24 px control inside a row; the keyboard route is the row's keys and menu. */
const ROW_ICON =
  "flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded hover:bg-neutral-200 dark:hover:bg-neutral-700";

/** The row menu for a collection, opened at a point of the panel. */
export const collectionMenuAt = (node: TreeNode, x: number, y: number): CollectionMenuState => ({
  id: node._id,
  name: node.name,
  publishedUrl: node.shareToken
    ? `${import.meta.env.WXT_WEB_APP_URL}/shared/${node.shareSlug ?? node.shareToken}`
    : undefined,
  x,
  y,
});

/** One collection row in the Library panel tree (recursive). */
export function CollectionRow({
  node,
  selected,
  tabStop,
  onSelect,
  onToggle,
  onMenu,
}: {
  node: TreeNode;
  selected: Id<"collections"> | null;
  /** The one row that is in the Tab order (roving tabindex). */
  tabStop: Id<"collections"> | null;
  onSelect: (id: Id<"collections">) => void;
  onToggle: (id: Id<"collections">, isExpanded: boolean) => void;
  onMenu: (menu: CollectionMenuState) => void;
}) {
  const hasChildren = node.children.length > 0;
  const { publishedUrl } = collectionMenuAt(node, 0, 0);
  return (
    <>
      <div
        role="treeitem"
        aria-level={node.depth + 1}
        aria-selected={selected === node._id}
        aria-expanded={hasChildren ? node.isExpanded : undefined}
        tabIndex={tabStop === node._id ? 0 : -1}
        onClick={() => onSelect(node._id)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onMenu(collectionMenuAt(node, e.clientX, e.clientY));
        }}
        className={treeRowClass(selected === node._id)}
      >
        <div style={{ width: node.depth * 6 }} className="shrink-0" />
        <span
          aria-hidden="true"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node._id, !node.isExpanded);
          }}
          className={`${ROW_ICON} text-neutral-500 dark:text-neutral-400 ${hasChildren ? "" : "invisible"}`}
        >
          <Chevron open={node.isExpanded} />
        </span>
        <CollectionGlyph icon={node.icon} color={node.color} />
        {/* Positioned so the visually hidden end of the name is clipped with it. */}
        <span className="relative min-w-0 flex-1 truncate" title={node.name}>
          {node.name}
          <span className="sr-only">
            , {node.bookmarkCount} {node.bookmarkCount === 1 ? "bookmark" : "bookmarks"}
            {publishedUrl && ", published"}
          </span>
        </span>
        {publishedUrl && (
          // Not a button: a tree row can't contain one. The row's name says
          // "published" and its menu has "Open published collection".
          <span
            aria-hidden="true"
            title="Open published collection"
            onClick={(e) => {
              e.stopPropagation();
              void browser.tabs.create({ url: publishedUrl });
            }}
            className={`${ROW_ICON} text-green-700 dark:text-green-400`}
          >
            <RadioIcon />
          </span>
        )}
        <span aria-hidden="true" className="shrink-0 pr-1 text-xs text-neutral-600 dark:text-neutral-400">
          {node.bookmarkCount}
        </span>
      </div>
      {hasChildren && node.isExpanded && (
        <div role="group">
          {node.children.map((child) => (
            <CollectionRow
              key={child._id}
              node={child}
              selected={selected}
              tabStop={tabStop}
              onSelect={onSelect}
              onToggle={onToggle}
              onMenu={onMenu}
            />
          ))}
        </div>
      )}
    </>
  );
}
