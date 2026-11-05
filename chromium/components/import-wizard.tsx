import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/chrome-extension";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { browser } from "wxt/browser";
import { FolderOpen, Leaf, Loader2 } from "lucide-react";
import {
  buildImportModel,
  type NativeNode,
} from "@/utils/import-tree";
import {
  DEFAULT_DESTINATION,
  destinationArgFor,
  destinationBaseDepth,
  type ImportDestination,
} from "@/utils/import-destination";
import { buildCollectionOptions } from "@/utils/organize";
import { derivePopupAuthState } from "@/utils/popup-state";
import { useStalled } from "@/hooks/use-stalled";
import { allowanceWarningFor } from "@/utils/allowance";
import { DestinationPicker } from "@/components/import-destination";
import { FolderNode, FolderCheckbox } from "@/components/import-folders";
import { AuthStalled } from "@/components/auth-stalled";
import { ImportComplete } from "@/components/import-complete";
import type { ImportResult } from "@/utils/import-result";
import { parseReturnTabId } from "@/utils/setup-return";


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
        <section className="grid w-full gap-5 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="flex flex-col justify-between rounded-3xl border border-white/50 bg-white/35 p-6 shadow-2xl shadow-emerald-950/10 backdrop-blur-md dark:border-white/10 dark:bg-slate-950/35 dark:shadow-black/30">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/75 px-4 py-2 text-xs font-semibold text-emerald-800 shadow-sm backdrop-blur dark:border-emerald-700/60 dark:bg-emerald-950/60 dark:text-emerald-200">
                <Leaf className="h-3.5 w-3.5" />
                Grow your bookmark.land library
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-sky-950 drop-shadow-sm sm:text-4xl dark:text-sky-50">
                Import browser bookmarks
              </h1>
              <p className="mt-4 max-w-md text-sm leading-6 text-sky-900/80 dark:text-sky-100/75">
                Bring your folders over as bookmark.land collections. Re-runs
                are safe, duplicates are skipped, and your browser bookmarks
                are never modified.
              </p>
            </div>

            <div className="mt-8 grid gap-3 text-sm text-slate-700 dark:text-slate-200">
              <ImportPromise icon="🌲" title="Folders stay organized" />
              <ImportPromise icon="⛰️" title="Deep trees flatten safely" />
              <ImportPromise icon="✨" title="No duplicates on re-import" />
            </div>
          </div>

          <div className="rounded-3xl border border-white/70 bg-white/85 p-4 shadow-2xl shadow-emerald-950/15 backdrop-blur-xl sm:p-5 dark:border-white/10 dark:bg-slate-950/80 dark:shadow-black/40">
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
      <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
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
        className="self-start rounded-full bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm shadow-emerald-900/20 transition hover:-translate-y-0.5 hover:bg-emerald-500 focus-visible:outline-2 focus-visible:outline-ring"
      >
        Sign in to bookmark.land
      </button>
    </div>
  );
}

