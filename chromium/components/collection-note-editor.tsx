import { useCallback, useState, type ReactNode } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  CheckSquare,
  Heading2,
  Italic,
  LinkIcon,
  List,
  ListOrdered,
} from "lucide-react";
import { normalizeCollectionNoteHtml } from "@/utils/collection-note-html";

// Must match the limit the backend enforces.
const COLLECTION_NOTES_LIMIT = 20_000;

const BookmarkLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      bookmarkId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-bookmark-id"),
        renderHTML: (attributes) => {
          if (!attributes.bookmarkId) return {};
          return { "data-bookmark-id": attributes.bookmarkId };
        },
      },
    };
  },
});

export function CollectionNoteEditor({
  collectionId,
  collectionName,
  initialHtml,
  onCancel,
  onSaved,
}: {
  collectionId: Id<"collections">;
  collectionName: string;
  initialHtml: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const updateCollection = useMutation(api.collectionMutations.update);
  const [htmlLength, setHtmlLength] = useState(
    normalizeCollectionNoteHtml(initialHtml).length,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: false,
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      BookmarkLink.configure({
        openOnClick: false,
        protocols: ["http", "https", "mailto"],
        validate: (href: string) => /^(https?:|mailto:)/i.test(href),
        HTMLAttributes: { class: "tiptap-link", rel: "noopener noreferrer" },
      }),
      Placeholder.configure({
        placeholder: "Add notes, checklists, or bookmark links...",
      }),
    ],
    content: initialHtml,
    editable: true,
    onUpdate: ({ editor: activeEditor }) => {
      setHtmlLength(normalizedHtml(activeEditor).length);
      setError(null);
    },
  });

  const save = useCallback(async () => {
    if (!editor || isSaving) return;
    const notes = normalizedHtml(editor);
    if (notes.length > COLLECTION_NOTES_LIMIT) {
      setError(
        `Notes cannot exceed ${COLLECTION_NOTES_LIMIT.toLocaleString()} characters.`,
      );
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await updateCollection({ id: collectionId, notes });
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(
        message.includes("PRO_REQUIRED")
          ? "Collection notes require an active Pro plan."
          : "Couldn’t save this note. Please retry.",
      );
    } finally {
      setIsSaving(false);
    }
  }, [collectionId, editor, isSaving, onSaved, updateCollection]);

  const tooLong = htmlLength > COLLECTION_NOTES_LIMIT;

  return (
    <section className="fixed inset-0 z-40 flex flex-col bg-neutral-50 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-50">
      <header className="border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <p className="truncate text-sm font-semibold">{collectionName}</p>
        <p className="text-xs text-neutral-500">Editing collection note</p>
      </header>

      <Toolbar editor={editor} />

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <div className="tiptap-extension-editor rounded-lg border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
          <EditorContent editor={editor} />
        </div>
      </div>

      {error && (
        <p className="border-t border-red-200 px-3 py-2 text-xs text-red-600 dark:border-red-900 dark:text-red-400">
          {error}
        </p>
      )}

      <footer className="flex items-center gap-2 border-t border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <span
          className={`mr-auto text-xs ${
            tooLong ? "font-semibold text-red-600 dark:text-red-400" : "text-neutral-500"
          }`}
        >
          {htmlLength.toLocaleString()} / {COLLECTION_NOTES_LIMIT.toLocaleString()}
        </span>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-semibold hover:bg-neutral-100 disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!editor || isSaving || tooLong}
          className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
      </footer>
    </section>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  const setLink = useCallback(() => {
    if (!editor) return;
    const previousHref = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("Link URL", previousHref ?? "https://");
    if (href === null) return;

    const trimmed = href.trim();
    if (!trimmed) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    if (!/^(https?:|mailto:)/i.test(trimmed)) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
  }, [editor]);

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-neutral-200 px-2 py-1 dark:border-neutral-800">
      <ToolButton
        active={editor?.isActive("bold") ?? false}
        disabled={!editor}
        label="Bold"
        onClick={() => editor?.chain().focus().toggleBold().run()}
      >
        <Bold className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        active={editor?.isActive("italic") ?? false}
        disabled={!editor}
        label="Italic"
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        active={editor?.isActive("heading", { level: 2 }) ?? false}
        disabled={!editor}
        label="Heading"
        onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="h-4 w-4" />
      </ToolButton>
      <span className="mx-1 h-4 w-px bg-neutral-300 dark:bg-neutral-700" />
      <ToolButton
        active={editor?.isActive("bulletList") ?? false}
        disabled={!editor}
        label="Bullet list"
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      >
        <List className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        active={editor?.isActive("orderedList") ?? false}
        disabled={!editor}
        label="Ordered list"
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        active={editor?.isActive("taskList") ?? false}
        disabled={!editor}
        label="Checklist"
        onClick={() => editor?.chain().focus().toggleTaskList().run()}
      >
        <CheckSquare className="h-4 w-4" />
      </ToolButton>
      <span className="mx-1 h-4 w-px bg-neutral-300 dark:bg-neutral-700" />
      <ToolButton
        active={editor?.isActive("link") ?? false}
        disabled={!editor}
        label="Link"
        onClick={setLink}
      >
        <LinkIcon className="h-4 w-4" />
      </ToolButton>
    </div>
  );
}

function ToolButton({
  active,
  disabled,
  label,
  onClick,
  children,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md p-1.5 disabled:opacity-50 ${
        active
          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-950"
          : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
      }`}
    >
      {children}
    </button>
  );
}

function normalizedHtml(editor: Editor): string {
  return normalizeCollectionNoteHtml(editor.getHTML());
}
