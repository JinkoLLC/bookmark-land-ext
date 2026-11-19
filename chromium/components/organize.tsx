import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useMutation, useQueries, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { ConvexError } from "convex/values";
import { Check, ChevronDown, Globe, Star, X } from "lucide-react";
import {
  filterPickerRows,
  inputAfterTagSaved,
  livePageCounts,
  pageFeedNote,
  pickerRows,
  suggestTags,
  type CollectionFeed,
  type PickerRow,
} from "@/utils/organize";
import { moveIndex } from "@/utils/list-keys";
import { MORE_BELOW, useScrollMore } from "@/hooks/use-scroll-more";
import { CollectionGlyph } from "@/components/collection-glyph";
import { StatusLine } from "@/components/status-line";

const RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const MUTED = "text-neutral-500 dark:text-neutral-400";
const OUTLINE = `rounded-md border border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800 ${RING}`;

type LivePages = {
  state: "loading" | "failed" | "ready";
  /** Live pages per collection; empty until loaded. */
  counts: Map<string, number>;
  /** Asks again after a failure, leaving the rest of the popup as it is. */
  retry: () => void;
};

const FEEDS = { feeds: { query: api.userPages.collectionFeeds, args: {} } };
const NONE = {};

/**
 * Which collections live pages show. Read with useQueries so a failed load
 * comes back as a value: the picker then keeps collections unselectable
 * instead of the whole popup falling to the error screen.
 */
function useLivePages(): LivePages {
  // A failed query keeps its error while subscribed: retrying drops the
  // subscription for one render, so the client asks the server again.
  const [dropped, setDropped] = useState(false);
  useEffect(() => {
    if (dropped) setDropped(false);
  }, [dropped]);
  const retry = () => setDropped(true);
  const feeds = useQueries(dropped ? NONE : FEEDS).feeds as CollectionFeed[] | Error | undefined;
  if (feeds instanceof Error) return { state: "failed", counts: new Map(), retry };
  return { state: feeds ? "ready" : "loading", counts: livePageCounts(feeds), retry };
}

/**
 * Organize-after-save: collection picker, tag editor with suggestions, and
 * favorite toggle for the Bookmark that Quick save just produced. Every edit
 * applies immediately through existing mutations — closing the popup
 * mid-edit keeps the save and all applied edits.
 */
export function OrganizeSection({ bookmarkId }: { bookmarkId: Id<"bookmarks"> }) {
  const bookmark = useQuery(api.bookmarks.get, { id: bookmarkId });
  const live = useLivePages();
  // A failed move or favorite change; the controls show the confirmed state.
  const [error, setError] = useState<string | null>(null);

  if (!bookmark) return null;

  return (
    <>
      <CollectionPicker
        bookmarkId={bookmarkId}
        collectionId={bookmark.collectionId}
        live={live}
        onError={setError}
      >
        <FavoriteToggle
          bookmarkId={bookmarkId}
          isFavorite={bookmark.isFavorite}
          onError={setError}
        />
      </CollectionPicker>
      {error && (
        <StatusLine tone="error" role="alert">
          {error}
        </StatusLine>
      )}
      <PageFeedNote count={live.counts.get(bookmark.collectionId ?? "")} />
      <TagEditor bookmarkId={bookmarkId} />
    </>
  );
}

/** Says that the bookmark is public, when its collection is shown on a live page. */
function PageFeedNote({ count }: { count?: number }) {
  const note = pageFeedNote(count, "bookmark");
  return note ? (
    <p role="note" className="flex gap-1.5 text-xs text-neutral-600 dark:text-neutral-300">
      <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {note}
    </p>
  ) : null;
}

/**
 * The trigger row (with `children`, the favorite toggle, beside it) and,
 * when open, an in-flow panel under it: a filter field that is the combobox
 * and a listbox of flat rows. Focus stays in the field; Up/Down move the
 * highlight, Enter chooses, Escape closes, and both return focus to the trigger.
 */
