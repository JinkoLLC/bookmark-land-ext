import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/api";
import { browser } from "wxt/browser";
import { REFRESH_BADGE_MESSAGE } from "@/utils/messages";
import {
  PENDING_ERROR_KEY,
  isPendingSilentError,
  type PendingSilentError,
} from "@/utils/silent-save";

/**
 * Surfaces a failed silent save (context menu) the next time the popup
 * opens, with a retry. The record lives in storage.session until the retry
 * succeeds or the user dismisses it.
 */
export function PendingErrorBanner() {
  const [pending, setPending] = useState<PendingSilentError | null>(null);
  const [retryFailed, setRetryFailed] = useState(false);
  const createBookmark = useMutation(api.bookmarkMutations.create);

  useEffect(() => {
    void browser.storage.session
      .get(PENDING_ERROR_KEY)
      .then((items: Record<string, unknown>) => {
        const value = items[PENDING_ERROR_KEY];
        if (isPendingSilentError(value)) setPending(value);
      });
  }, []);

  if (!pending) return null;

  const clear = async () => {
    await browser.storage.session.remove(PENDING_ERROR_KEY);
    setPending(null);
  };

  const retry = async () => {
    setRetryFailed(false);
    try {
      await createBookmark({ url: pending.url, skipDuplicates: true });
      await clear();
      browser.runtime.sendMessage({ type: REFRESH_BADGE_MESSAGE }).catch(() => {});
    } catch {
      setRetryFailed(true);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-red-300 p-2 dark:border-red-900">
      <p className="font-medium text-red-600 dark:text-red-400">
        {pending.kind === "limit"
          ? `A save failed: you've reached your plan's limit of ${pending.limit} bookmarks.`
          : "A save from the right-click menu failed."}
      </p>
      <p className="truncate text-neutral-500" title={pending.url}>
        {pending.url}
      </p>
      {retryFailed && (
        <p className="text-red-600 dark:text-red-400">Retry failed — still can&apos;t save.</p>
      )}
      <div className="flex gap-2">
        {pending.kind === "retryable" && (
          <button
            type="button"
            onClick={() => void retry()}
            className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring"
          >
            Retry
          </button>
        )}
        <button
          type="button"
          onClick={() => void clear()}
          className="rounded-md border border-neutral-300 px-3 py-1.5 font-medium hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-ring dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
