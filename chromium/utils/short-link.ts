import { ConvexError } from "convex/values";

/** Mirrors the server's limit on a short link's destination. */
const MAX_TARGET_LENGTH = 2048;
const SHORT_LINK_HOST = "bkmk.to";

type Tier = "free" | "edu" | "pro" | "business";
const TIER_LABEL: Record<Tier, string> = { free: "Free", edu: "Education", pro: "Pro", business: "Business" };

export type ShortLinkRow = {
  shortUrl: string;
  targetUrl: string;
  status: "active" | "blocked";
  userPaused: boolean;
  lapsePaused?: boolean;
};
export type ShortLinkList = { links: ShortLinkRow[]; truncated: boolean };
export type ShortLinkUsage = {
  tier: Tier;
  /** Short links made this month, and the month's allowance. */
  created: number;
  monthly: number;
  /** Free and Education also cap the short links kept at once. */
  liveCap?: number;
  held?: number;
  resetsAt: number;
  /** False while short links aren't open to the account. */
  available: boolean;
};

/**
 * An address the way the server stores a short link's destination
 * (`new URL(x).href`, never the bookmark `normalizeUrl`); null unless it is
 * http or https.
 */
export function parseAddress(url: string | undefined): string | null {
  try {
    const parsed = new URL(url ?? "");
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

/**
 * True for an address the server's validation always refuses, so the popup
 * never sends it. The server's blocklist and its list of other shorteners
 * stay on the server.
 */
export function refusedLocally(address: string): boolean {
  const url = new URL(address);
  const host = url.hostname;
  return (
    url.username !== "" ||
    url.password !== "" ||
    /^\d+(\.\d+){3}$/.test(host) ||
    host.startsWith("[") ||
    !host.includes(".") ||
    host === SHORT_LINK_HOST ||
    host.endsWith(`.${SHORT_LINK_HOST}`) ||
    address.length > MAX_TARGET_LENGTH
  );
}

export type ShortLinkState = "active" | "paused" | "blocked";

/** Same precedence as the server's redirect: blocked, then paused (by the user or a lapsed plan). */
export function shortLinkState(link: ShortLinkRow): ShortLinkState {
  if (link.status === "blocked") return "blocked";
  return link.userPaused || link.lapsePaused ? "paused" : "active";
}

/**
 * The page's short link: an exact match of the parsed address, so a query or
 * fragment makes a different page. `links` is newest first; the newest
 * active match wins, then the newest match.
 */
export function findShortLink(links: ShortLinkRow[], address: string): ShortLinkRow | null {
  const matches = links.filter((link) => link.targetUrl === address);
  return matches.find((link) => shortLinkState(link) === "active") ?? matches[0] ?? null;
}

/** `bkmk.to/k7m2qx`: the short link as shown, without its scheme. */
export const shortLinkText = (shortUrl: string) => shortUrl.replace(/^https?:\/\//, "");
/** What a tracked QR code encodes: the redirect counts `?qr` as a scan. */
export const trackedQrAddress = (shortUrl: string) => `${shortUrl}?qr`;

const count = (n: number) => n.toLocaleString("en-US");

/** "38 of 50 left this month · Pro plan"; on plans that cap the kept short links, the kept count leads. */
export function allowanceLine(usage: ShortLinkUsage, withPlan = false): string {
  const left = count(Math.max(0, usage.monthly - usage.created));
  if (usage.liveCap !== undefined) {
    return `${count(Math.min(usage.held ?? 0, usage.liveCap))} of ${count(usage.liveCap)} kept · ${left} left this month`;
  }
  return `${left} of ${count(usage.monthly)} left this month${withPlan ? ` · ${TIER_LABEL[usage.tier]} plan` : ""}`;
}

/** Why no short link can be created now (the monthly sentence first), or null when one can. */
export function limitReached(
  usage: ShortLinkUsage,
  locale?: string,
): { sentences: string[]; upgrade: boolean; manage: boolean } | null {
  const monthly = usage.created >= usage.monthly;
  const kept = usage.liveCap !== undefined && (usage.held ?? 0) >= usage.liveCap;
  if (!monthly && !kept) return null;
  const resets = new Date(usage.resetsAt).toLocaleDateString(locale, { month: "short", day: "numeric" });
  return {
    sentences: [
      ...(monthly ? [`You've made all ${count(usage.monthly)} short links for this month. You can make more on ${resets}.`] : []),
      ...(kept ? [`The ${TIER_LABEL[usage.tier]} plan keeps up to ${count(usage.liveCap!)} short links at once. Delete one to make room.`] : []),
    ],
    upgrade: monthly && (usage.tier === "free" || usage.tier === "edu"),
    manage: kept,
  };
}

// ---- the unfinished-create record ----------------------------------------------

/**
 * Where a creation that hasn't been answered is recorded in the extension's
 * session storage: one key per account and parsed address, so a record only
 * ever applies to the account and page it was made for. It has no time
 * limit: it goes when the request is answered, when a short link for the
 * address shows up in the list, or with the browser session.
 */
export const createRecordKey = (account: string, address: string) =>
  `bookmark-land:short-link-create:${account}:${address}`;

/** When the recorded creation started; null for no record or one that isn't ours. */
export function readCreateRecord(value: unknown): number | null {
  const at = (value as { at?: unknown } | null | undefined)?.at;
  return typeof at === "number" && Number.isFinite(at) ? at : null;
}

/** The record's sentence, with the date when the attempt wasn't today. */
export function unfinishedSentence(at: number, now: number, locale?: string): string {
  const started = new Date(at);
  const time = started.toLocaleTimeString(locale, { timeStyle: "short" });
  const sameDay = started.toDateString() === new Date(now).toDateString();
  const day = sameDay ? "" : ` on ${started.toLocaleDateString(locale, { month: "short", day: "numeric" })}`;
  return `You started a short link for this page at ${time}${day} and the popup closed before it finished. We couldn't confirm whether it was created.`;
}

// ---- view ----------------------------------------------------------------------

/** One creation request, kept in the popup's root so leaving the view doesn't lose it. */
export type ShortLinkCreation =
  | { status: "creating"; slow: boolean }
  | { status: "created"; shortUrl: string; copied: boolean }
  /** The server refused the address; its sentence. Nothing was used. */
  | { status: "refused"; sentence: string }
  /** Any other failure; nothing was created, so Create is offered again. */
  | { status: "failed" };

/** The server's sentence when it refused the creation, or null for any other failure. */
export function refusalFrom(error: unknown): string | null {
  return error instanceof ConvexError && typeof error.data === "string" ? error.data : null;
}

export type ShortLinkView =
  /** Short links aren't open to this account. */
  | { kind: "unavailable" }
  | { kind: "refused"; sentence: string }
  /** The short links or the allowance failed to load. */
  | { kind: "failed" }
  | {
      kind: "link";
      shortUrl: string;
      targetUrl: string;
      state: ShortLinkState;
      outcome: "created-copied" | "created" | "existing";
    }
  /** A creation was started and the popup closed before its answer. */
  | { kind: "unfinished"; at: number; checking: boolean }
  /** The month's allowance or the kept-at-once cap is reached. */
  | { kind: "limit" }
  | {
      kind: "create";
      /** Why Create is disabled now, if it is. */
      wait: null | "allowance" | "page" | "creating" | "creating-slow";
      /** Only the newest 1,000 short links were checked. */
      truncated: boolean;
      /** The page is a Bookmark, so the short link is attached to it. */
      saved: boolean;
      failed: boolean;
    };

/**
 * What the Short link view shows. Precedence: a finished creation; short
 * links closed to the account; a creation in flight or refused; an address
 * that is never sent; load failures; loading; the page's existing short
 * link; an unfinished creation; a reached limit; then Create.
 */
export function deriveShortLinkView(input: {
  /** The page's address, parsed (see parseAddress). */
  address: string;
  /** undefined = loading */
  usage: ShortLinkUsage | Error | undefined;
  list: ShortLinkList | Error | undefined;
  /** undefined = Quick save is still checking or saving the page; null = not a Bookmark */
  bookmarkId: string | null | undefined;
  creation: ShortLinkCreation | null;
  /** When an unanswered creation for this account and address started; undefined = not read yet */
  record: number | null | undefined;
}): ShortLinkView {
  const { address, usage, list, creation, record } = input;
  if (creation?.status === "created") {
    return {
      kind: "link",
      shortUrl: creation.shortUrl,
      targetUrl: address,
      state: "active",
      outcome: creation.copied ? "created-copied" : "created",
    };
  }
  if (usage && !(usage instanceof Error) && !usage.available) return { kind: "unavailable" };
  const create = { kind: "create", truncated: false, saved: input.bookmarkId != null, failed: false } as const;
  if (creation?.status === "creating") return { ...create, wait: creation.slow ? "creating-slow" : "creating" };
  if (creation?.status === "refused") return { kind: "refused", sentence: creation.sentence };
  if (refusedLocally(address)) return { kind: "refused", sentence: "This address can't be shortened." };
  if (usage instanceof Error || list instanceof Error) return { kind: "failed" };
  // With a record, the view never falls back to a plain Create while the list loads.
  if (record != null && list === undefined) return { kind: "unfinished", at: record, checking: true };
  if (usage === undefined || list === undefined || record === undefined) return { ...create, wait: "allowance" };

  const match = findShortLink(list.links, address);
  if (match) {
    return { kind: "link", shortUrl: match.shortUrl, targetUrl: match.targetUrl, state: shortLinkState(match), outcome: "existing" };
  }
  if (record !== null) return { kind: "unfinished", at: record, checking: false };
  if (limitReached(usage)) return { kind: "limit" };
  return {
    ...create,
    wait: input.bookmarkId === undefined ? "page" : null,
    truncated: list.truncated,
    failed: creation?.status === "failed",
  };
}
