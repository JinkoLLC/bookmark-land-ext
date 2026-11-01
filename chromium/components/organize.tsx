import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { ConvexError } from "convex/values";
import { buildCollectionOptions, suggestTags } from "@/utils/organize";
import { CollectionGlyph, Chevron } from "@/components/collection-glyph";

/**
 * Organize-after-save: collection picker, tag editor with suggestions, and
 * favorite toggle for the Bookmark that Quick save just produced. Every edit
 * applies immediately through existing mutations — closing the popup
 * mid-edit keeps the save and all applied edits.
 */
export function OrganizeSection({ bookmarkId }: { bookmarkId: Id<"bookmarks"> }) {
  const bookmark = useQuery(api.bookmarks.get, { id: bookmarkId });

  if (!bookmark) return null;

  return (
    <div className="flex flex-col gap-2 border-b border-neutral-200 pb-3 dark:border-neutral-800">
      <div className="flex items-center gap-2">
        <CollectionPicker
          bookmarkId={bookmarkId}
          collectionId={bookmark.collectionId}
        />
        <FavoriteToggle bookmarkId={bookmarkId} isFavorite={bookmark.isFavorite} />
      </div>
      <TagEditor bookmarkId={bookmarkId} />
    </div>
  );
}

function CollectionPicker({
  bookmarkId,
  collectionId,
}: {
  bookmarkId: Id<"bookmarks">;
  collectionId?: Id<"collections">;
}) {
  const collections = useQuery(api.collections.list);
  const move = useMutation(api.bookmarkMutations.moveToCollection);
  const [open, setOpen] = useState(false);
  const options = buildCollectionOptions(collections ?? []);
  const selected = options.find((o) => o.id === collectionId);

  const choose = (id?: Id<"collections">) => {
    setOpen(false);
    void move({ id: bookmarkId, collectionId: id });
  };

  // Mimics the web app's collection picker: glyph + name trigger, then an
  // indented list of the full hierarchy with each collection's icon/emoji.
  return (
    <div className="relative min-w-0 flex-1">
      <button
        type="button"
        aria-label={`Collection: ${selected?.name ?? "Unsorted"}`}
        aria-expanded={open}
        disabled={collections === undefined}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md border border-neutral-300 px-2 py-1 text-left hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        <CollectionGlyph icon={selected?.icon} color={selected?.color} />
        <span className="min-w-0 flex-1 truncate">
          {selected?.name ?? "Unsorted"}
        </span>
        <Chevron open={open} className="h-3 w-3 opacity-50" />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close collection list"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-neutral-200 bg-white p-1 shadow-md dark:border-neutral-700 dark:bg-neutral-900">
            <button
              type="button"
              aria-pressed={!selected}
              onClick={() => choose(undefined)}
              className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 ${!selected ? "font-medium" : ""}`}
            >
              <CollectionGlyph />
              Unsorted
            </button>
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                aria-pressed={o.id === collectionId}
                onClick={() => choose(o.id as Id<"collections">)}
                style={{ paddingLeft: 8 + o.depth * 12 }}
                className={`flex w-full items-center gap-2 rounded py-1 pr-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 ${o.id === collectionId ? "font-medium" : ""}`}
                title={o.name}
              >
                <CollectionGlyph
                  icon={o.icon}
                  color={o.color}
                  className="h-3.5 w-3.5"
                />
                <span className="min-w-0 flex-1 truncate">{o.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FavoriteToggle({
  bookmarkId,
  isFavorite,
}: {
  bookmarkId: Id<"bookmarks">;
  isFavorite: boolean;
}) {
  const toggle = useMutation(api.bookmarkMutations.toggleFavorite);
  return (
    <button
      type="button"
      onClick={() => void toggle({ id: bookmarkId })}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      title={isFavorite ? "Remove from favorites" : "Add to favorites"}
      className="rounded-md border border-neutral-300 px-2 py-1 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-ring dark:border-neutral-700 dark:hover:bg-neutral-800"
    >
      {isFavorite ? "★" : "☆"}
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

  const currentNames = (currentTags ?? []).map((t) => t.name);
  const suggestions = suggestTags(allTags ?? [], input, currentNames);

  const describe = (e: unknown, fallback: string) =>
    e instanceof ConvexError && typeof e.data === "string" ? e.data : fallback;

  const add = async (name: string) => {
    const tagName = name.trim();
    if (!tagName) return;
    setError(null);
    try {
      await addTag({ bookmarkId, tagName });
      setInput("");
    } catch (e) {
      setError(describe(e, "Couldn't add that tag."));
    }
  };

  const remove = async (tagId: Id<"tags">) => {
    setError(null);
    try {
      await removeTag({ bookmarkId, tagId });
    } catch (e) {
      setError(describe(e, "Couldn't remove that tag."));
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {(currentTags ?? []).map((tag) => (
          <span
            key={tag._id}
            className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800"
          >
            {tag.name}
            <button
              type="button"
              aria-label={`Remove tag ${tag.name}`}
              onClick={() => void remove(tag._id)}
              className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              ×
            </button>
          </span>
        ))}
        <input
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
          placeholder={currentNames.length ? "Add tag" : "Add tags…"}
          className="min-w-24 flex-1 rounded-md border border-neutral-300 bg-transparent px-2 py-1 focus-visible:outline-2 focus-visible:outline-ring dark:border-neutral-700"
        />
        <datalist id="tag-suggestions">
          {suggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </div>
      {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
