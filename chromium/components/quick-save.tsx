import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { browser } from "wxt/browser";
import { OrganizeSection } from "@/components/organize";
import { SiteRiskNotice, useSiteRisks } from "@/components/site-risk";
import { StatusLine } from "@/components/status-line";
import { REFRESH_BADGE_MESSAGE } from "@/utils/messages";
import {
  isSaveableUrl,
  prepareSaveArgs,
  stateFromResult,
  stateFromError,
  deriveQuickSaveView,
  limitSentence,
  type QuickSaveState,
} from "@/utils/quick-save";
import { extractDomain } from "../shared/url";

type TabInfo = { url: string; title?: string };

const MUTED = "text-neutral-500 dark:text-neutral-400";

/** Where "Upgrade to save more" goes, from the popup and its right-click banner. */
export function openUpgrade() {
  void browser.tabs.create({
    url: `${import.meta.env.WXT_WEB_APP_URL}/settings`,
  });
}

/**
 * Two-step Quick save: opening the popup only CHECKS the page (no writes);
 * the user adds it with an explicit click. Already-saved pages go straight
 * to edit mode. Once a save completes, closing the popup never undoes it.
 */
export function QuickSaveSection() {
  // undefined = resolving; null = not a saveable page
  const [tab, setTab] = useState<TabInfo | null | undefined>(undefined);
  const [saveState, setSaveState] = useState<QuickSaveState | null>(null);
  const createBookmark = useMutation(api.bookmarkMutations.create);
  const statusLine = useRef<HTMLParagraphElement>(null);
  const action = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    void browser.tabs
      .query({ active: true, currentWindow: true })
      .then(([active]) => {
        setTab(
          active && isSaveableUrl(active.url)
            ? { url: active.url, title: active.title }
            : null,
        );
      })
      .catch((error) => {
        console.error("[extension] Failed to resolve active tab", error);
        setTab(null);
      });
  }, []);

  // Live saved-state lookup — also flips the popup into edit mode the
  // moment a save lands elsewhere (e.g. a context-menu save).
  const existing = useQuery(
    api.bookmarks.findSavedByUrl,
    tab ? { url: tab.url } : "skip",
  );

  const view = deriveQuickSaveView({ tab, existing, saveState });
  const site = tab ? extractDomain(tab.url) : "";
  const siteRisk = useSiteRisks(tab ? [site] : []).get(site);

  // A finished save removes the button that had focus: move focus to the
  // outcome (or, after a failure, to the way out) so it never falls to <body>.
  const status = saveState?.status;
  useEffect(() => {
    if (status === "error") action.current?.focus();
    else if (status && status !== "saving") statusLine.current?.focus();
  }, [status]);

  const add = async () => {
    if (!tab) return;
    setSaveState({ status: "saving" });
    try {
      const result = await createBookmark({
        ...prepareSaveArgs(tab),
        // Belt and braces: if the page got saved between the check and the
        // click, point at the existing Bookmark instead of duplicating.
        skipDuplicates: true,
      });
      setSaveState(stateFromResult(result));
      browser.runtime.sendMessage({ type: REFRESH_BADGE_MESSAGE }).catch(() => {
        /* background may be waking up — the next tab event self-corrects */
      });
    } catch (error) {
      console.error("[extension] Quick save failed", error);
      setSaveState(stateFromError(error));
    }
  };

  const flow = view.kind === "save-flow" ? view.state : null;
  const saving = flow?.status === "saving";
  const failure = flow?.status === "error" ? flow : null;
  const bookmarkId =
    view.kind === "already-saved"
      ? view.bookmarkId
      : flow && "bookmarkId" in flow
        ? flow.bookmarkId
        : null;

  return (
    <>
      {/* A security warning comes first, above saving. */}
      {siteRisk && <SiteRiskNotice risk={siteRisk} />}
      {view.kind === "checking" && <p className={MUTED}>Checking this page…</p>}
      {view.kind === "unsupported" && (
        <p className={MUTED}>
          This page can&apos;t be saved — only web pages (http/https) can.
        </p>
      )}
      {bookmarkId && (
        <StatusLine
          ref={statusLine}
          tone="ok"
          role="status"
          tabIndex={-1}
          className="font-medium"
        >
          {flow?.status === "saved"
            ? "Saved to your library"
            : flow?.status === "restored"
              ? "Restored from Trash"
              : "Already in your library"}
        </StatusLine>
      )}
      {failure && (
        <StatusLine tone="error" role="alert" className="font-medium">
          {failure.kind === "limit"
            ? limitSentence(failure.limit)
            : "Couldn't save this page. Check your connection and retry."}
        </StatusLine>
      )}
      {tab && (
        <div className="min-w-0">
          {tab.title?.trim() && (
            <p className="truncate font-medium" title={tab.title}>
              {tab.title.trim()}
            </p>
          )}
          <p className={`mt-0.5 truncate text-xs ${MUTED}`} title={tab.url}>
            {site}
          </p>
        </div>
      )}
      {/* One button through ready, saving and a failed save, so it keeps
          focus; after a limit refusal it becomes the way to upgrade. */}
      {(view.kind === "ready" || saving || failure) && (
        <button
          ref={action}
          type="button"
          autoFocus
          aria-disabled={saving}
          onClick={() => {
            if (saving) return;
            if (failure?.kind === "limit") openUpgrade();
            else void add();
          }}
          className="rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-disabled:opacity-70"
        >
          {saving
            ? "Saving…"
            : failure?.kind === "limit"
              ? "Upgrade to save more"
              : failure
                ? "Retry"
                : "Save to bookmark.land"}
        </button>
      )}
      {bookmarkId && <OrganizeSection bookmarkId={bookmarkId as Id<"bookmarks">} />}
    </>
  );
}
