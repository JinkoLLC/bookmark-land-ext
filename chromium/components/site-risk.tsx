import { useMemo, useState } from "react";
import { useQueries, useQuery } from "convex/react";
import { api } from "@convex/api";
import { siteBatches } from "@/utils/site-batches";
import type { FunctionReturnType } from "convex/server";
import { ChevronDown, ShieldAlert, X } from "lucide-react";

export type SiteRisk = FunctionReturnType<typeof api.siteSecurity.flaggedSites>[number];

// Same wording as the web badge.
// flaggedSites only returns these three levels.
const LEVEL_LABEL: Record<string, string> = {
  vulnerable: "Vulnerable",
  endOfLife: "End-of-life",
  possiblyAffected: "Possibly affected",
};

const colorFor = (risk: SiteRisk) =>
  risk.riskLevel === "possiblyAffected"
    ? "text-neutral-500"
    : "text-amber-600 dark:text-amber-500";

/**
 * The flagged Sites among `domains`, keyed by Site (a bookmark's domain).
 */
export function useSiteRisks(domains: ReadonlyArray<string>): Map<string, SiteRisk> {
  // A stable, sorted argument keeps the subscriptions from churning on
  // re-render. flaggedSites reads 500 Sites per call, so a list paged past
  // that is looked up in batches.
  const key = siteBatches(domains)
    .map((batch) => batch.join("\n"))
    .join("\n\n");
  const queries = useMemo(
    () =>
      Object.fromEntries(
        (key ? key.split("\n\n") : []).map((batch, i) => [
          String(i),
          { query: api.siteSecurity.flaggedSites, args: { sites: batch.split("\n") } },
        ]),
      ),
    [key],
  );
  const results = useQueries(queries);
  return useMemo(() => {
    const risks = new Map<string, SiteRisk>();
    for (const result of Object.values(results)) {
      // undefined while loading; an Error leaves that batch unflagged.
      if (!Array.isArray(result)) continue;
      for (const risk of result as SiteRisk[]) risks.set(risk.site, risk);
    }
    return risks;
  }, [results]);
}

/**
 * Popup warning for the active page's Site: "Security warning" and the level,
 * with a Why? button that opens the same details as the side panel.
 */
export function SiteRiskNotice({ risk }: { risk: SiteRisk }) {
  const [open, setOpen] = useState(false);
  const detailsId = "popup-site-risk";
  const amber = risk.riskLevel !== "possiblyAffected";
  return (
    <div
      role="alert"
      className={`rounded-md border p-2.5 ${
        amber
          ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
          : "border-neutral-300 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/60"
      }`}
    >
      <div className="flex items-center gap-2">
        <ShieldAlert className={`h-5 w-5 shrink-0 ${colorFor(risk)}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Security warning</p>
          <p className="text-xs opacity-80">{LEVEL_LABEL[risk.riskLevel]} site</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={detailsId}
          className="flex shrink-0 items-center gap-0.5 rounded px-1.5 py-1 text-xs font-medium underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          Why?
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      </div>
      {open && (
        <SiteRiskDetails risk={risk} id={detailsId} onClose={() => setOpen(false)} embedded />
      )}
    </div>
  );
}

/** What each level means, in one line (wording follows /help/site-security). */
const LEVEL_MEANING: Record<string, string> = {
  vulnerable:
    "The site reports a software version with a publicly known security issue (a tracked CVE).",
  endOfLife:
    "The site runs software whose release line no longer gets security fixes.",
  possiblyAffected:
    "A known issue matches, but the version comes from a distro package that may already be patched.",
};

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
function checkedAgo(timestamp: number): string {
  const elapsed = timestamp - Date.now();
  for (const [unit, ms] of [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ] as const) {
    if (Math.abs(elapsed) >= ms) return relative.format(Math.round(elapsed / ms), unit);
  }
  return relative.format(0, "minute");
}

/**
 * Shield button for a Bookmark row: toggles the row's Site security details.
 * A sibling of the row's open-bookmark button (buttons can't nest).
 */
export function SiteRiskToggle({
  risk,
  open,
  onToggle,
  detailsId,
}: {
  risk: SiteRisk;
  open: boolean;
  onToggle: () => void;
  detailsId: string;
}) {
  const label = `Site security: ${LEVEL_LABEL[risk.riskLevel]}. ${open ? "Hide" : "Show"} why`;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={detailsId}
      aria-label={label}
      title={label}
      className={`shrink-0 rounded p-1 hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-ring dark:hover:bg-neutral-700 ${colorFor(risk)} ${open ? "bg-neutral-200 dark:bg-neutral-700" : ""}`}
    >
      <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

/**
 * The box that slides down under a flagged Bookmark row: the level and what
 * it means, the software found and its known issues, and when the site was
 * last checked. Loads `siteDetail` only while open.
 */
export function SiteRiskDetails({
  risk,
  id,
  onClose,
  embedded = false,
}: {
  risk: SiteRisk;
  id: string;
  onClose: () => void;
  /** Inside the popup's warning box, which already names the level and
   * carries the toggle: no own frame, title or close button. */
  embedded?: boolean;
}) {
  const detail = useQuery(api.siteSecurity.siteDetail, { site: risk.site });
  const amber = risk.riskLevel !== "possiblyAffected";
  const frame = embedded
    ? "mt-2 border-t border-current/15 pt-2"
    : `mx-1 mb-1 rounded-md border p-2.5 ${
        amber
          ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
          : "border-neutral-300 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/60"
      }`;

  return (
    <div
      id={id}
      role="region"
      aria-label={`Site security for ${risk.site}`}
      className={`bl-slide-down text-xs ${frame}`}
    >
      {!embedded && (
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold">Site security: {LEVEL_LABEL[risk.riskLevel]}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-1 rounded p-1 opacity-70 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
      <p className={embedded ? "opacity-80" : "mt-0.5 opacity-80"}>{LEVEL_MEANING[risk.riskLevel]}</p>

      {detail === undefined && <p className="mt-2 opacity-70">Loading details…</p>}
      {detail && detail.detectedSoftware.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {detail.detectedSoftware.map((software) => (
            <li key={`${software.productId}-${software.version}`}>
              <p className="font-medium">
                {software.product} {software.version}
              </p>
              <ul className="ml-3 list-disc opacity-90">
                {detail.findings
                  .filter((f) => f.productId === software.productId && f.version === software.version)
                  .map((finding, i) => (
                    <li key={i}>
                      {finding.level === "endOfLife" ? (
                        finding.eolDate
                          ? `End-of-life since ${finding.eolDate}: no security fixes any more.`
                          : "End-of-life: no security fixes any more."
                      ) : (
                        <>
                          <a
                            href={`https://nvd.nist.gov/vuln/detail/${finding.cveId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium underline underline-offset-2"
                          >
                            {finding.cveId}
                          </a>
                          {finding.cvss !== undefined && ` · CVSS ${finding.cvss.toFixed(1)}`}
                          {finding.kev && <span className="font-medium"> · exploited in the wild</span>}
                        </>
                      )}
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 border-t border-current/15 pt-1.5 opacity-70">
        {detail?.lastScannedAt ? `Checked ${checkedAgo(detail.lastScannedAt)} · ` : ""}
        Based on the site&apos;s homepage.{" "}
        <a
          href={`${import.meta.env.WXT_WEB_APP_URL}/help/site-security`}
          target="_blank"
          rel="noreferrer"
          className="font-medium underline underline-offset-2"
        >
          Learn more
        </a>
      </p>
    </div>
  );
}
