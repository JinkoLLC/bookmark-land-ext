import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { Doc } from "@convex/dataModel";
import { browser } from "wxt/browser";
import { ArrowLeft, BookOpen, ExternalLink, PencilLine } from "lucide-react";
import { CollectionGlyph } from "@/components/collection-glyph";

type NoteCollection = Pick<
  Doc<"collections">,
  "_id" | "name" | "icon" | "color" | "notes"
>;

type NoteMode = "strip" | "full" | "edit";

const CollectionNoteEditor = lazy(() =>
  import("@/components/collection-note-editor").then((module) => ({
    default: module.CollectionNoteEditor,
  })),
);

export function CollectionNotesPanel({
  collection,
  canAddNotes = false,
}: {
  collection?: NoteCollection | null;
  canAddNotes?: boolean;
}) {
  const noteText = useMemo(
    () => plainTextFromHtml(collection?.notes ?? ""),
    [collection?.notes],
  );
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<NoteMode>("strip");

  useEffect(() => {
    setExpanded(false);
    setMode("strip");
  }, [collection?._id]);

  // What is shown: the reader closes by itself when its note is deleted elsewhere.
  const view: NoteMode =
    !collection || (mode === "full" && !noteText) ? "strip" : mode;

  // The reader and the editor cover the panel: nothing behind them can be
  // focused or clicked, and closing one returns focus to the control that
  // opened it (or to the strip, when that control is gone).
  useEffect(() => {
    if (view === "strip") return;
    const covered = [
      ...document.querySelectorAll<HTMLElement>("main > :not([data-note-view])"),
    ];
    for (const element of covered) element.inert = true;
    return () => {
      for (const element of covered) element.inert = false;
      (
        document.querySelector<HTMLElement>(`[data-note-action="${view}"]`) ??
        document.querySelector<HTMLElement>("[data-note-action]")
      )?.focus();
    };
  }, [view]);

  if (!collection) return null;

  const openWeb = () => {
    void browser.tabs.create({
      url: `${import.meta.env.WXT_WEB_APP_URL}/collections/${collection._id}?notes=edit`,
    });
  };

  if (view === "edit") {
    return (
      <Suspense fallback={<EditorLoadingFallback />}>
        <CollectionNoteEditor
          key={collection._id}
          collectionId={collection._id}
          collectionName={collection.name}
          initialHtml={collection.notes ?? ""}
          onCancel={() => setMode("strip")}
          onSaved={() => setMode("strip")}
        />
      </Suspense>
    );
  }

  if (!noteText) {
    return canAddNotes ? (
      <AddNotePrompt collection={collection} onEdit={() => setMode("edit")} />
    ) : null;
  }

  if (view === "full") {
    return (
      <FullPageReader
        collection={collection}
        noteText={noteText}
        onBack={() => setMode("strip")}
        onEdit={() => setMode("edit")}
        onOpenWeb={openWeb}
      />
    );
  }

  return (
    <PinnedStrip
      collection={collection}
      noteText={noteText}
      expanded={expanded}
      onToggle={() => setExpanded((value) => !value)}
      onViewFull={() => setMode("full")}
      onEdit={() => setMode("edit")}
      onOpenWeb={openWeb}
    />
  );
}

function EditorLoadingFallback() {
  return (
    <section
      data-note-view
      className="fixed inset-0 z-40 flex items-center justify-center bg-neutral-50 text-sm text-neutral-500 dark:bg-neutral-950 dark:text-neutral-400"
    >
      Loading note editor…
    </section>
  );
}

const FILLED_BUTTON =
  "inline-flex min-h-6 shrink-0 items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const OUTLINE_BUTTON =
  "inline-flex min-h-6 items-center gap-1 rounded-md border border-neutral-300 px-2 py-1 text-xs font-semibold hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:border-neutral-700 dark:hover:bg-neutral-800";

