import type { NativeNode } from "@/utils/import-tree";

/** Recursive folder checkbox tree for the Browser import preview. */
export function FolderNode({
  node,
  depth,
  excluded,
  parentExcluded,
  merged,
  onToggle,
}: {
  node: NativeNode;
  depth: number;
  excluded: ReadonlySet<string>;
  parentExcluded: boolean;
  /** Merged folder id -> the name of the collection its bookmarks go into. */
  merged: Readonly<Record<string, string>>;
  onToggle: (id: string) => void;
}) {
  const isExcluded = parentExcluded || excluded.has(node.id);
  return (
    // One step per level (the divs nest), and none past the levels a
    // collection tree can have: deeper rows would leave a phone's screen.
    <div className={depth <= 5 ? "pl-4" : ""}>
      <FolderCheckbox
        id={node.id}
        label={node.title || "Untitled"}
        excluded={excluded}
        parentExcluded={parentExcluded}
        onToggle={onToggle}
        mergesInto={merged[node.id]}
      />
      {(node.children ?? [])
        .filter((c) => c.url === undefined)
        .map((f) => (
          <FolderNode
            key={f.id}
            node={f}
            depth={depth + 1}
            excluded={excluded}
            parentExcluded={isExcluded}
            merged={merged}
            onToggle={onToggle}
          />
        ))}
    </div>
  );
}

export function FolderCheckbox({
  id,
  label,
  excluded,
  parentExcluded,
  onToggle,
  bold,
  mergesInto,
}: {
  id: string;
  label: string;
  excluded: ReadonlySet<string>;
  parentExcluded: boolean;
  onToggle: (id: string) => void;
  bold?: boolean;
  /** Set for a folder beyond the nesting limit: where its bookmarks go. */
  mergesInto?: string;
}) {
  return (
    <label
      className={`flex items-start gap-2 rounded-lg px-2 py-1 text-sm transition hover:bg-emerald-50 dark:hover:bg-white/5 ${
        // Muted, not faded: the text of an unticked branch stays readable.
        parentExcluded ? "text-slate-500 dark:text-slate-400" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={!parentExcluded && !excluded.has(id)}
        disabled={parentExcluded}
        onChange={() => onToggle(id)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />
      <span className="min-w-0 flex-1">
        <span className={`block break-words ${bold ? "font-semibold" : ""}`}>{label}</span>
        {mergesInto && (
          <span className="block break-words text-xs text-slate-600 dark:text-slate-300">
            merges into {mergesInto}
          </span>
        )}
      </span>
    </label>
  );
}
