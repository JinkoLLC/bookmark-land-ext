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

/**
 * An address cut where it may wrap: after `/`, `-`, `?`, `&`, `=`, `.` and
 * `_` (never between two slashes). The view puts a `<wbr>` between the parts.
 */
export const addressParts = (address: string) => address.split(/(?<=[/\-?&=._])(?!\/)/);

/** `bkmk.to/k7m2qx`: a short link named without its scheme. */
export const shortLinkText = (shortUrl: string) => shortUrl.replace(/^https?:\/\//, "");
/** What a tracked QR code encodes: the redirect counts `?qr` as a scan. */
export const trackedQrAddress = (shortUrl: string) => `${shortUrl}?qr`;

const count = (n: number) => n.toLocaleString();

/**
 * "38 of 50 left this month · Pro plan". On a plan that caps the short links
 * held at once, that cap is named only when it is reached or one away:
 * "10 left this month · 24 of 25 in use".
 */
export function allowanceLine(usage: ShortLinkUsage, withPlan = false): string {
  const left = count(Math.max(0, usage.monthly - usage.created));
  if (usage.liveCap !== undefined && (usage.held ?? 0) >= usage.liveCap - 1) {
    // The server counts held up to one past the cap.
    return `${left} left this month · ${count(Math.min(usage.held ?? 0, usage.liveCap))} of ${count(usage.liveCap)} in use`;
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
  const plan = TIER_LABEL[usage.tier];
  return {
    sentences: [
      ...(monthly ? [`You've used this month's ${count(usage.monthly)} short links. You can make more on ${resets}.`] : []),
      // Deleting is permanent and gives nothing back this month, so it is only asked for when it would help now.
      ...(kept && monthly ? [`After that you'd also need to delete one: the ${plan} plan holds up to ${count(usage.liveCap!)} at a time.`] : []),
      ...(kept && !monthly ? [`You have ${count(usage.liveCap!)} short links, and the ${plan} plan holds up to ${count(usage.liveCap!)} at a time. Delete one to make room.`] : []),
    ],
    upgrade: monthly && (usage.tier === "free" || usage.tier === "edu"),
    manage: kept,
  };
}

// ---- the unfinished-create record ----------------------------------------------

/**
 * Where a creation that hasn't been answered is recorded in the extension's
 * session storage: one key per account id (the stable one the background
 * worker tracks, never the email, which can be missing on one open and there
 * on the next) and parsed address, so a record only ever applies to the
 * account and page it was made for. It has no time
 * limit: it goes when the request is answered, when a short link for the
 * address shows up in the list, or with the browser session.
 */
export const createRecordKey = (accountId: string, address: string) =>
  `bookmark-land:short-link-create:${accountId}:${address}`;

/** When the recorded creation started; null for no record or one that isn't ours. */
export function readCreateRecord(value: unknown): number | null {
  const at = (value as { at?: unknown } | null | undefined)?.at;
  return typeof at === "number" && Number.isFinite(at) ? at : null;
}

/** The record's sentence, with the date when the attempt wasn't today. */
export function unfinishedSentence(at: number, now: number, locale?: string): string {
  const started = new Date(at);
  // "10:02 AM" stays on one line.
  const time = started.toLocaleTimeString(locale, { timeStyle: "short" }).replace(/\s/g, "\u00a0");
  const sameDay = started.toDateString() === new Date(now).toDateString();
  const day = sameDay ? "" : ` on ${started.toLocaleDateString(locale, { month: "short", day: "numeric" })}`;
  return `You started a short link for this page at ${time}${day} and the popup closed before it finished. We couldn't confirm whether it was created.`;
}

// ---- view ----------------------------------------------------------------------

/** One creation request, kept in the popup's root so leaving the view doesn't lose it. */
export type ShortLinkCreation =
  | { status: "creating"; slow: boolean }
  /** `copied`: whether the click's clipboard write worked; null while the clipboard hasn't answered (or wasn't asked). */
  | { status: "created"; shortUrl: string; copied: boolean | null }
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
      outcome: "created" | "existing";
      /** The creation's own clipboard write: true = it worked, false = it was refused, null = pending or none. */
      copied: boolean | null;
    }
  /**
   * A creation was started and the popup closed before its answer. "Check
   * again" asks the server; "Start over" drops the record, which leaves the
   * ordinary view. `limit`: the limit sentences are shown here too.
   */
  | { kind: "unfinished"; at: number; checking: boolean; limit: boolean }
  /** The month's allowance or the cap on short links held at once is reached. `deleted`: as in "create". */
  | { kind: "limit"; deleted: boolean }
  | {
      kind: "create";
      /** Why Create is disabled now, if it is. */
      wait: null | "allowance" | "page" | "creating" | "creating-slow";
      /** Only the newest 1,000 short links were checked. */
      truncated: boolean;
      /** The page is a Bookmark, so the short link is attached to it. */
      saved: boolean;
      failed: boolean;
      /** The short link this view showed was deleted elsewhere. */
      deleted: boolean;
    };

/**
 * What the Short link view shows. Precedence: a finished creation (its
 * status and destination follow its row once the list has it); short
 * links closed to the account; a creation in flight or refused; an address
 * that is never sent; the short link last confirmed, while the list can't
 * say otherwise; load failures (the account id among them); loading;
 * the page's existing short link; an unfinished creation; a reached limit;
 * then Create.
 *
 * A short link whose row was seen in the list and is missing from a later
 * complete list was deleted: the ordinary view follows, marked `deleted`.
 * A created one whose row hasn't been seen yet is only waiting for it.
 */
export function deriveShortLinkView(input: {
  /** The page's address, parsed (see parseAddress). */
  address: string;
  /** undefined = loading */
  usage: ShortLinkUsage | Error | undefined;
  list: ShortLinkList | Error | undefined;
  /** The account's stable id: undefined = not known yet, null = the worker couldn't say */
  accountId: string | null | undefined;
  /** undefined = Quick save is still checking or saving the page; null = not a Bookmark */
  bookmarkId: string | null | undefined;
  creation: ShortLinkCreation | null;
  /** When an unanswered creation for this account and address started; undefined = not read yet (it can't be before the account id is known) */
  record: number | null | undefined;
  /** The row of the short link shown, as the list last had it; null = not seen in the list (yet) */
  seen: ShortLinkRow | null;
}): ShortLinkView {
  const { address, usage, list, creation, record, seen } = input;
  const live = list && !(list instanceof Error) ? list : null;
  const rowOf = (shortUrl: string) => live?.links.find((link) => link.shortUrl === shortUrl);
  // Only a complete list can say a short link is gone: a failed or cut-off one leaves the last confirmed state.
  const deleted = seen !== null && live !== null && !live.truncated && !rowOf(seen.shortUrl);
  if (creation?.status === "created" && !(deleted && seen.shortUrl === creation.shortUrl)) {
    // Shown at once; the list's row, when it arrives, says whether it still opens and where.
    const row = rowOf(creation.shortUrl) ?? (seen?.shortUrl === creation.shortUrl ? seen : undefined);
    return {
      kind: "link",
      shortUrl: creation.shortUrl,
      targetUrl: row?.targetUrl ?? address,
      state: row ? shortLinkState(row) : "active",
      outcome: "created",
      copied: creation.copied,
    };
  }
  if (usage && !(usage instanceof Error) && !usage.available) return { kind: "unavailable" };
  const create = { kind: "create", truncated: false, saved: input.bookmarkId != null, failed: false, deleted } as const;
  if (creation?.status === "creating") return { ...create, wait: creation.slow ? "creating-slow" : "creating" };
  if (creation?.status === "refused") return { kind: "refused", sentence: creation.sentence };
  if (refusedLocally(address)) return { kind: "refused", sentence: "This address can't be shortened." };
  const match = live && findShortLink(live.links, address);
  const link = (row: ShortLinkRow): ShortLinkView => ({
    kind: "link",
    shortUrl: row.shortUrl,
    targetUrl: row.targetUrl,
    state: shortLinkState(row),
    outcome: "existing",
    copied: null,
  });
  // Its row is missing from a list that can't be read, or only in part: the last confirmed state stands.
  if (seen && !deleted && !match && !rowOf(seen.shortUrl)) return link(seen);
  if (usage instanceof Error || list instanceof Error || input.accountId === null) return { kind: "failed" };
  // With a record, the view never falls back to a plain Create while the list loads.
  if (record != null && list === undefined) return { kind: "unfinished", at: record, checking: true, limit: false };
  if (usage === undefined || list === undefined || record === undefined) return { ...create, wait: "allowance" };

  if (match) return link(match);
  const limit = limitReached(usage) !== null;
  if (record !== null) return { kind: "unfinished", at: record, checking: false, limit };
  if (limit) return { kind: "limit", deleted };
  return {
    ...create,
    wait: input.bookmarkId === undefined ? "page" : null,
    truncated: list.truncated,
    failed: creation?.status === "failed",
  };
}