/** One line, so the bookmark list keeps its rows. */
function AddNotePrompt({
  collection,
  onEdit,
}: {
  collection: NoteCollection;
  onEdit: () => void;
}) {
  return (
    <section className="mx-2 flex min-h-7 items-center gap-2 pl-2">
      <PencilLine
        className="h-4 w-4 shrink-0 text-neutral-500 dark:text-neutral-400"
        aria-hidden="true"
      />
      <p className="min-w-0 flex-1 truncate" title={`Add a note for ${collection.name}`}>
        Add a note for {collection.name}
      </p>
      <button type="button" data-note-action="edit" onClick={onEdit} className={FILLED_BUTTON}>
        Add note
      </button>
    </section>
  );
}

function PinnedStrip({
  collection,
  noteText,
  expanded,
  onToggle,
  onViewFull,
  onEdit,
  onOpenWeb,
}: {
  collection: NoteCollection;
  noteText: string;
  expanded: boolean;
  onToggle: () => void;
  onViewFull: () => void;
  onEdit: () => void;
  onOpenWeb: () => void;
}) {
  return (
    <section className="mx-2 overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
      <button
        type="button"
        data-note-action="toggle"
        aria-expanded={expanded}
        onClick={onToggle}
        // 26 px + the border: a 28 px row when collapsed.
        className="flex h-[26px] w-full items-center gap-2 rounded-md px-2 text-left hover:bg-neutral-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring dark:hover:bg-neutral-800"
      >
        <CollectionGlyph icon={collection.icon} color={collection.color} className="h-4 w-4" />
        <span className="min-w-0 flex-1 truncate font-medium">
          Note for {collection.name}
        </span>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {expanded ? "Hide" : "Read"}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-neutral-200 p-2 dark:border-neutral-800">
          {/* Clamped, not scrolled: "View full note" shows the rest. */}
          <p className="line-clamp-6 whitespace-pre-wrap leading-5 text-neutral-700 dark:text-neutral-300">
            {noteText}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" data-note-action="full" onClick={onViewFull} className={FILLED_BUTTON}>
              <BookOpen className="h-3 w-3" aria-hidden="true" />
              View full note
            </button>
            <button type="button" data-note-action="edit" onClick={onEdit} className={OUTLINE_BUTTON}>
              Edit
            </button>
            <button type="button" onClick={onOpenWeb} className={OUTLINE_BUTTON}>
              Open in bookmark.land
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function FullPageReader({
  collection,
  noteText,
  onBack,
  onEdit,
  onOpenWeb,
}: {
  collection: NoteCollection;
  noteText: string;
  onBack: () => void;
  onEdit: () => void;
  onOpenWeb: () => void;
}) {
  return (
    <section
      data-note-view
      className="fixed inset-0 z-40 flex flex-col bg-neutral-50 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-50"
    >
      <header className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <button
          type="button"
          autoFocus
          onClick={onBack}
          className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-50"
          aria-label="Back to note preview"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <CollectionGlyph icon={collection.icon} color={collection.color} className="h-4 w-4" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{collection.name}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Collection note</p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onOpenWeb}
          className="inline-flex min-h-6 items-center gap-1 rounded-md border border-neutral-300 px-2 py-1 text-xs font-semibold hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:border-neutral-700 dark:hover:bg-neutral-900"
          aria-label="Open note in bookmark.land"
        >
          <ExternalLink className="h-3 w-3" />
        </button>
      </header>
      <article
        // Scrolls: reachable and scrollable from the keyboard.
        tabIndex={0}
        aria-label={`Note for ${collection.name}`}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <div className="mx-auto max-w-prose">
          <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-700 dark:text-neutral-200">
            {noteText}
          </p>
        </div>
      </article>
    </section>
  );
}

function plainTextFromHtml(html: string): string {
  if (!html.trim()) return "";
  // Linear scan: a backtracking `<[a-z][\s\S]*>` is quadratic on repeated `<a`.
  const tagStart = html.search(/<[a-z]/i);
  if (tagStart === -1 || html.indexOf(">", tagStart) === -1) {
    return html.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  doc
    .querySelectorAll("h1,h2,h3,p,li")
    .forEach((element) => element.append("\n"));
  return (doc.body.textContent ?? "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
