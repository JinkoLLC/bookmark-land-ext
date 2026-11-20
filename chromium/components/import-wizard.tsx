import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/chrome-extension";
import { useAction, useConvexAuth, useQueries } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { browser } from "wxt/browser";
import { CircleAlert, FolderOpen, Leaf, Loader2 } from "lucide-react";
import {
  allFoldersMerge,
  anyRootTicked,
  buildImportModel,
  type NativeNode,
} from "@/utils/import-tree";
import {
  DEFAULT_DESTINATION,
  destinationArgFor,
  destinationBaseDepth,
  destinationName as destinationNameFor,
  importedCollectionName,
  importReadiness,
  type ImportDestination,
} from "@/utils/import-destination";
import { buildCollectionOptions, livePageCounts, type CollectionFeed } from "@/utils/organize";
import { derivePopupAuthState } from "@/utils/popup-state";
import { useStalled } from "@/hooks/use-stalled";
import { allowanceWarningFor } from "@/utils/allowance";
import { DestinationPicker } from "@/components/import-destination";
import { FolderNode, FolderCheckbox } from "@/components/import-folders";
import { AuthStalled } from "@/components/auth-stalled";
import { ImportComplete } from "@/components/import-complete";
import { formatCount, reachedPlanLimit, type ImportResult } from "@/utils/import-result";
import { parseReturnTabId } from "@/utils/setup-return";

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const FILLED_BUTTON = `rounded-full bg-emerald-700 font-semibold text-white transition hover:bg-emerald-800 ${FOCUS_RING}`;

const READS = {
  plan: { query: api.subscriptions.getSubscriptionInfo, args: {} },
  collections: { query: api.collections.list, args: {} },
  feeds: { query: api.userPages.collectionFeeds, args: {} },
};
type Read = keyof typeof READS;
const OUTLINE_BUTTON = `inline-flex min-h-6 items-center rounded-full border border-neutral-300 font-semibold transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800 ${FOCUS_RING}`;

/**
 * Browser import wizard: preview the native bookmark tree with per-folder
 * checkboxes and a destination choice, then import the selection through
 * the tree-payload entry point. Nothing is written until Import is
 * confirmed; re-runs are safe. Native bookmarks are only ever READ
 * (ADR-0001).
 */
export function ImportWizard() {
  const { isLoaded, isSignedIn } = useAuth();
  const convexAuth = useConvexAuth();
  const waitingForAuth =
    !isLoaded || (isSignedIn === true && convexAuth.isLoading);
  const stalled = useStalled(waitingForAuth);
  const state = derivePopupAuthState({
    isLoaded,
    isSignedIn,
    stalled,
    convexAuth,
  });

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-sky-200 via-emerald-50 to-green-100 text-slate-950 dark:from-slate-950 dark:via-sky-950 dark:to-emerald-950 dark:text-slate-100">
      <ImportSky />
      <ImportLandscape />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl items-start px-4 py-8 sm:px-6 lg:items-center lg:py-12">
        <section className="grid w-full grid-cols-1 gap-5 lg:grid-cols-[0.85fr_1.15fr]">
          {/* Sized to its text and cards, top-aligned: stretched to the other column it left a tall gap. */}
          <div className="min-w-0 rounded-3xl lg:self-start border border-white/50 bg-white/35 p-6 shadow-2xl shadow-emerald-950/10 backdrop-blur-md dark:border-white/10 dark:bg-slate-950/35 dark:shadow-black/30">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/75 px-4 py-2 text-xs font-semibold text-emerald-800 shadow-sm backdrop-blur dark:border-emerald-700/60 dark:bg-emerald-950/60 dark:text-emerald-200">
                <Leaf className="h-3.5 w-3.5" />
                Grow your bookmark.land library
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-sky-950 drop-shadow-sm sm:text-4xl dark:text-sky-50">
                Import browser bookmarks
              </h1>
              <p className="mt-4 max-w-md text-sm leading-6 text-sky-950 dark:text-sky-100">
                Bring your folders over as bookmark.land collections. Re-runs
                are safe, duplicates are skipped, and your browser bookmarks
                are never modified.
              </p>
            </div>

            {/* In one column the three cards would push step 1 or the result down the page;
                the intro above already covers them. */}
            <div className="mt-8 hidden gap-3 text-sm text-slate-700 lg:grid dark:text-slate-200">
              <ImportPromise icon="🌲" title="Folders stay organized" />
              <ImportPromise icon="⛰️" title="Deep trees flatten safely" />
              <ImportPromise icon="✨" title="No duplicates on re-import" />
            </div>
          </div>

          {/* The result is short: its card sizes to it instead of stretching to the intro's height. */}
          <div className="min-w-0 has-[[data-import-result]]:self-start rounded-3xl border border-white/70 bg-white/85 p-4 shadow-2xl shadow-emerald-950/15 backdrop-blur-xl sm:p-5 dark:border-white/10 dark:bg-slate-950/80 dark:shadow-black/40">
            {state === "loading" && <LoadingPanel />}
            {state === "stalled" && <AuthStalled />}
            {state === "signed-out" && <SignedOut />}
            {state === "signed-in" && <Wizard />}
          </div>
        </section>
      </div>
    </main>
  );
}

