import { ConvexError } from "convex/values";

/**
 * Silent saves (context menu) report outcomes without a popup: success shows
 * through the Saved-page indicator; failures park a pending-error record that
 * the popup surfaces (with retry) the next time it opens.
 */

export const PENDING_ERROR_KEY = "bookmark-land:pending-silent-error";

export interface PendingSilentError {
  url: string;
  kind: "limit" | "retryable";
  limit?: number;
}

/** Maps a silent-save exception to the pending-error record the popup will
 * surface. Mirrors Quick save's error mapping. */
export function pendingErrorFrom(
  url: string,
  error: unknown,
): PendingSilentError {
  if (error instanceof ConvexError && typeof error.data === "string") {
    const match = /^BOOKMARK_LIMIT_REACHED:(\d+)$/.exec(error.data);
    if (match) {
      return { url, kind: "limit", limit: Number(match[1]) };
    }
  }
  return { url, kind: "retryable" };
}

/** Type guard for records read back from extension storage. */
export function isPendingSilentError(
  value: unknown,
): value is PendingSilentError {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.url === "string" &&
    (v.kind === "limit" || v.kind === "retryable")
  );
}