function CollectionPicker({
  bookmarkId,
  collectionId,
  live,
  onError,
  children,
}: {
  bookmarkId: Id<"bookmarks">;
  collectionId?: Id<"collections">;
  live: LivePages;
  onError: (message: string | null) => void;
  children: ReactNode;
}) {
  const collections = useQuery(api.collections.list);
  const move = useMutation(api.bookmarkMutations.moveToCollection);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  /** Highlighted row, as an index into `rows`; -1 = none. */
  const [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  /** A pointer press is under way: its click closes the panel, not the blur. */
  const pressing = useRef(false);
  const field = useRef<HTMLInputElement>(null);
  const listId = useId();
  const list = useScrollMore();

  const all = pickerRows(collections ?? []);
  const rows = filterPickerRows(all, filter);
  const selected = all.find((row) => row.id === collectionId) ?? all[0];
  // What is saved into a collection on a live page is public, so a collection
  // can't be chosen before we know (and can show) whether one is. Unsorted
  // is never on a page.
  const canChoose = (row: PickerRow) => !row.id || live.state === "ready";
  const onPage = (row: PickerRow) => !!row.id && live.counts.has(row.id);

  useEffect(() => {
    if (!open) return;
    field.current?.focus();
    panel.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);

  // A click outside closes the panel once it has landed. Closing earlier (on
  // blur or pointerdown) would unmount the in-flow panel and move what is
  // under the pointer before the click arrives.
  useEffect(() => {
    if (!open) return;
    const down = () => (pressing.current = true);
    const up = () => (pressing.current = false);
    const click = (event: MouseEvent) => {
      // The path as dispatched: a clicked control may already be gone (Retry).
      const path = event.composedPath();
      if (!path.includes(panel.current!) && !path.includes(trigger.current!)) setOpen(false);
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("click", click);
    return () => {
      pressing.current = false;
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("click", click);
    };
  }, [open]);

  const show = () => {
    setFilter("");
    setActive(Math.max(0, all.findIndex((row) => row.id === collectionId && canChoose(row))));
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  const choose = async (row: PickerRow) => {
    close();
    if (row.id === selected.id) return;
    onError(null);
    try {
      await move({ id: bookmarkId, collectionId: row.id as Id<"collections"> | undefined });
    } catch (error) {
      console.error("[extension] Move to collection failed", error);
      onError("Couldn't move it. Try again.");
    }
  };

  const onFieldKey = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = rows[active];
      if (row && canChoose(row)) void choose(row);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const choosable = rows.flatMap((row, i) => (canChoose(row) ? [i] : []));
      const next = moveIndex(event.key, choosable.indexOf(active), choosable.length);
      if (next !== null) setActive(choosable[next]);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          ref={trigger}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={collections === undefined}
          onClick={() => (open ? setOpen(false) : show())}
          className={`flex min-w-0 flex-1 items-center gap-2 px-2 py-[7px] text-left disabled:opacity-50 ${OUTLINE}`}
        >
          <CollectionGlyph icon={selected.icon} color={selected.color} />
          {/* The name is read from the content, so it starts with what is shown. */}
          <span className="min-w-0 truncate">{selected.name}</span>
          {onPage(selected) && <span className="shrink-0 text-neutral-600 dark:text-neutral-400"> · on a page</span>}
          <span className="sr-only">, collection</span>
          <ChevronDown
            className={`ml-auto h-4 w-4 shrink-0 opacity-60 motion-safe:transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
        {children}
      </div>
      {open && (
        <div
          ref={panel}
          // Focus leaving by keyboard closes at once.
          onBlur={(event) => {
            const to = event.relatedTarget;
            if (!pressing.current && to !== trigger.current && !event.currentTarget.contains(to)) setOpen(false);
          }}
          className="flex max-h-[200px] flex-col rounded-md border border-neutral-300 dark:border-neutral-700"
        >
          <input
            ref={field}
            role="combobox"
            aria-label="Filter collections"
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded
            aria-activedescendant={rows[active] ? `${listId}-${active}` : undefined}
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setActive(filterPickerRows(all, event.target.value).findIndex(canChoose));
            }}
            onKeyDown={onFieldKey}
            placeholder="Filter collections"
            // The ring is drawn inside: outside it would stick out past the panel's border and over the row below.
            className="shrink-0 rounded-md bg-transparent px-2 py-1.5 placeholder:text-neutral-500 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring dark:placeholder:text-neutral-400"
          />
          {live.state === "loading" && (
            <p role="status" className={`shrink-0 border-t border-neutral-200 px-2 py-1 text-xs dark:border-neutral-800 ${MUTED}`}>
              Checking which collections are public…
            </p>
          )}
          {live.state === "failed" && (
            <div role="alert" className="flex shrink-0 items-center gap-2 border-t border-neutral-200 px-2 py-1 text-xs dark:border-neutral-800">
              <p className="min-w-0 flex-1">Couldn&apos;t check which collections are public.</p>
              <button
                type="button"
                onClick={() => {
                  // This button goes away while the answer loads: focus stays in the panel.
                  field.current?.focus();
                  live.retry();
                }}
                className={`min-h-6 shrink-0 px-2 font-medium ${OUTLINE}`}
              >
                Retry
              </button>
            </div>
          )}
          {/* Always here, so an empty result is announced as a change to it. */}
          <p
            role="status"
            className={rows.length === 0 ? `border-t border-neutral-200 px-2 py-1.5 dark:border-neutral-800 ${MUTED}` : "sr-only"}
          >
            {rows.length === 0 && <>No collections match &quot;{filter.trim()}&quot;</>}
          </p>
          {/* Stays mounted when nothing matches: the field's aria-controls points at it. */}
          <div
            ref={list.ref}
            id={listId}
            role="listbox"
            aria-label="Collections"
            // Focus stays in the filter field; without this Chrome makes the scrolling list a Tab stop.
            tabIndex={-1}
            // Keeps focus in the filter field when a row is clicked.
            onMouseDown={(event) => event.preventDefault()}
            className={`min-h-0 overflow-y-auto ${rows.length === 0 ? "" : "border-t border-neutral-200 p-1 dark:border-neutral-800"} ${list.more ? MORE_BELOW : ""}`}
          >
            {rows.map((row, i) => (
              <div
                key={row.id ?? ""}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={row.id === selected.id}
                aria-disabled={!canChoose(row)}
                onClick={() => {
                  if (canChoose(row)) void choose(row);
                }}
                // The icon and the check sit on the name's line, whatever the path under it wraps to.
                className={`flex items-start gap-2 rounded px-2 py-1 ${
                  canChoose(row) ? "cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800" : "opacity-60"
                } ${
                  // A fill and a bar at the leading edge; the ring belongs to the filter field.
                  i === active ? "bg-neutral-100 shadow-[inset_3px_0_0_var(--ring)] dark:bg-neutral-800" : ""
                }`}
              >
                <CollectionGlyph icon={row.icon} color={row.color} className="mt-[3px] h-3.5 w-3.5" />
                <span className="min-w-0 flex-1">
                  <span className="flex gap-1">
                    {/* Two lines for the name itself, so it isn't cut while its path below wraps. */}
                    <span className={`line-clamp-2 min-w-0 break-words ${row.id === selected.id ? "font-medium" : ""}`}>{row.name}</span>
                    {onPage(row) && <span className="shrink-0 text-neutral-600 dark:text-neutral-400"> · on a page</span>}
                  </span>
                  {/* Wraps: same-named collections differ at the end of their path. */}
                  {row.path && <span className="block break-words text-xs text-neutral-600 dark:text-neutral-400"> {row.path}</span>}
                </span>
                {row.id === selected.id && <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function FavoriteToggle({
  bookmarkId,
  isFavorite,
  onError,
}: {
  bookmarkId: Id<"bookmarks">;
  isFavorite: boolean;
  onError: (message: string | null) => void;
}) {
  const toggle = useMutation(api.bookmarkMutations.toggleFavorite);
  const label = isFavorite ? "Remove from favorites" : "Add to favorites";
  const change = async () => {
    onError(null);
    try {
      await toggle({ id: bookmarkId });
    } catch (error) {
      console.error("[extension] Favorite change failed", error);
      onError("Couldn't update the favorite. Try again.");
    }
  };
  return (
    <button
      type="button"
      onClick={() => void change()}
      aria-pressed={isFavorite}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 shrink-0 items-center justify-center ${OUTLINE}`}
    >
      <Star className="h-4 w-4" fill={isFavorite ? "currentColor" : "none"} aria-hidden="true" />
    </button>
  );
}

function TagEditor({ bookmarkId }: { bookmarkId: Id<"bookmarks"> }) {
  const currentTags = useQuery(api.bookmarkTags.getTagsForBookmark, {
    bookmarkId,
  });
  const allTags = useQuery(api.tags.list);
  const addTag = useMutation(api.bookmarkTags.addTagToBookmark);
  const removeTag = useMutation(api.bookmarkTags.removeTagFromBookmark);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState("");
  const chips = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  /** Where the chip being removed sat: its neighbour takes the focus it had. */
  const removedAt = useRef<number | null>(null);

  // The removed chip took its focused button with it: focus goes to the chip
  // now in its place, or to the field after the last one.
  const ids = (currentTags ?? []).map((t) => t._id).join();
  useEffect(() => {
    const index = removedAt.current;
    removedAt.current = null;
    if (index === null || document.activeElement !== document.body) return;
    (chips.current?.querySelectorAll("button")[index] ?? field.current)?.focus();
  }, [ids]);

  const currentNames = (currentTags ?? []).map((t) => t.name);
  const suggestions = suggestTags(allTags ?? [], input, currentNames);

  const describe = (e: unknown, fallback: string) =>
    e instanceof ConvexError && typeof e.data === "string" ? e.data : fallback;

  const add = async (name: string) => {
    const tagName = name.trim();
    if (!tagName) return;
    setError(null);
    setRemoved("");
    try {
      await addTag({ bookmarkId, tagName });
      setInput((current) => inputAfterTagSaved(current, name));
    } catch (e) {
      setError(describe(e, "Couldn't add that tag."));
    }
  };

  const remove = async (tagId: Id<"tags">, name: string, index: number) => {
    setError(null);
    removedAt.current = index;
    try {
      await removeTag({ bookmarkId, tagId });
      setRemoved(`Removed tag ${name}`);
    } catch (e) {
      removedAt.current = null;
      setError(describe(e, "Couldn't remove that tag."));
    }
  };

  return (
    <>
      <div ref={chips} className="flex flex-wrap items-center gap-1.5">
        {(currentTags ?? []).map((tag, index) => (
          <span
            key={tag._id}
            className="inline-flex min-w-0 items-center rounded-full bg-neutral-100 pl-2 dark:bg-neutral-800"
          >
            <span className="truncate">{tag.name}</span>
            <button
              type="button"
              aria-label={`Remove tag ${tag.name}`}
              onClick={() => void remove(tag._id, tag.name, index)}
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100 ${RING}`}
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          ref={field}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add(input);
            }
          }}
          list="tag-suggestions"
          aria-label="Add tag"
          placeholder="Add tag"
          className={`h-9 min-w-24 flex-1 rounded-md border border-neutral-300 bg-transparent px-2 placeholder:text-neutral-500 dark:border-neutral-700 dark:placeholder:text-neutral-400 ${RING}`}
        />
        <datalist id="tag-suggestions">
          {suggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </div>
      {/* Always here, so a removal is announced as a change to it. */}
      <p role="status" className="sr-only">
        {removed}
      </p>
      {error && (
        <StatusLine tone="error" role="alert">
          {error}
        </StatusLine>
      )}
    </>
  );
}