function ImportPromise({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/50 bg-white/45 px-3 py-2.5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-base dark:bg-emerald-900/60">
        {icon}
      </span>
      <span className="font-medium">{title}</span>
    </div>
  );
}

function LoadingPanel() {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center text-slate-600 dark:text-slate-300">
      <Loader2 className="h-6 w-6 text-emerald-600 motion-safe:animate-spin" aria-hidden="true" />
      <p>Loading your bookmark.land session…</p>
    </div>
  );
}

function SignedOut() {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 dark:border-emerald-900/70 dark:bg-emerald-950/30">
      <div>
        <h2 className="font-semibold">Sign in to start importing</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Open bookmark.land in a tab, sign in, then return here.
        </p>
      </div>
      <button
        type="button"
        onClick={() =>
          void browser.tabs.create({
            url: `${import.meta.env.WXT_WEB_APP_URL}/sign-in`,
          })
        }
        className={`self-start px-4 py-2 shadow-sm shadow-emerald-900/20 ${FILLED_BUTTON}`}
      >
        Sign in to bookmark.land
      </button>
    </div>
  );
}

function Wizard() {
  // "failed": the browser refused the read, which is not the same as having no bookmarks.
  const [roots, setRoots] = useState<NativeNode[] | "failed" | null>(null);
  const [readAttempt, setReadAttempt] = useState(0);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [destination, setDestination] =
    useState<ImportDestination>(DEFAULT_DESTINATION);
  // Made once per run: the label, the merge lines and the import use the same name.
  const [importedName, setImportedName] = useState(() => importedCollectionName(new Date()));
  const [phase, setPhase] = useState<"preview" | "importing" | "done" | "failed">(
    "preview",
  );
  // The result with the bookmarks that were sent for it: the selection can change afterwards.
  const [summary, setSummary] = useState<{
    result: ImportResult;
    sent: { url: string; title?: string }[];
  } | null>(null);
  // Back from a result: "Import more" is gone, so step 1's heading takes the focus.
  const [returned, setReturned] = useState(false);
  const runImport = useAction(api.importTree.importTree);
  // Read with useQueries so a failed load comes back as a value (as the popup's
  // picker does): thrown, it would replace the wizard and lose the selection or
  // the result. A failed query keeps its error while subscribed: Retry drops
  // that one subscription for a render, so the client asks the server again.
  const [dropped, setDropped] = useState<Read | null>(null);
  useEffect(() => {
    if (dropped) setDropped(null);
  }, [dropped]);
  const queries = useMemo(
    () => Object.fromEntries(Object.entries(READS).filter(([key]) => key !== dropped)),
    [dropped],
  );
  const reads = useQueries(queries) as {
    plan?: FunctionReturnType<typeof api.subscriptions.getSubscriptionInfo> | Error;
    collections?: FunctionReturnType<typeof api.collections.list> | Error;
    feeds?: CollectionFeed[] | Error;
  };
  // Session summary — remaining allowance for the over-limit warning.
  const planFailed = reads.plan instanceof Error;
  const sessionSummary = reads.plan instanceof Error ? undefined : reads.plan;
  const collectionsFailed = reads.collections instanceof Error;
  const collections = reads.collections instanceof Error ? undefined : reads.collections;
  const { feeds } = reads;
  const livePages = feeds instanceof Error ? "failed" : feeds ? "ready" : "loading";
  const collectionFeeds = feeds instanceof Error ? undefined : feeds;
  const importButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const tree = await browser.bookmarks.getTree();
        if (cancelled) return;
        const children = (tree[0]?.children ?? []) as NativeNode[];
        setRoots(children.filter((r) => (r.children ?? []).length > 0));
      } catch (error) {
        console.error("[extension] Failed to read browser bookmarks", error);
        if (!cancelled) setRoots("failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [readAttempt]);

  const options = useMemo(
    () => buildCollectionOptions(collections ?? []),
    [collections],
  );
  // The destination's depth shifts where folder flattening kicks in.
  const baseDepth = destinationBaseDepth(
    destination,
    (id) => options.find((o) => o.id === id)?.depth,
  );
  // Named for the folders that merge straight into the destination.
  const destinationName = destinationNameFor(destination, importedName, options);
  const model = useMemo(
    () =>
      Array.isArray(roots)
        ? buildImportModel(roots, excluded, baseDepth, destinationName)
        : null,
    [roots, excluded, baseDepth, destinationName],
  );
  const destinationArg = destinationArgFor(destination, importedName);
  // A completed read without the chosen collection: the choice is cleared, and step 3 says why.
  useEffect(() => {
    if (destination.kind === "existing" && destination.id && collections && !options.some((o) => o.id === destination.id)) {
      setDestination({ kind: "existing", gone: true });
    }
  }, [destination, collections, options]);

  if (roots === "failed") {
    return (
      <BrowserReadFailed
        onRetry={() => {
          setRoots(null);
          setReadAttempt((n) => n + 1);
        }}
      />
    );
  }

  if (!roots || !model) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center text-slate-600 dark:text-slate-300">
        <FolderOpen className="h-7 w-7 text-emerald-600" aria-hidden="true" />
        <p>Reading your browser bookmark folders…</p>
      </div>
    );
  }

  if (phase === "done" && summary) {
    return (
      <ImportComplete
        result={summary.result}
        sample={summary.sent}
        planLimit={reachedPlanLimit(summary.result, sessionSummary)}
        returnTabId={parseReturnTabId(window.location.search)}
        onImportMore={() => {
          // The next run gets its own collection.
          setImportedName(importedCollectionName(new Date()));
          setSummary(null);
          setReturned(true);
          setPhase("preview");
        }}
      />
    );
  }

  if (roots.length === 0) return <NoBrowserBookmarks />;

  const nothingSelected = model.importableCount === 0;

  const toggle = (id: string) => {
    const next = new Set(excluded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExcluded(next);
  };

  const start = async () => {
    const arg = destinationArg;
    if (!arg || phase === "importing" || !readiness.ready) return;
    setPhase("importing");
    try {
      const result = await runImport({
        folders: model.folders,
        bookmarks: model.bookmarks,
        destination:
          arg.type === "collection"
            ? { type: "collection", id: arg.id as Id<"collections"> }
            : arg,
      });
      setSummary({ result, sent: model.bookmarks });
      setPhase("done");
    } catch (error) {
      console.error("[extension] Browser import failed", error);
      setPhase("failed");
    }
  };

  // Ticked folders can still hold nothing importable: that isn't an empty selection.
  const nothingImportable = nothingSelected && anyRootTicked(roots, excluded);
  const collectionsState = collectionsFailed ? "failed" : collections ? "ready" : "loading";
  // The button's state, the reason beside it and start()'s guard all come from this.
  const readiness = importReadiness({
    destination,
    collections: collectionsState === "ready" ? options : collectionsState,
    livePages,
    plan: planFailed ? "failed" : sessionSummary ? "ready" : "loading",
    selection: nothingImportable ? "nothing-importable" : nothingSelected ? "none" : "some",
  });
  const warning = sessionSummary
    ? allowanceWarningFor(
        model.importableCount,
        sessionSummary.bookmarkCount,
        sessionSummary.limit,
      )
    : null;

  const count = formatCount(model.importableCount);
  // One target for every folder: the notice names it once and the rows stay bare.
  const allMerge = allFoldersMerge(model);
  const mergedRows = allMerge ? {} : model.mergedInto;
  const openUpgrade = () =>
    void browser.tabs.create({ url: `${import.meta.env.WXT_WEB_APP_URL}/settings` });

  return (
    <div className="flex flex-col gap-4">
      <Step number={1} title="Choose folders to import" hint="Untick anything you want to leave behind." focusTitle={returned}>
        {model.mergedFolderIds.length > 0 && (
          <p className="mb-2 break-words text-sm text-slate-700 dark:text-slate-200">
            {allMerge
              ? `All folders merge into ${destinationName}: collections nest up to five levels.`
              : "Collections nest up to five levels. A folder that says ‘merges into…’ goes into the nearest collection above it."}
          </p>
        )}
        {/* p-1: room for the checkboxes' focus ring inside the scroll box.
            Below md the list has no cap: only the page scrolls. */}
        {/* Locked while importing, like the destination: the selection was already sent. */}
        <fieldset
          disabled={phase === "importing"}
          aria-labelledby="import-step-1"
          className="min-w-0 space-y-2 p-1 md:max-h-[26rem] md:overflow-y-auto"
        >
          {roots.map((root) => (
            <section
              key={root.id}
              className="rounded-xl border border-white/80 bg-white/75 p-3 shadow-sm dark:border-white/10 dark:bg-slate-900/70"
            >
              <FolderCheckbox
                id={root.id}
                label={root.title || "Bookmarks"}
                excluded={excluded}
                parentExcluded={false}
                onToggle={toggle}
                bold
                mergesInto={mergedRows[root.id]}
              />
              <div className="mt-1">
                {(root.children ?? [])
                  .filter((c) => c.url === undefined)
                  .map((f) => (
                    <FolderNode
                      key={f.id}
                      node={f}
                      depth={1}
                      excluded={excluded}
                      parentExcluded={excluded.has(root.id)}
                      merged={mergedRows}
                      onToggle={toggle}
                    />
                  ))}
              </div>
            </section>
          ))}
        </fieldset>
      </Step>

      <Step
        number={2}
        title="Import into"
        hint="Choose where to import these bookmarks."
        dimmed={nothingSelected}
      >
        <DestinationPicker
          value={destination}
          onChange={setDestination}
          importedName={importedName}
          options={options}
          onPage={livePageCounts(collectionFeeds)}
          livePages={livePages}
          onRetryLivePages={() => setDropped("feeds")}
          collections={collectionsState}
          onRetryCollections={() => setDropped("collections")}
          disabled={phase === "importing" || nothingSelected}
        />
      </Step>

      <Step number={3} title="Start the import" dimmed={nothingSelected}>
        {warning && (
          <p
            role="status"
            className="mb-3 flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50/90 p-4 text-sm text-slate-900 shadow-sm dark:border-amber-700 dark:bg-amber-950/35 dark:text-slate-100"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <span>
              Your plan has room for {formatCount(warning.remaining)} more bookmark
              {warning.remaining === 1 ? "" : "s"}, and {count}{" "}
              {model.importableCount === 1 ? "is" : "are"} selected. Bookmarks
              already in your library or in its Trash don&apos;t use room; the
              rest are imported until it runs out.
            </span>
          </p>
        )}

        {/* The status is mounted throughout, so its text is announced when it appears. */}
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 ${planFailed ? "mb-3" : ""}`}>
          <div role="status" className="min-w-0">
            {/* The button keeps the focus while it runs, so its new label isn't read out: this is. */}
            {phase === "importing" && <span className="sr-only">Importing…</span>}
            {planFailed && (
              <p className="flex items-start gap-2 text-sm text-slate-900 dark:text-slate-100">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
                <span>Couldn&apos;t load your plan&apos;s bookmark limit.</span>
              </p>
            )}
          </div>
          {planFailed && (
            <button
              type="button"
              onClick={() => {
                // Retry leaves with the message: the focus goes to the button it sits beside.
                importButton.current?.focus();
                setDropped("plan");
              }}
              className={`px-3 py-1 text-sm ${OUTLINE_BUTTON}`}
            >
              Retry
            </button>
          )}
        </div>

        {phase === "failed" && (
          <p
            role="alert"
            className="mb-3 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm font-medium text-slate-900 dark:border-red-900/70 dark:bg-red-950/30 dark:text-slate-100"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
            <span>
              The import didn&apos;t finish, and we couldn&apos;t confirm what was
              saved. Run it again: bookmarks already in your library are
              skipped.
            </span>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            ref={importButton}
            // aria-disabled, not disabled: the focus stays on it through a run, so a retry
            // after a failure is one key press. start() refuses what this greys out.
            aria-disabled={phase === "importing" || !readiness.ready}
            onClick={() => void start()}
            // Disabled it still says what to do, so it is greyed rather than faded.
            className={`inline-flex max-w-full items-center justify-center gap-2 px-6 py-3 text-base shadow-lg shadow-emerald-900/20 aria-disabled:cursor-not-allowed aria-disabled:bg-slate-200 aria-disabled:text-slate-700 aria-disabled:shadow-none aria-disabled:hover:bg-slate-200 dark:aria-disabled:hover:bg-slate-800 motion-safe:not-aria-disabled:hover:-translate-y-0.5 dark:aria-disabled:bg-slate-800 dark:aria-disabled:text-slate-200 ${FILLED_BUTTON}`}
          >
            {phase === "importing" && <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />}
            {phase === "importing"
              ? "Importing…"
              : nothingImportable
                ? "No bookmarks to import"
                : nothingSelected
                  ? "Select at least one folder"
                  : `Import ${count} bookmark${model.importableCount === 1 ? "" : "s"}`}
          </button>
          {warning && (
            <button
              type="button"
              onClick={openUpgrade}
              className={`px-4 py-2 ${OUTLINE_BUTTON}`}
            >
              Upgrade
            </button>
          )}
          {/* Why Import is inert. "Select at least one folder" is the button's own label. Mounted throughout, so it is announced. */}
          <p role="status" className="min-w-0 basis-56 grow text-sm text-slate-900 dark:text-slate-100">
            {phase !== "importing" && !readiness.ready && (nothingImportable || !nothingSelected) && (
              <span className="flex items-start gap-2">
                {readiness.waiting ? (
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 motion-safe:animate-spin dark:text-emerald-400" aria-hidden="true" />
                ) : (
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                )}
                <span>{readiness.reason}</span>
              </span>
            )}
          </p>
        </div>
      </Step>

      <p className="px-1 text-center text-xs text-slate-600 dark:text-slate-300">
        {count} selected
        {/* When every folder merges, step 1's notice has said so; with nothing to send, no collection is made. */}
        {!allMerge &&
          !nothingSelected &&
          ` · ${formatCount(model.folders.length)} new collection${model.folders.length === 1 ? "" : "s"}`}
        {model.excludedSchemeCount > 0 &&
          ` · ${formatCount(model.excludedSchemeCount)} left out (not web pages)`}
        {model.excludedTooLongCount > 0 &&
          ` · ${formatCount(model.excludedTooLongCount)} left out (address too long)`}
      </p>
    </div>
  );
}

/** One numbered step of the wizard. A step that isn't active yet mutes its number only: its text stays at full contrast. */
function Step({
  number,
  title,
  hint,
  dimmed = false,
  focusTitle = false,
  children,
}: {
  number: number;
  title: string;
  hint?: string;
  dimmed?: boolean;
  /** Focus the title when the step appears. */
  focusTitle?: boolean;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusTitle) heading.current?.focus();
  }, [focusTitle]);
  return (
    <section
      aria-labelledby={`import-step-${number}`}
      className="min-w-0 rounded-2xl border border-emerald-100 bg-emerald-50/65 p-4 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/25"
    >
      <div className="mb-3 flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            dimmed
              ? "border border-emerald-700 text-emerald-900 dark:border-emerald-500 dark:text-emerald-100"
              : "bg-emerald-700 text-white shadow-sm"
          }`}
        >
          {number}
        </span>
        <div>
          <h2
            id={`import-step-${number}`}
            ref={heading}
            tabIndex={focusTitle ? -1 : undefined}
            className={`rounded font-semibold text-emerald-950 dark:text-emerald-100 ${FOCUS_RING}`}
          >
            <span className="sr-only">Step {number}: </span>
            {title}
          </h2>
          {hint && (
            <p className="text-sm text-slate-600 dark:text-slate-300">{hint}</p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

/** Chrome has no bookmarks yet (a fresh profile): say so instead of a blank list. */
function NoBrowserBookmarks() {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/65 p-6 text-center dark:border-emerald-900/60 dark:bg-emerald-950/25">
      <FolderOpen className="h-8 w-8 text-emerald-600" aria-hidden="true" />
      <h2 className="text-lg font-semibold text-emerald-950 dark:text-emerald-100">
        No browser bookmarks found
      </h2>
      <p className="max-w-sm text-sm text-slate-600 dark:text-slate-300">
        This browser doesn&apos;t have any bookmarks to import yet. Bookmark a
        few pages in Chrome (
        <kbd className="rounded border px-1 font-mono text-xs">⌘D</kbd> or{" "}
        <kbd className="rounded border px-1 font-mono text-xs">Ctrl+D</kbd>),
        then reload this page.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className={`px-4 py-2 shadow-sm ${FILLED_BUTTON}`}
      >
        Reload
      </button>
    </div>
  );
}

/** The browser refused the read: say so, rather than "no bookmarks". */
function BrowserReadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/65 p-6 text-center dark:border-emerald-900/60 dark:bg-emerald-950/25"
    >
      <CircleAlert className="h-8 w-8 text-red-600 dark:text-red-400" aria-hidden="true" />
      <h2 className="text-lg font-semibold text-emerald-950 dark:text-emerald-100">
        Couldn&apos;t read your browser&apos;s bookmarks.
      </h2>
      <button type="button" onClick={onRetry} className={`px-4 py-2 shadow-sm ${FILLED_BUTTON}`}>
        Retry
      </button>
    </div>
  );
}

