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

  if (!collection) return null;

  const openWeb = () => {
    void browser.tabs.create({
      url: `${import.meta.env.WXT_WEB_APP_URL}/collections/${collection._id}?notes=edit`,
    });
  };

  if (mode === "edit") {
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
      <AddNotePrompt
        collection={collection}
        onEdit={() => setMode("edit")}
        onOpenWeb={openWeb}
      />
    ) : null;
  }

  if (mode === "full") {
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
    <section className="fixed inset-0 z-40 flex items-center justify-center bg-neutral-50 text-sm text-neutral-500 dark:bg-neutral-950 dark:text-neutral-400">
      Loading note editor…
    </section>
  );
}

function AddNotePrompt({
  collection,
  onEdit,
  onOpenWeb,
}: {
  collection: NoteCollection;
  onEdit: () => void;
  onOpenWeb: () => void;
}) {
  return (
    <section className="mx-2 mb-2 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/70 p-3 text-emerald-950 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/35 dark:text-emerald-50">
      <div className="flex items-start gap-2">
        <div className="rounded-lg bg-white/80 p-1.5 text-emerald-700 dark:bg-emerald-900/70 dark:text-emerald-200">
          <PencilLine className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Add a note for {collection.name}</p>
          <p className="mt-1 text-xs leading-5 text-emerald-900/75 dark:text-emerald-100/75">
            Keep context, checklists, or reminders attached to this collection.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
        >
          Add note
        </button>
        <button
          type="button"
          onClick={onOpenWeb}
          className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white/70 px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900"
        >
          Open in bookmark.land
          <ExternalLink className="h-3 w-3" />
        </button>
      </div>
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
    <section className="mx-2 mb-2 overflow-hidden rounded-lg border border-sky-200 bg-sky-50 text-sky-950 shadow-sm dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-50">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-sky-100/70 dark:hover:bg-sky-900/60"
      >
        <CollectionGlyph icon={collection.icon} color={collection.color} className="h-4 w-4" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          Note for {collection.name}
        </span>
        <span className="text-xs text-sky-700 dark:text-sky-300">
          {expanded ? "Hide" : "Read"}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-sky-200 px-3 py-3 dark:border-sky-900">
          <p className="max-h-40 overflow-y-auto whitespace-pre-wrap pr-1 text-sm leading-5 text-sky-900/85 dark:text-sky-100/80">
            {noteText}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onViewFull}
              className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2 py-1 text-xs font-semibold text-white hover:bg-sky-500"
            >
              <BookOpen className="h-3 w-3" />
              View full note
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1 rounded-md border border-sky-300 bg-white/70 px-2 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200 dark:hover:bg-sky-900"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onOpenWeb}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100 dark:text-sky-300 dark:hover:bg-sky-900"
            >
              Open in web
              <ExternalLink className="h-3 w-3" />
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
    <section className="fixed inset-0 z-40 flex flex-col bg-neutral-50 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-50">
      <header className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-50"
          aria-label="Back to note preview"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <CollectionGlyph icon={collection.icon} color={collection.color} className="h-4 w-4" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{collection.name}</p>
          <p className="text-xs text-neutral-500">Collection note</p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onOpenWeb}
          className="inline-flex items-center gap-1 rounded-md border border-neutral-300 px-2 py-1 text-xs font-semibold hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
          aria-label="Open note in bookmark.land"
        >
          <ExternalLink className="h-3 w-3" />
        </button>
      </header>
      <article className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
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
