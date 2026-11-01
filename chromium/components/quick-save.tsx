import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { browser } from "wxt/browser";
import { OrganizeSection } from "@/components/organize";
import { SiteRiskNotice, useSiteRisks } from "@/components/site-risk";
import { REFRESH_BADGE_MESSAGE } from "@/utils/messages";
import {
  isSaveableUrl,
  prepareSaveArgs,
  stateFromResult,
  stateFromError,
  deriveQuickSaveView,
  type QuickSaveState,
} from "@/utils/quick-save";
import { extractDomain } from "../shared/url";

type TabInfo = { url: string; title?: string };

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

  const pageLine = tab ? (
    <p className="truncate text-neutral-500" title={tab.title || tab.url}>
      {tab.title?.trim() || tab.url}
    </p>
  ) : null;

  return (
    <>
      <div className="flex flex-col gap-2 border-b border-neutral-200 pb-3 dark:border-neutral-800">
        {/* A security warning comes first, above saving. */}
        {siteRisk && <SiteRiskNotice risk={siteRisk} />}
        {view.kind === "checking" && (
          <p className="text-neutral-500">Checking this page…</p>
        )}
        {view.kind === "unsupported" && (
          <p className="text-neutral-500">
            This page can&apos;t be saved — only web pages (http/https) can.
          </p>
        )}
        {view.kind === "ready" && (
          <>
            {pageLine}
            <button
              type="button"
              autoFocus
              onClick={() => void add()}
              className="rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring"
            >
              Add to bookmark.land
            </button>
          </>
        )}
        {view.kind === "already-saved" && (
          <>
            <p className="font-medium">Already in your library</p>
            {pageLine}
          </>
        )}
        {view.kind === "save-flow" && (
          <>
            <SaveFlowStatus state={view.state} onRetry={() => void add()} />
            {view.state.status !== "saving" && pageLine}
          </>
        )}
      </div>
      {view.kind === "already-saved" && (
        <OrganizeSection bookmarkId={view.bookmarkId as Id<"bookmarks">} />
      )}
      {view.kind === "save-flow" && "bookmarkId" in view.state && (
        <OrganizeSection
          bookmarkId={view.state.bookmarkId as Id<"bookmarks">}
        />
      )}
    </>
  );
}

function SaveFlowStatus({
  state,
  onRetry,
}: {
  state: QuickSaveState;
  onRetry: () => void;
}) {
  switch (state.status) {
    case "saving":
      return <p className="text-neutral-500">Saving this page…</p>;
    case "saved":
      return <p className="font-medium text-primary">Saved to your library</p>;
    case "restored":
      return (
        <p className="font-medium text-primary">
          Restored from Trash
          {state.existingTitle ? ` — ${state.existingTitle}` : ""}
        </p>
      );
    case "already-saved":
      return <p className="font-medium">Already in your library</p>;
    case "unsupported":
      return null; // unreachable in the save flow
    case "error":
      return state.kind === "limit" ? (
        <LimitError limit={state.limit} />
      ) : (
        <RetryableError onRetry={onRetry} />
      );
  }
}

function LimitError({ limit }: { limit: number }) {
  const openUpgrade = () => {
    void browser.tabs.create({
      url: `${import.meta.env.WXT_WEB_APP_URL}/settings`,
    });
  };
  return (
    <div className="flex flex-col gap-2">
      <p className="font-medium text-red-600 dark:text-red-400">
        You&apos;ve reached your plan&apos;s limit of {limit} bookmarks.
      </p>
      <button
        type="button"
        onClick={openUpgrade}
        className="self-start rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring"
      >
        Upgrade for unlimited bookmarks
      </button>
    </div>
  );
}

function RetryableError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-medium text-red-600 dark:text-red-400">
        Couldn&apos;t save this page. Check your connection and retry.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="self-start rounded-md border border-neutral-300 px-3 py-1.5 font-medium hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-ring dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        Retry
      </button>
    </div>
  );
}
