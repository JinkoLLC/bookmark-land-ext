import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import { browser } from "wxt/browser";
import { Check, Loader2, Plus } from "lucide-react";
import { REFRESH_BADGE_MESSAGE } from "@/utils/messages";
import {
  isSaveableUrl,
  prepareSaveArgs,
  stateFromError,
  stateFromResult,
  type QuickSaveState,
} from "@/utils/quick-save";

type TabInfo = { url: string; title?: string };

/** How long "Saved to your library" shows before the button resets. */
const CONFIRMATION_MS = 2500;

/**
 * The Library panel's "Add this page" button. The panel stays open while the
 * user switches tabs, so it follows the active tab of its window and resets
 * after every switch or navigation. Same create path as the popup's Quick
 * save (duplicate-safe), so it never makes a second copy. A save's outcome
 * shows for a moment, then a page already in the library shows "In your
 * library" instead of the button, matching the toolbar's green check.
 */
export function AddPageButton() {
  // undefined = resolving; null = the active tab can't be saved
  const [tab, setTab] = useState<TabInfo | null | undefined>(undefined);
  const [saveState, setSaveState] = useState<QuickSaveState | null>(null);
  const createBookmark = useMutation(api.bookmarkMutations.create);
  // The URL the current save outcome belongs to.
  const lastUrl = useRef<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    // Tab switches can overlap; only the latest query's answer counts.
    let latest = 0;
    const refresh = () => {
      const request = ++latest;
      void browser.tabs
        .query({ active: true, currentWindow: true })
        .then(([active]) => {
          if (cancelled || request !== latest) return;
          const next =
            active && isSaveableUrl(active.url)
              ? { url: active.url, title: active.title }
              : null;
          setTab((previous) => {
            // Same page: keep the object so the saved-state query doesn't churn.
            if (previous && next && previous.url === next.url && previous.title === next.title) {
              return previous;
            }
            return next;
          });
          // A different page: forget the last save's outcome.
          setSaveState((state) => (state && next?.url === lastUrl.current ? state : null));
          lastUrl.current = next?.url;
        })
        .catch(() => {
          if (!cancelled && request === latest) setTab(null);
        });
    };
    refresh();
    const onUpdated = (_id: number, change: { url?: string; title?: string }) => {
      if (change.url !== undefined || change.title !== undefined) refresh();
    };
    browser.tabs.onActivated.addListener(refresh);
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.windows.onFocusChanged.addListener(refresh);
    return () => {
      cancelled = true;
      browser.tabs.onActivated.removeListener(refresh);
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.windows.onFocusChanged.removeListener(refresh);
    };
  }, []);

  // Live: flips to "In your library" the moment the page is saved anywhere
  // (popup, shortcut, right-click), and back if it's deleted.
  const existing = useQuery(
    api.bookmarks.findSavedByUrl,
    tab ? { url: tab.url } : "skip",
  );

  // A save's outcome shows briefly, then the button settles into the page's
  // saved state ("In your library").
  useEffect(() => {
    const status = saveState?.status;
    if (status !== "saved" && status !== "restored" && status !== "already-saved") return;
    const timer = setTimeout(() => setSaveState(null), CONFIRMATION_MS);
    return () => clearTimeout(timer);
  }, [saveState]);

  const add = async () => {
    if (!tab) return;
    const url = tab.url;
    // The user may switch tabs mid-save: the outcome belongs to this page only.
    const stillHere = () => lastUrl.current === url;
    setSaveState({ status: "saving" });
    try {
      const result = await createBookmark({
        ...prepareSaveArgs(tab),
        skipDuplicates: true,
      });
      if (stillHere()) setSaveState(stateFromResult(result));
      browser.runtime.sendMessage({ type: REFRESH_BADGE_MESSAGE }).catch(() => {
        /* background may be waking up — the next tab event self-corrects */
      });
    } catch (error) {
      console.error("[extension] Side panel save failed", error);
      if (stillHere()) setSaveState(stateFromError(error));
    }
  };

  const status = saveState?.status;
  const saved = status === "saved" || status === "restored" || status === "already-saved";
  const error = saveState?.status === "error" ? saveState : null;
  const checking =
    tab === undefined || (tab !== null && existing === undefined && saveState === null);
  const inLibrary = saveState === null && !!existing;

  const base =
    "flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 font-medium focus-visible:outline-2 focus-visible:outline-ring";

  let button;
  if (checking) {
    button = (
      <button type="button" disabled className={`${base} bg-primary/60 text-primary-foreground`}>
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Checking this page…
      </button>
    );
  } else if (tab === null) {
    button = (
      <button
        type="button"
        disabled
        title="Only web pages (http/https) can be saved"
        className={`${base} border border-neutral-300 text-neutral-500 dark:border-neutral-700`}
      >
        This page can&apos;t be saved
      </button>
    );
  } else if (inLibrary) {
    button = (
      <p
        role="status"
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-green-600/40 px-3 py-1.5 font-medium text-green-700 dark:text-green-400"
      >
        <Check className="h-4 w-4" aria-hidden="true" />
        In your library
      </p>
    );
  } else if (saved) {
    button = (
      <button type="button" disabled className={`${base} border border-primary/40 text-primary`}>
        <Check className="h-4 w-4" aria-hidden="true" />
        {status === "saved"
          ? "Saved to your library"
          : status === "restored"
            ? "Restored from Trash"
            : "Already in your library"}
      </button>
    );
  } else {
    const saving = status === "saving";
    button = (
      <button
        type="button"
        onClick={() => void add()}
        disabled={saving}
        className={`${base} bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-70`}
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Plus className="h-4 w-4" aria-hidden="true" />
        )}
        {saving ? "Saving…" : error ? "Retry saving this page" : "Add this page"}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {button}
      {tab && (
        <p className="truncate px-0.5 text-xs text-neutral-500" title={tab.url}>
          {tab.title?.trim() || tab.url}
        </p>
      )}
      {error?.kind === "limit" && (
        <p className="px-0.5 text-xs text-red-600 dark:text-red-400">
          You&apos;ve reached your plan&apos;s limit of {error.limit} bookmarks.{" "}
          <button
            type="button"
            onClick={() =>
              void browser.tabs.create({
                url: `${import.meta.env.WXT_WEB_APP_URL}/settings`,
              })
            }
            className="underline underline-offset-2"
          >
            Upgrade
          </button>
        </p>
      )}
      {error?.kind === "retryable" && (
        <p className="px-0.5 text-xs text-red-600 dark:text-red-400">
          Couldn&apos;t save this page. Check your connection and retry.
        </p>
      )}
    </div>
  );
}
