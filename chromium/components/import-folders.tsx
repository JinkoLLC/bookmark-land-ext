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
  merged: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  const isExcluded = parentExcluded || excluded.has(node.id);
  return (
    <div style={{ paddingLeft: `${depth * 16}px` }}>
      <FolderCheckbox
        id={node.id}
        label={node.title || "Untitled"}
        excluded={excluded}
        parentExcluded={parentExcluded}
        onToggle={onToggle}
        mergedNote={merged.has(node.id)}
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
  mergedNote,
}: {
  id: string;
  label: string;
  excluded: ReadonlySet<string>;
  parentExcluded: boolean;
  onToggle: (id: string) => void;
  bold?: boolean;
  mergedNote?: boolean;
}) {
  return (
    <label
      className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm transition hover:bg-emerald-50 dark:hover:bg-white/5 ${
        parentExcluded ? "opacity-50" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={!parentExcluded && !excluded.has(id)}
        disabled={parentExcluded}
        onChange={() => onToggle(id)}
        className="h-4 w-4 accent-emerald-600"
      />
      <span className={`min-w-0 flex-1 truncate ${bold ? "font-semibold" : ""}`}>
        {label}
      </span>
      {mergedNote && (
        <span className="text-xs text-slate-500 dark:text-slate-400">
          (beyond the 5-level limit — bookmarks merge into the nearest kept
          folder)
        </span>
      )}
    </label>
  );
}
