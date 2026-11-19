import { useEffect, useRef, type CSSProperties } from "react";
import { browser } from "wxt/browser";
import { ArrowRight, Check, CircleAlert, FolderOpen, PartyPopper } from "lucide-react";
import {
  formatCount,
  importCounts,
  importHeading,
  importLinks,
  importOutcome,
  importSubtext,
  sampleTitle,
  type ImportResult,
} from "@/utils/import-result";

const SAMPLE_SIZE = 8;

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const OUTLINE_BUTTON = `inline-flex min-h-6 items-center rounded-full border border-neutral-300 px-4 py-2 font-semibold transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800 ${FOCUS_RING}`;

const openWebPath = (path: string) =>
  void browser.tabs.create({ url: `${import.meta.env.WXT_WEB_APP_URL}${path}` });

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const ICONS = {
  imported: PartyPopper,
  partial: Check,
  "already-here": Check,
  nothing: CircleAlert,
};

/**
 * The Browser import's last screen: a celebration when everything picked
 * came over (confetti, the count, a peek at what arrived, links to the new
 * collections), and a plain account of it when some or all did not.
 */
export function ImportComplete({
  result,
  sample,
  planLimit = null,
  returnTabId = null,
  onImportMore,
}: {
  result: ImportResult;
  /** The selection in tree order; may include ones that were duplicates. */
  sample: { url: string; title?: string }[];
  /** The plan's bookmark limit, when the library reached it and that explains the skips. */
  planLimit?: number | null;
  /** The bookmark.land setup tab that opened this import; the main button returns there. */
  returnTabId?: number | null;
  onImportMore: () => void;
}) {
  const links = importLinks(result);
  const outcome = importOutcome(result);
  const added = result.imported + result.restored;
  const festive = outcome === "imported";
  const Icon = ICONS[outcome];
  const libraryPath = added > 0 ? links.primaryPath : "/dashboard";
  // The setup tab may have been closed since: then this is the usual "open the library".
  const backToSetup = async (tabId: number) => {
    try {
      const tab = await browser.tabs.update(tabId, { active: true });
      if (!tab) throw new Error("setup tab is gone");
      await browser.windows.update(tab.windowId, { focused: true });
      window.close();
    } catch {
      openWebPath(libraryPath);
    }
  };
  const shown = sample.slice(0, Math.min(SAMPLE_SIZE, added));
  const title = sampleTitle(result);
  const counts = importCounts(result);

  // The outcome is read first, by sighted and screen-reader users alike.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  return (
    <div className="relative flex min-w-0 flex-col gap-5 overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-b from-emerald-50 to-white p-4 shadow-sm sm:p-6 dark:border-emerald-900/60 dark:from-emerald-950/50 dark:to-slate-950/60">
      {festive && <ConfettiBurst />}

      <div className="relative text-center">
        <div
          className={`mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg shadow-emerald-900/25 ${
            outcome === "nothing" ? "bg-slate-600" : "bg-emerald-700"
          }`}
        >
          <Icon className="h-7 w-7" aria-hidden="true" />
        </div>
        <h2
          ref={heading}
          tabIndex={-1}
          className={`rounded-lg font-extrabold tracking-tight break-words text-emerald-950 dark:text-emerald-50 ${FOCUS_RING} ${
            festive ? "text-3xl" : "text-2xl"
          }`}
        >
          {importHeading(result)}
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{importSubtext(result)}</p>
      </div>

      {counts.length > 0 && (
        <p className="relative text-center text-sm text-slate-600 dark:text-slate-300">
          {counts.join(" · ")}
        </p>
      )}

      {shown.length > 0 && (
        <section aria-label={title} className="relative min-w-0">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            {title}
          </h3>
          <ul className="divide-y divide-emerald-100 overflow-hidden rounded-xl border border-emerald-100 bg-white/80 dark:divide-emerald-900/50 dark:border-emerald-900/60 dark:bg-slate-900/70">
            {shown.map((b) => (
              <li key={b.url} className="flex min-w-0 items-baseline gap-2 px-3 py-2 text-sm">
                <span className="truncate font-medium">{b.title?.trim() || hostOf(b.url)}</span>
                <span className="max-w-[45%] shrink-0 truncate text-xs text-slate-600 dark:text-slate-300">
                  {hostOf(b.url)}
                </span>
              </li>
            ))}
          </ul>
          {added > shown.length && (
            <p className="mt-1.5 px-1 text-xs text-slate-600 dark:text-slate-300">
              +{formatCount(added - shown.length)} more
            </p>
          )}
        </section>
      )}

      {links.collections.length > 1 && (
        <section aria-label="Your new collections" className="relative min-w-0">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            Your new collections
          </h3>
          <div className="flex flex-wrap gap-2">
            {links.collections.map((c) => (
              <button
                key={c.path}
                type="button"
                onClick={() => openWebPath(c.path)}
                className={`inline-flex max-w-full items-center gap-1.5 rounded-full border border-emerald-200 bg-white/85 px-3 py-1.5 text-sm font-medium text-emerald-900 transition hover:border-emerald-400 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-slate-900/70 dark:text-emerald-100 dark:hover:bg-emerald-950/60 ${FOCUS_RING}`}
              >
                <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{c.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {planLimit !== null && (
        <p className="relative text-sm text-slate-700 dark:text-slate-200">
          Your plan&apos;s limit of {formatCount(planLimit)} bookmarks was reached.
        </p>
      )}

      {returnTabId !== null && (
        <p className="relative text-center text-sm font-medium text-emerald-900 dark:text-emerald-100">
          Go back to setup to finish.
        </p>
      )}

      <div className="relative flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() =>
            returnTabId !== null ? void backToSetup(returnTabId) : openWebPath(libraryPath)
          }
          className={`inline-flex max-w-full items-center gap-2 rounded-full bg-emerald-700 px-5 py-2.5 text-left font-semibold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-800 motion-safe:hover:-translate-y-0.5 ${FOCUS_RING}`}
        >
          {returnTabId !== null
            ? "Back to setup"
            : added > 0
              ? "See my imported bookmarks"
              : "Open my library"}
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        </button>
        {planLimit !== null && (
          <button type="button" onClick={() => openWebPath("/settings")} className={OUTLINE_BUTTON}>
            Upgrade
          </button>
        )}
        <button
          type="button"
          onClick={onImportMore}
          className={`inline-flex min-h-6 items-center rounded px-1 text-sm font-medium text-emerald-800 underline-offset-4 hover:underline dark:text-emerald-200 ${FOCUS_RING}`}
        >
          Import more
        </button>
      </div>
    </div>
  );
}

const CONFETTI_COLORS = ["#10b981", "#0ea5e9", "#f59e0b", "#ec4899", "#8b5cf6", "#84cc16"];

/** A one-shot CSS confetti burst; skipped entirely for reduced motion. */
function ConfettiBurst() {
  // Deterministic spread (no Math.random in render).
  const pieces = Array.from({ length: 42 }, (_, i) => ({
    left: (i * 37) % 100,
    delay: ((i * 53) % 40) / 100,
    duration: 1.6 + ((i * 29) % 12) / 10,
    rotate: (i * 47) % 360,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    wide: i % 3 === 0,
  }));
  return (
    <div aria-hidden="true" className="bl-confetti pointer-events-none absolute inset-0">
      <style>{`
        @keyframes bl-confetti-fall {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(520px) rotate(540deg); opacity: 0; }
        }
        .bl-confetti span {
          position: absolute; top: 0; border-radius: 2px;
          animation: bl-confetti-fall var(--d) ease-in var(--delay) both;
        }
        @media (prefers-reduced-motion: reduce) { .bl-confetti { display: none; } }
      `}</style>
      {pieces.map((p, i) => (
        <span
          key={i}
          style={
            {
              left: `${p.left}%`,
              width: p.wide ? 10 : 6,
              height: p.wide ? 6 : 10,
              background: p.color,
              rotate: `${p.rotate}deg`,
              "--d": `${p.duration}s`,
              "--delay": `${p.delay}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
