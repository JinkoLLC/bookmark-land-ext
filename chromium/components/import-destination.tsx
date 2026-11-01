import type { ReactNode } from "react";
import type { CollectionOption } from "@/utils/organize";
import {
  importedCollectionName,
  type ImportDestination,
} from "@/utils/import-destination";

/**
 * Destination choice for the Browser import: a new collection named after
 * this import (default), an existing collection, or a new named collection.
 * The visible "Import into" heading is the wizard's step title.
 */
export function DestinationPicker({
  value,
  onChange,
  options,
  loading = false,
  disabled = false,
}: {
  value: ImportDestination;
  onChange: (next: ImportDestination) => void;
  options: CollectionOption[];
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <fieldset
      disabled={disabled}
      className="disabled:opacity-50"
    >
      <legend className="sr-only">Import into</legend>
      <div className="flex flex-col gap-2">
        <Choice
          label={`A new collection for this import, “${importedCollectionName(new Date())}”`}
          checked={value.kind === "imported"}
          onSelect={() => onChange({ kind: "imported" })}
        />
        <Choice
          label="An existing collection"
          checked={value.kind === "existing"}
          onSelect={() => onChange({ kind: "existing" })}
        >
          {value.kind === "existing" && (
            <select
              aria-label="Destination collection"
              value={value.id ?? ""}
              onChange={(e) =>
                onChange({ kind: "existing", id: e.target.value || undefined })
              }
              className="mt-2 w-full rounded-xl border border-emerald-100 bg-white/85 px-3 py-2 text-sm shadow-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 dark:border-emerald-900/70 dark:bg-slate-950/80 dark:focus:ring-emerald-900"
            >
              <option value="">
                {loading ? "Loading collections…" : "Choose a collection…"}
              </option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {"\u00A0".repeat(o.depth * 3) + o.name}
                </option>
              ))}
            </select>
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
              className="mt-2 w-full rounded-xl border border-emerald-100 bg-white/85 px-3 py-2 text-sm shadow-sm outline-none placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 dark:border-emerald-900/70 dark:bg-slate-950/80 dark:focus:ring-emerald-900"
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
          className="h-4 w-4 accent-emerald-600"
        />
        <span className="font-medium">{label}</span>
      </label>
      {children && <div className="pl-7">{children}</div>}
    </div>
  );
}
