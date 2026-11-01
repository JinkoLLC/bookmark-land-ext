import type { Id } from "@convex/dataModel";
import { browser } from "wxt/browser";
import type { TreeNode } from "../shared/tree";
import { CollectionGlyph, Chevron, RadioIcon } from "@/components/collection-glyph";
import type { CollectionMenuState } from "@/components/collection-menu";

/** One collection row in the Library panel tree (recursive). */
export function CollectionRow({
  node,
  selected,
  onSelect,
  onToggle,
  onMenu,
}: {
  node: TreeNode;
  selected: Id<"collections"> | null;
  onSelect: (id: Id<"collections">) => void;
  onToggle: (id: Id<"collections">, isExpanded: boolean) => void;
  onMenu: (menu: CollectionMenuState) => void;
}) {
  const hasChildren = node.children.length > 0;
  return (
    <div>
      <div
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onMenu({ id: node._id, name: node.name, x: e.clientX, y: e.clientY });
        }}
        className={`flex items-center gap-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 ${selected === node._id ? "bg-neutral-100 font-medium dark:bg-neutral-800" : ""}`}
      >
        <div style={{ width: node.depth * 6 }} className="shrink-0" />
        <button
          type="button"
          aria-label={node.isExpanded ? "Collapse" : "Expand"}
          aria-expanded={node.isExpanded}
          onClick={() => onToggle(node._id, !node.isExpanded)}
          className={`shrink-0 rounded p-0.5 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700 ${hasChildren ? "" : "invisible"}`}
        >
          <Chevron open={node.isExpanded} />
        </button>
        <CollectionGlyph icon={node.icon} color={node.color} />
        <button
          type="button"
          onClick={() => onSelect(node._id)}
          className="min-w-0 flex-1 truncate py-1 text-left"
          title={node.name}
        >
          {node.name}
        </button>
        {node.shareToken && (
          <button
            type="button"
            aria-label={`Open published collection ${node.name}`}
            title="Open published collection"
            onClick={() =>
              void browser.tabs.create({
                url: `${import.meta.env.WXT_WEB_APP_URL}/shared/${node.shareSlug ?? node.shareToken}`,
              })
            }
            className="shrink-0 rounded p-0.5 text-green-500 hover:bg-neutral-200 dark:hover:bg-neutral-700"
          >
            <RadioIcon />
          </button>
        )}
        <span className="shrink-0 pr-1 text-xs text-neutral-400">
          {node.bookmarkCount}
        </span>
      </div>
      {node.isExpanded &&
        node.children.map((child) => (
          <CollectionRow
            key={child._id}
            node={child}
            selected={selected}
            onSelect={onSelect}
            onToggle={onToggle}
            onMenu={onMenu}
          />
        ))}
    </div>
  );
}
