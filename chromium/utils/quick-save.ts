import { ConvexError } from "convex/values";

/** Mirrors server-side LIMITS — titles are truncated client-side so a long
 * tab title never fails the save. */
const MAX_TITLE_LENGTH = 100;
const MAX_URL_LENGTH = 2048;

/** Convex bookmark id, kept as an opaque string in pure code. */
type BookmarkId = string;

export type QuickSaveState =
  | { status: "saving" }
  | { status: "saved"; bookmarkId: BookmarkId }
  | { status: "restored"; existingTitle: string; bookmarkId: BookmarkId }
  /** Already active in the library — the popup edits it directly. */
  | { status: "already-saved"; bookmarkId: BookmarkId }
  | { status: "unsupported" }
  | { status: "error"; kind: "limit"; limit: number }
  | { status: "error"; kind: "retryable" };

/**
 * What the popup shows. Saving is a two-step flow: the popup first CHECKS
 * the page (never writes on open), then the user explicitly adds it.
 */
export type QuickSaveView =
  | { kind: "checking" }
  | { kind: "unsupported" }
  /** Page can be added — the create mutation remains duplicate-safe. */
  | { kind: "ready" }
  /** Already a Bookmark — straight to edit mode, no Add step. */
  | { kind: "already-saved"; bookmarkId: BookmarkId }
  /** The user clicked Add — the save flow's own states take over. */
  | { kind: "save-flow"; state: QuickSaveState };

/** Derives the popup view. Precedence: an in-progress/finished save flow
 * wins; then tab readiness; then the saved-state lookup. */
export function deriveQuickSaveView(input: {
  /** undefined = still resolving; null = not a saveable page */
  tab: { url: string; title?: string } | null | undefined;
  /** undefined = lookup in flight or skipped; null = not saved */
  existing: { bookmarkId: BookmarkId } | null | undefined;
  saveState: QuickSaveState | null;
}): QuickSaveView {
  if (input.saveState) return { kind: "save-flow", state: input.saveState };
  if (input.tab === undefined) return { kind: "checking" };
  if (input.tab === null) return { kind: "unsupported" };
  if (input.existing) {
    return { kind: "already-saved", bookmarkId: input.existing.bookmarkId };
  }
  return { kind: "ready" };
}

/** Only regular web pages are saveable — browser-internal pages
 * (chrome://, about:, file:, chrome-extension://, …) are not. */
export function isSaveableUrl(url: string | undefined): url is string {
  if (!url || url.length > MAX_URL_LENGTH) return false;
  return url.startsWith("https://") || url.startsWith("http://");
}

/** Builds the create-mutation args from the active tab, trimming and
 * truncating the title to the server's limit and omitting it when empty. */
export function prepareSaveArgs(tab: { url: string; title?: string }): {
  url: string;
  title?: string;
} {
  const title = tab.title?.trim().slice(0, MAX_TITLE_LENGTH);
  return title ? { url: tab.url, title } : { url: tab.url };
}

/** Maps the create mutation's result union onto a popup state. */
export function stateFromResult(result: {
  duplicate: boolean;
  restored?: boolean;
  existingTitle?: string;
  bookmarkId: BookmarkId;
}): QuickSaveState {
  if (result.restored) {
    return {
      status: "restored",
      existingTitle: result.existingTitle ?? "",
      bookmarkId: result.bookmarkId,
    };
  }
  if (result.duplicate) {
    return { status: "already-saved", bookmarkId: result.bookmarkId };
  }
  return { status: "saved", bookmarkId: result.bookmarkId };
}

/** Maps a thrown error onto a popup state. The plan-limit error carries
 * `BOOKMARK_LIMIT_REACHED:<limit>` as ConvexError data; everything else
 * (offline, rate limit, unknown) is retryable. */
export function stateFromError(error: unknown): QuickSaveState {
  if (error instanceof ConvexError && typeof error.data === "string") {
    const match = /^BOOKMARK_LIMIT_REACHED:(\d+)$/.exec(error.data);
    if (match) {
      return { status: "error", kind: "limit", limit: Number(match[1]) };
    }
  }
  return { status: "error", kind: "retryable" };
}