function Wizard() {
  const [roots, setRoots] = useState<NativeNode[] | null>(null);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [destination, setDestination] =
    useState<ImportDestination>(DEFAULT_DESTINATION);
  const [phase, setPhase] = useState<"preview" | "importing" | "done" | "failed">(
    "preview",
  );
  const [summary, setSummary] = useState<ImportResult | null>(null);
  const runImport = useAction(api.importTree.importTree);
  // Session summary — remaining allowance for the over-limit warning.
  const sessionSummary = useQuery(api.subscriptions.getSubscriptionInfo);
  const collections = useQuery(api.collections.list);

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
        if (!cancelled) setRoots([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(
    () => buildCollectionOptions(collections ?? []),
    [collections],
  );
  // The destination's depth shifts where folder flattening kicks in.
  const baseDepth = destinationBaseDepth(
    destination,
    (id) => options.find((o) => o.id === id)?.depth,
  );
  const model = useMemo(
    () => (roots ? buildImportModel(roots, excluded, baseDepth) : null),
    [roots, excluded, baseDepth],
  );
  const merged = useMemo(() => new Set(model?.mergedFolderIds), [model]);
  const destinationArg = destinationArgFor(destination);

  if (!roots || !model) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center text-slate-600 dark:text-slate-300">
        <FolderOpen className="h-7 w-7 text-emerald-600" />
        <p>Reading your browser bookmark folders…</p>
      </div>
    );
  }

  if (phase === "done" && summary) {
    return (
      <ImportComplete
        result={summary}
        sample={model.bookmarks}
        returnTabId={parseReturnTabId(window.location.search)}
        onImportMore={() => {
          setSummary(null);
          setPhase("preview");
        }}
      />
    );
  }

  if (roots.length === 0) return <NoBrowserBookmarks />;

  const toggle = (id: string) => {
    const next = new Set(excluded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExcluded(next);
  };

  const start = async () => {
    // Re-derived so the default collection is named after the click.
    const arg = destinationArgFor(destination, new Date());
    if (!arg || phase === "importing") return;
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
      setSummary(result);
      setPhase("done");
    } catch (error) {
      console.error("[extension] Browser import failed", error);
      setPhase("failed");
    }
  };

  const nothingSelected = model.importableCount === 0;
  const warning = sessionSummary
    ? allowanceWarningFor(
        model.importableCount,
        sessionSummary.bookmarkCount,
        sessionSummary.limit,
      )
    : null;

  return (
    <div className="flex flex-col gap-4">
      <Step number={1} title="Choose folders to import" hint="Untick anything you want to leave behind.">
        <div className="max-h-[26rem] space-y-2 overflow-y-auto pr-1">
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
                mergedNote={merged.has(root.id)}
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
                      merged={merged}
                      onToggle={toggle}
                    />
                  ))}
              </div>
            </section>
          ))}
        </div>
      </Step>

      <Step
        number={2}
        title="Import into"
        hint="Your folders become collections inside it."
        dimmed={nothingSelected}
      >
        <DestinationPicker
          value={destination}
          onChange={setDestination}
          options={options}
          loading={collections === undefined}
          disabled={phase === "importing" || nothingSelected}
        />
      </Step>

      <Step number={3} title="Start the import" dimmed={nothingSelected}>
        {warning && (
          <div className="mb-3 flex flex-col gap-2 rounded-2xl border border-amber-300 bg-amber-50/90 p-4 text-amber-950 shadow-sm dark:border-amber-700 dark:bg-amber-950/35 dark:text-amber-100">
            <p className="font-semibold">
              Your plan allows {warning.remaining} more bookmarks, but{" "}
              {model.importableCount} are selected.
            </p>
            <p className="text-sm text-amber-900/75 dark:text-amber-100/75">
              The import will add the first {warning.willImport} (in the order
              they appear in your browser tree) and skip the remaining{" "}
              {warning.willSkip}. Already-saved bookmarks and restores from
              Trash don&apos;t consume additional allowance.
            </p>
            <button
              type="button"
              onClick={() =>
                void browser.tabs.create({
                  url: `${import.meta.env.WXT_WEB_APP_URL}/settings`,
                })
              }
              className="self-start rounded-full bg-amber-500 px-3 py-1.5 font-semibold text-white transition hover:bg-amber-400"
            >
              Upgrade for unlimited bookmarks
            </button>
          </div>
        )}

        {phase === "failed" && (
          <p className="mb-3 rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300">
            Import failed — nothing may have been written. You can safely try
            again; re-runs never duplicate.
          </p>
        )}

        <button
          type="button"
          disabled={phase === "importing" || nothingSelected || destinationArg === null}
          onClick={() => void start()}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-emerald-900/20 transition hover:-translate-y-0.5 hover:bg-emerald-500 focus-visible:outline-2 focus-visible:outline-ring disabled:translate-y-0 disabled:opacity-50"
        >
          {phase === "importing" && <Loader2 className="h-4 w-4 animate-spin" />}
          {phase === "importing"
            ? "Importing…"
            : nothingSelected
              ? "Select at least one folder"
              : `Import ${model.importableCount} bookmark${model.importableCount === 1 ? "" : "s"}`}
        </button>
      </Step>

      <p className="px-1 text-center text-xs text-slate-500 dark:text-slate-400">
        {model.importableCount} selected · {model.folders.length} folder
        {model.folders.length === 1 ? "" : "s"}
        {model.excludedSchemeCount > 0 &&
          ` · ${model.excludedSchemeCount} skipped (not web pages)`}
      </p>
    </div>
  );
}

/** One numbered step of the wizard; later steps dim until step 1 has a pick. */
function Step({
  number,
  title,
  hint,
  dimmed = false,
  children,
}: {
  number: number;
  title: string;
  hint?: string;
  dimmed?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`import-step-${number}`}
      className={`rounded-2xl border border-emerald-100 bg-emerald-50/65 p-4 shadow-sm transition-opacity dark:border-emerald-900/60 dark:bg-emerald-950/25 ${dimmed ? "opacity-50" : ""}`}
    >
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white shadow-sm">
          {number}
        </span>
        <div>
          <h2
            id={`import-step-${number}`}
            className="font-semibold text-emerald-950 dark:text-emerald-100"
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
        className="rounded-full bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-emerald-500 focus-visible:outline-2 focus-visible:outline-ring"
      >
        Reload
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