function ImportSky() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      <div className="absolute right-[12%] top-8 h-24 w-24 rounded-full bg-yellow-300/90 shadow-[0_0_70px_24px_rgba(253,224,71,0.35)] dark:bg-yellow-100 dark:shadow-[0_0_70px_20px_rgba(254,249,195,0.18)]" />
      <div className="absolute left-[8%] top-10 h-12 w-32 rounded-full bg-white/70 blur-sm dark:bg-white/10" />
      <div className="absolute left-[16%] top-7 h-10 w-20 rounded-full bg-white/60 blur-sm dark:bg-white/10" />
      <div className="absolute right-[28%] top-20 h-10 w-28 rounded-full bg-white/55 blur-sm dark:bg-white/10" />
      <div className="absolute right-[22%] top-16 h-8 w-16 rounded-full bg-white/50 blur-sm dark:bg-white/10" />
    </div>
  );
}

function ImportLandscape() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-64 opacity-95 sm:h-80">
      <svg
        className="h-full w-full"
        viewBox="0 0 1440 320"
        preserveAspectRatio="xMidYMax slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M-50,320 L150,135 L350,320 Z" className="fill-blue-300/45 dark:fill-slate-700/55" />
        <path d="M230,320 L470,95 L710,320 Z" className="fill-sky-300/55 dark:fill-slate-700/65" />
        <path d="M420,140 L470,95 L522,140 L492,145 L455,137 Z" className="fill-white/70 dark:fill-slate-300/20" />
        <path d="M650,320 L880,115 L1110,320 Z" className="fill-blue-300/45 dark:fill-slate-700/55" />
        <path d="M835,155 L880,115 L928,155 L902,160 L864,150 Z" className="fill-white/70 dark:fill-slate-300/20" />
        <path d="M1000,320 L1260,125 L1520,320 Z" className="fill-sky-300/60 dark:fill-slate-700/65" />

        <path d="M-100,320 L80,200 L250,245 L410,175 L560,230 L690,195 L850,320 Z" className="fill-green-700/35 dark:fill-green-950/55" />
        <path d="M560,320 L780,180 L950,225 L1100,170 L1260,215 L1420,190 L1540,320 Z" className="fill-green-700/35 dark:fill-green-950/55" />

        <Tree x={130} y={220} scale={1.25} />
        <Tree x={350} y={236} scale={0.9} />
        <Tree x={1018} y={238} scale={0.75} />
        <Tree x={1200} y={212} scale={1.35} />

        <path d="M0,280 C200,250 400,270 600,255 C800,240 1000,275 1200,260 L1440,270 L1440,320 L0,320 Z" className="fill-green-300 dark:fill-green-950/55" />
        <path d="M0,292 C150,270 350,296 550,275 C750,255 950,292 1150,270 C1300,258 1400,280 1440,285 L1440,320 L0,320 Z" className="fill-green-400 dark:fill-green-900/65" />
        <path d="M0,302 C200,286 400,306 600,292 C800,278 1000,300 1200,288 L1440,295 L1440,320 L0,320 Z" className="fill-green-500 dark:fill-green-800/80" />

        <circle cx="220" cy="308" r="2.5" className="fill-yellow-300 dark:fill-yellow-500/40" />
        <circle cx="228" cy="310" r="2" className="fill-pink-300 dark:fill-pink-500/40" />
        <circle cx="650" cy="304" r="2" className="fill-red-300 dark:fill-red-500/40" />
        <circle cx="658" cy="306" r="2.5" className="fill-yellow-200 dark:fill-yellow-400/40" />
        <circle cx="1100" cy="302" r="2.5" className="fill-pink-300 dark:fill-pink-400/40" />
        <circle cx="1108" cy="304" r="2" className="fill-yellow-300 dark:fill-yellow-500/40" />
      </svg>
    </div>
  );
}

function Tree({ x, y, scale }: { x: number; y: number; scale: number }) {
  const trunkX = x - 4 * scale;
  const trunkY = y + 5 * scale;
  return (
    <g>
      <rect
        x={trunkX}
        y={trunkY}
        width={8 * scale}
        height={28 * scale}
        rx={3}
        className="fill-amber-700 dark:fill-amber-900"
      />
      <ellipse cx={x} cy={y} rx={16 * scale} ry={14 * scale} className="fill-green-500 dark:fill-green-800" />
      <ellipse cx={x} cy={y - 12 * scale} rx={13 * scale} ry={12 * scale} className="fill-green-400 dark:fill-green-700" />
      <ellipse cx={x} cy={y - 22 * scale} rx={9 * scale} ry={10 * scale} className="fill-green-300 dark:fill-green-600" />
    </g>
  );
}
