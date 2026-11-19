import type { ReactNode } from "react";
import { pageFeedNote, type CollectionOption } from "@/utils/organize";
import { collectionWithPath, type ImportDestination } from "@/utils/import-destination";

/**
 * Destination choice for the Browser import: a new collection named after
 * this import (default), an existing collection, or a new named collection.
 * The visible "Import into" heading is the wizard's step title.
 */
export function DestinationPicker({
  value,
  onChange,
  importedName,
  options,
  onPage,
  loading = false,
  disabled = false,
}: {
  value: ImportDestination;
  /** The default destination's name: the one the import will create. */
  importedName: string;
  onChange: (next: ImportDestination) => void;
  options: CollectionOption[];
  /** How many live pages show each collection: an import into one is public there. */
  onPage: Map<string, number>;
  loading?: boolean;
  disabled?: boolean;
}) {
  const chosen = value.kind === "existing" ? collectionWithPath(options, value.id) : null;
  return (
    <fieldset disabled={disabled}>
      <legend className="sr-only">Import into</legend>
      <div className="flex flex-col gap-2">
        <Choice
          label={`A new collection for this import, “${importedName}”`}
          checked={value.kind === "imported"}
          onSelect={() => onChange({ kind: "imported" })}
        />
        <Choice
          label="An existing collection"
          checked={value.kind === "existing"}
          onSelect={() => onChange({ kind: "existing" })}
        >
          {value.kind === "existing" && (
            <>
            <select
              aria-label="Destination collection"
              value={value.id ?? ""}
              onChange={(e) =>
                onChange({ kind: "existing", id: e.target.value || undefined })
              }
              className="mt-2 w-full truncate rounded-xl border border-emerald-100 bg-white/85 px-3 py-2 text-left text-sm shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:border-emerald-900/70 dark:bg-slate-950/80"
            >
              <option value="">
                {loading ? "Loading collections…" : "Choose a collection…"}
              </option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {/* The chosen one is not indented: closed, the select shows the start of its name. */}
                  {"\u00A0".repeat(o.id === value.id ? 0 : o.depth * 3) + o.name + (onPage.has(o.id) ? " · on a page" : "")}
                </option>
              ))}
            </select>
            {chosen && (
              // The native select cuts a long name; here it is in full, with where it sits.
              <p className="mt-1.5 break-words text-sm text-slate-600 dark:text-slate-300">
                {chosen.name}
                {chosen.path && <span className="block text-xs">in {chosen.path}</span>}
              </p>
            )}
            {pageFeedNote(onPage.get(value.id ?? ""), "import") && (
              <p role="note" className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                {pageFeedNote(onPage.get(value.id ?? ""), "import")}
              </p>
            )}
            </>
          )}
        </Choice>
        <Choice
          label="A new collection I name"
          checked={value.kind === "new"}
          onSelect={() => onChange({ kind: "new", name: "" })}
        >
          {value.kind === "new" && (
            <input
              type="text"
              aria-label="New collection name"
              value={value.name}
              maxLength={100}
              autoFocus
              placeholder="Collection name"
              onChange={(e) => onChange({ kind: "new", name: e.target.value })}
              className="mt-2 w-full rounded-xl border border-emerald-100 bg-white/85 px-3 py-2 text-sm shadow-sm placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:border-emerald-900/70 dark:bg-slate-950/80 dark:placeholder:text-slate-400"
            />
          )}
        </Choice>
      </div>
    </fieldset>
  );
}

function Choice({
  label,
  checked,
  onSelect,
  children,
}: {
  label: string;
  checked: boolean;
  onSelect: () => void;
  children?: ReactNode;
}) {
  return (
    <div>
      <label
        className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition ${
          checked
            ? "border-emerald-300 bg-emerald-50 text-emerald-950 shadow-sm dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-100"
            : "border-transparent text-slate-700 hover:bg-white/80 dark:text-slate-300 dark:hover:bg-white/5"
        }`}
      >
        <input
          type="radio"
          name="import-destination"
          checked={checked}
          onChange={onSelect}
          className="h-4 w-4 shrink-0 accent-emerald-700 dark:accent-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <span className="min-w-0 break-words font-medium">{label}</span>
      </label>
      {children && <div className="pl-7">{children}</div>}
    </div>
  );
}
