import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/api";
import { browser } from "wxt/browser";
import { openUpgrade } from "@/components/quick-save";
import { StatusLine } from "@/components/status-line";
import { REFRESH_BADGE_MESSAGE } from "@/utils/messages";
import { limitSentence } from "@/utils/quick-save";
import {
  PENDING_ERROR_KEY,
  isPendingSilentError,
  type PendingSilentError,
} from "@/utils/silent-save";

const OUTLINE_BUTTON =
  "rounded-md border border-neutral-300 px-3 py-1 font-medium hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:border-neutral-700 dark:hover:bg-neutral-800";

/**
 * Surfaces a failed silent save (context menu) the next time the popup
 * opens: the address that failed, a way forward (Retry, or Upgrade after a
 * limit refusal) and Dismiss. The record lives in storage.session until the
 * retry succeeds or the user dismisses it.
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
    <div className="flex flex-col gap-1 rounded-md border border-red-300 p-2 dark:border-red-900">
      <StatusLine tone="error" className="font-medium">
        {pending.kind === "limit"
          ? `A right-click save failed. ${limitSentence(pending.limit)}`
          : "A save from the right-click menu failed."}
      </StatusLine>
      <p className="truncate text-xs text-neutral-500 dark:text-neutral-400" title={pending.url}>
        {pending.url}
      </p>
      {retryFailed && (
        <StatusLine tone="error" role="alert" className="text-xs">
          Retry failed. Still can&apos;t save.
        </StatusLine>
      )}
      <div className="mt-1 flex gap-2">
        {pending.kind === "limit" ? (
          <button type="button" onClick={openUpgrade} className={OUTLINE_BUTTON}>
            Upgrade to save more
          </button>
        ) : (
          <button type="button" onClick={() => void retry()} className={OUTLINE_BUTTON}>
            Retry
          </button>
        )}
        <button type="button" onClick={() => void clear()} className={OUTLINE_BUTTON}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
