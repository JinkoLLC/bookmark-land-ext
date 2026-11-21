import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/api";
import { browser } from "wxt/browser";
import { PageAddress } from "@/components/qr-view";
import { openUpgrade } from "@/components/quick-save";
import { StatusLine } from "@/components/status-line";
import { REFRESH_BADGE_MESSAGE } from "@/utils/messages";
import { limitSentence, stateFromResult } from "@/utils/quick-save";
import {
  PENDING_ERROR_KEY,
  isPendingSilentError,
  pendingErrorFrom,
  type PendingSilentError,
} from "@/utils/silent-save";
import { extractDomain } from "../shared/url";

const OUTLINE_BUTTON =
  "rounded-md border border-neutral-300 px-3 py-1 font-medium hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-neutral-800";

/**
 * Surfaces a failed silent save (context menu) the next time the popup
 * opens: the address that failed, a way forward (Retry, or Upgrade after a
 * limit refusal) and Dismiss. The record lives in storage.session until the
 * retry succeeds or the user dismisses it. A retry that saves the page says
 * so in a line that stays after the banner has gone.
 */
export function PendingErrorBanner() {
  const [pending, setPending] = useState<PendingSilentError | null>(null);
  const [retryFailed, setRetryFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [saved, setSaved] = useState("");
  const banner = useRef<HTMLDivElement>(null);
  // A retry answered after the banner was dismissed doesn't bring it back.
  const dismissed = useRef(false);
  const createBookmark = useMutation(api.bookmarkMutations.create);

  useEffect(() => {
    void browser.storage.session
      .get(PENDING_ERROR_KEY)
      .then((items: Record<string, unknown>) => {
        const value = items[PENDING_ERROR_KEY];
        if (isPendingSilentError(value)) setPending(value);
      });
  }, []);

  /** Whether storage still holds the record this banner shows: a later failed save may have replaced it. */
  const stillShown = async (url: string) => {
    const items: Record<string, unknown> = await browser.storage.session.get(PENDING_ERROR_KEY);
    const value = items[PENDING_ERROR_KEY];
    return isPendingSilentError(value) && value.url === url;
  };

  const clear = async () => {
    dismissed.current = true;
    if (pending && (await stillShown(pending.url))) await browser.storage.session.remove(PENDING_ERROR_KEY);
    // The banner goes with the button that has focus: the popup's first control after it takes it.
    const box = banner.current;
    if (box?.contains(document.activeElement)) {
      [...(box.closest("main")?.querySelectorAll<HTMLElement>("button, a[href], input") ?? [])]
        .find((control) => !box.contains(control))
        ?.focus();
    }
    setPending(null);
  };

  const retry = async (url: string) => {
    setRetrying(true);
    setRetryFailed(false);
    try {
      const { status } = stateFromResult(await createBookmark({ url, skipDuplicates: true }));
      const site = extractDomain(url);
      setSaved(status === "restored" ? `Restored ${site} from Trash.` : status === "already-saved" ? `${site} was already in your library.` : `Saved ${site}.`);
      await clear();
      browser.runtime.sendMessage({ type: REFRESH_BADGE_MESSAGE }).catch(() => {});
    } catch (error) {
      if (dismissed.current) return;
      // A refusal for the limit changes what the banner offers, now and on later opens.
      const next = pendingErrorFrom(url, error);
      setPending(next);
      setRetryFailed(next.kind !== "limit");
      void stillShown(url)
        .then((same) => (same ? browser.storage.session.set({ [PENDING_ERROR_KEY]: next }) : undefined))
        .catch(() => {});
    } finally {
      setRetrying(false);
    }
  };

  // There before a retry answers, so its text is announced when it arrives; it takes no room while empty.
  const outcome = (
    <div role="status" className={saved ? "" : "sr-only"}>
      {saved && <StatusLine tone="ok">{saved}</StatusLine>}
    </div>
  );
  if (!pending) return outcome;

  return (
    <>
      {outcome}
      <div ref={banner} className="flex flex-col gap-1 rounded-md border border-red-300 p-2 dark:border-red-900">
        {/* A status: its sentence changes when a retry is refused for the limit. */}
        <StatusLine tone="error" role="status" className="font-medium">
          {pending.kind === "limit"
            ? `A right-click save failed. ${limitSentence(pending.limit)}`
            : "A save from the right-click menu failed."}
        </StatusLine>
        <PageAddress text={pending.url} className="text-neutral-500 dark:text-neutral-400" />
        {retryFailed && (
          <StatusLine tone="error" role="alert" className="text-xs">
            Retry failed. Still can&apos;t save.
          </StatusLine>
        )}
        {/* Why neither button does anything for now. Retry's own label shows the progress: this names it for a screen reader. */}
        <p id="retrying-note" role="status" className="sr-only">
          {retrying && "Trying the save again…"}
        </p>
        <div className="mt-1 flex gap-2">
          {pending.kind === "limit" ? (
            <button type="button" onClick={openUpgrade} className={OUTLINE_BUTTON}>
              Upgrade to save more
            </button>
          ) : (
            <button
              type="button"
              aria-disabled={retrying}
              aria-describedby="retrying-note"
              onClick={() => !retrying && void retry(pending.url)}
              className={OUTLINE_BUTTON}
            >
              {retrying ? "Retrying…" : "Retry"}
            </button>
          )}
          <button
            type="button"
            aria-disabled={retrying}
            aria-describedby="retrying-note"
            onClick={() => !retrying && void clear()}
            className={OUTLINE_BUTTON}
          >
            Dismiss
          </button>
        </div>
      </div>
    </>
  );
}
