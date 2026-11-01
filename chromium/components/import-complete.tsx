import type { CSSProperties } from "react";
import { browser } from "wxt/browser";
import { ArrowRight, FolderOpen, PartyPopper } from "lucide-react";
import {
  importAddedAnything,
  importLinks,
  type ImportResult,
} from "@/utils/import-result";

const SAMPLE_SIZE = 8;

const openWebPath = (path: string) =>
  void browser.tabs.create({ url: `${import.meta.env.WXT_WEB_APP_URL}${path}` });

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/**
 * The Browser import's last screen: a celebration when bookmarks came over
 * (confetti, the count, a peek at what arrived, links to the new
 * collections), or a calm note when everything was already saved.
 */
export function ImportComplete({
  result,
  sample,
  onImportMore,
}: {
  result: ImportResult;
  /** The selection in tree order; may include ones that were duplicates. */
  sample: { url: string; title?: string }[];
  onImportMore: () => void;
}) {
  const links = importLinks(result);
  const festive = importAddedAnything(result);
  const added = result.imported + result.restored;
  const shown = sample.slice(0, Math.min(SAMPLE_SIZE, added));
  // With duplicates in the selection the sample may list a few that were
  // already saved, so it is labelled as the selection rather than the result.
  const sampleTitle = result.duplicates > 0 ? "Some of what you picked" : "Some of what came over";

  return (
    <div className="relative flex flex-col gap-5 overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-b from-emerald-50 to-white p-6 shadow-sm dark:border-emerald-900/60 dark:from-emerald-950/50 dark:to-slate-950/60">
      {festive && <ConfettiBurst />}

      <div className="relative text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-900/25">
          <PartyPopper className="h-7 w-7" aria-hidden="true" />
        </div>
        {festive ? (
          <>
            <h2 className="text-3xl font-extrabold tracking-tight text-emerald-950 dark:text-emerald-50">
              {added} bookmark{added === 1 ? "" : "s"} imported!
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Your library just grew. Everything is searchable on bookmark.land
              and in the side panel.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-emerald-950 dark:text-emerald-50">
              Already all here
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Every bookmark you picked was already in your library, so nothing
              new was added.
            </p>
          </>
        )}
      </div>

      <CountsLine result={result} />

      {festive && shown.length > 0 && (
        <section aria-label={sampleTitle} className="relative">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {sampleTitle}
          </h3>
          <ul className="divide-y divide-emerald-100 overflow-hidden rounded-xl border border-emerald-100 bg-white/80 dark:divide-emerald-900/50 dark:border-emerald-900/60 dark:bg-slate-900/70">
            {shown.map((b) => (
              <li key={b.url} className="flex min-w-0 items-baseline gap-2 px-3 py-2 text-sm">
                <span className="truncate font-medium">{b.title?.trim() || hostOf(b.url)}</span>
                <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                  {hostOf(b.url)}
                </span>
              </li>
            ))}
          </ul>
          {added > shown.length && (
            <p className="mt-1.5 px-1 text-xs text-slate-500 dark:text-slate-400">
              +{added - shown.length} more
            </p>
          )}
        </section>
      )}

      {links.collections.length > 1 && (
        <section aria-label="Your new collections" className="relative">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Your new collections
          </h3>
          <div className="flex flex-wrap gap-2">
            {links.collections.map((c) => (
              <button
                key={c.path}
                type="button"
                onClick={() => openWebPath(c.path)}
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white/85 px-3 py-1.5 text-sm font-medium text-emerald-900 transition hover:border-emerald-400 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-ring dark:border-emerald-800 dark:bg-slate-900/70 dark:text-emerald-100 dark:hover:bg-emerald-950/60"
              >
                <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                {c.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="relative flex flex-wrap items-center gap-3">
        <button
          type="button"
          autoFocus
          onClick={() => openWebPath(festive ? links.primaryPath : "/dashboard")}
          className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 font-semibold text-white shadow-lg shadow-emerald-900/20 transition hover:-translate-y-0.5 hover:bg-emerald-500 focus-visible:outline-2 focus-visible:outline-ring"
        >
          {festive ? "See my imported bookmarks on bookmark.land" : "Open my library"}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onImportMore}
          className="text-sm font-medium text-emerald-800 underline-offset-4 hover:underline dark:text-emerald-200"
        >
          Import more
        </button>
      </div>
    </div>
  );
}

function CountsLine({ result }: { result: ImportResult }) {
  const parts = [
    result.imported > 0 && `${result.imported} new`,
    result.restored > 0 && `${result.restored} restored from Trash`,
    result.duplicates > 0 && `${result.duplicates} already in your library`,
    result.skipped > 0 && `${result.skipped} skipped (plan limit or error)`,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <p className="relative text-center text-sm text-slate-600 dark:text-slate-300">
      {parts.join(" · ")}
    </p>
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
