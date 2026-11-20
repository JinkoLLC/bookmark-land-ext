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
    notPublic(address) ||
    host === SHORT_LINK_HOST ||
    host.endsWith(`.${SHORT_LINK_HOST}`) ||
    address.length > MAX_TARGET_LENGTH
  );
}

/** True for a host that is no public name: an IP address, or a name without a dot such as `localhost`. */
export function notPublic(address: string): boolean {
  const host = new URL(address).hostname;
  return /^\d+(\.\d+){3}$/.test(host) || host.startsWith("[") || !host.includes(".");
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
 * held at once, that cap is named one away from it ("10 left this month ·
 * 24 of 25 in use") and alone once it is reached, when what is left of the
 * month can't be used: "25 of 25 in use".
 */
export function allowanceLine(usage: ShortLinkUsage, withPlan = false): string {
  const left = count(Math.max(0, usage.monthly - usage.created));
  const held = usage.held ?? 0;
  if (usage.liveCap !== undefined && held >= usage.liveCap - 1) {
    // The server counts held up to one past the cap, so past it the exact number isn't known.
    if (held > usage.liveCap) return `More than ${count(usage.liveCap)} in use`;
    const inUse = `${count(held)} of ${count(usage.liveCap)} in use`;
    return held === usage.liveCap ? inUse : `${left} left this month · ${inUse}`;
  }
  return `${left} of ${count(usage.monthly)} left this month${withPlan ? ` · ${TIER_LABEL[usage.tier]} plan` : ""}`;
}

/** Why no short link can be created now (the monthly sentence first), or null when one can. */
export function limitReached(
  usage: ShortLinkUsage,
  locale?: string,
): { sentences: string[]; upgrade: boolean; manage: boolean; heldUnsaid: boolean } | null {
  const monthly = usage.created >= usage.monthly;
  const kept = usage.liveCap !== undefined && (usage.held ?? 0) >= usage.liveCap;
  if (!monthly && !kept) return null;
  const resets = new Date(usage.resetsAt).toLocaleDateString(locale, { month: "short", day: "numeric" });
  const plan = TIER_LABEL[usage.tier];
  const cap = usage.liveCap === undefined ? "" : count(usage.liveCap);
  // The server counts held up to one past the cap: past it, how many there are isn't known.
  const over = kept && usage.held! > usage.liveCap!;
  return {
    sentences: [
      ...(monthly ? [`You've used this month's ${count(usage.monthly)} short links. You can make more on ${resets}.`] : []),
      // Deleting is permanent and gives nothing back this month, so it is only asked for when it would help now.
      ...(kept && monthly && !over ? [`After that you'd also need to delete one: the ${plan} plan holds up to ${cap} at a time.`] : []),
      ...(kept && monthly && over ? [`After that you'd also need to delete some: you have more than the ${cap} the ${plan} plan holds.`] : []),
      ...(kept && !monthly && !over ? [`You have ${cap} short links, and the ${plan} plan holds up to ${cap} at a time. Delete one to make room.`] : []),
      ...(kept && !monthly && over
        ? [`The ${plan} plan holds up to ${cap} short links at a time, and you have more than ${cap}. Delete some to get to ${count(usage.liveCap! - 1)} or fewer.`]
        : []),
    ],
    upgrade: monthly && (usage.tier === "free" || usage.tier === "edu"),
    manage: kept,
    // Only the sentence after a used-up month, at the cap exactly, leaves out how many are held: the view adds that line.
    heldUnsaid: kept && monthly && !over,
  };
}

// ---- the unfinished-create record ----------------------------------------------

/**
 * Where a creation that hasn't been answered is recorded in the extension's
 * session storage: one key per account id (the stable one the background
 * worker tracks, never the email, which can be missing on one open and there
 * on the next) and parsed address, so a record only ever applies to the
 * account and page it was made for. It has no time
 * limit: it goes when its own request is answered, when a creation for the
 * page is confirmed, when a short link for the address shows up in the
 * list, or with the browser session.
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

/** One creation request. */
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

/**
 * What the popup's latest copy put on the clipboard (the short link, its
 * tracked QR code, the page's plain QR code, or its address) and the address
 * it was of: a line about the clipboard is only ever shown beside that one.
 */
export type Copied = { what: "link" | "tracked-image" | "image" | "address"; url: string };

/**
 * Everything the popup remembers about the page's short links while it is
 * open, kept in its root so leaving the view loses none of it. Only the
 * functions below change it.
 */
export type ShortLinkSession = {
  creation: ShortLinkCreation | null;
  /**
   * A creation for this account and address that was never answered: when it
   * started, and whether the user chose to create again anyway. It ends only
   * with a confirmed creation or a short link for the page in the list.
   * undefined = not read yet (it can't be before the account id is known).
   */
  record: { at: number; startedOver: boolean } | null | undefined;
  /**
   * The page's short links (and the created one, wherever it points) as the
   * lists last had them, newest first. A list that failed or was cut off
   * never removes one.
   */
  rows: ShortLinkRow[];
  /** Short links a complete list confirmed gone. Final while the popup is open: no later list brings one back. */
  deleted: string[];
  /** The short link the view showed was deleted, and nothing has been shown or created since. */
  lost: boolean;
  /** The popup's latest copy, in the Short link view or the QR code view. */
  copied: Copied | null;
};

export const NEW_SESSION: ShortLinkSession = { creation: null, record: undefined, rows: [], deleted: [], lost: false, copied: null };

/** The short link the view shows: the created one, else the page's (see findShortLink). */
const shownIn = (session: ShortLinkSession, address: string) =>
  session.creation?.status === "created" ? session.creation.shortUrl : findShortLink(session.rows, address)?.shortUrl;

/**
 * The session after a list answer. A list that is loading or failed changes
 * nothing. A complete one is the truth: a remembered short link missing from
 * it was deleted, which also discards the creation that made it. One that was
 * cut off updates what it has and leaves the rest as last confirmed. A short
 * link for the page answers the record's question. Applying the same list
 * twice changes nothing more, and an unchanged session is returned as it was.
 */
export function observeList(session: ShortLinkSession, list: ShortLinkList | Error | undefined, address: string): ShortLinkSession {
  if (!list || list instanceof Error) return session;
  const unlisted = session.rows.filter((row) => !list.links.some((link) => link.shortUrl === row.shortUrl));
  const deleted = list.truncated ? session.deleted : [...session.deleted, ...unlisted.map((row) => row.shortUrl)];
  const created = session.creation?.status === "created" ? session.creation.shortUrl : null;
  const next: ShortLinkSession = {
    ...session,
    creation: created !== null && deleted.includes(created) ? null : session.creation,
    rows: [
      ...list.links.filter((link) => !deleted.includes(link.shortUrl) && (link.targetUrl === address || link.shortUrl === created)),
      // Older than anything in a list cut to the newest.
      ...(list.truncated ? unlisted : []),
    ],
    deleted,
  };
  const before = shownIn(session, address);
  const match = findShortLink(next.rows, address);
  if (match) next.record = null;
  next.lost = shownIn(next, address) ? false : session.lost || (before !== undefined && deleted.includes(before));
  return JSON.stringify(next) === JSON.stringify(session) ? session : next;
}

/** What the user's actions and a creation's answer do to the session. */
export const shortLinkSession = {
  /** The stored record was read: `at` is when its creation started, null for none. */
  recordRead: (session: ShortLinkSession, at: number | null): ShortLinkSession => ({
    ...session,
    record: at === null ? null : { at, startedOver: false },
  }),
  /** "Create a new short link": on to the ordinary view. The record stays, as the attempt is still unanswered. */
  startOver: (session: ShortLinkSession): ShortLinkSession => ({
    ...session,
    record: session.record ? { ...session.record, startedOver: true } : session.record,
  }),
  /** Create was clicked (`slow`: and has run long). What the clipboard held is about to be replaced. */
  creating: (session: ShortLinkSession, slow = false): ShortLinkSession => ({
    ...session,
    lost: false,
    copied: null,
    creation: { status: "creating", slow },
  }),
  /** A confirmed creation: it also answers an earlier attempt's warning, since the page now has a short link. */
  created: (session: ShortLinkSession, shortUrl: string): ShortLinkSession => ({
    ...session,
    record: null,
    creation: { status: "created", shortUrl, copied: null },
  }),
  /** The clipboard answered the creation's own write of `shortUrl`. */
  copySettled: (session: ShortLinkSession, shortUrl: string, ok: boolean): ShortLinkSession => ({
    ...session,
    creation:
      session.creation?.status === "created" && session.creation.shortUrl === shortUrl ? { ...session.creation, copied: ok } : session.creation,
    copied: ok ? { what: "link", url: shortUrl } : session.copied,
  }),
  /** A copy made with one of the popup's buttons reached the clipboard. */
  copied: (session: ShortLinkSession, copied: Copied): ShortLinkSession => ({ ...session, copied }),
  /** `sentence`: the server's, when it refused the address. An earlier unanswered attempt stays unanswered. */
  failed: (session: ShortLinkSession, sentence: string | null): ShortLinkSession => ({
    ...session,
    creation: sentence ? { status: "refused", sentence } : { status: "failed" },
  }),
};

export type ShortLinkView =
  /** Short links aren't open to this account. */
  | { kind: "unavailable" }
  /** `local`: the address is no public one (see notPublic), which a plain QR code still takes. */
  | { kind: "refused"; sentence: string; local?: boolean }
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
   * again" asks the server; "Create a new short link" goes on to the ordinary
   * view, which keeps a warning. `limit`: no short link can be created now, so
   * the limit is shown in place of "Create a new short link".
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
      /** An earlier attempt was never answered: creating now may make a second short link. */
      unresolved: boolean;
    };

/**
 * What the Short link view shows, from the session (see observeList) and what
 * is loading. Precedence: a finished creation (its status and destination
 * follow its row once a list has it); short links closed to the account; a
 * creation in flight or refused; an address that is never sent; the page's
 * short link as last confirmed, whatever is loading or failed now; load
 * failures (the account id among them); loading; an unfinished creation; a
 * reached limit; then Create.
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
  /** As observeList left it for `list`. */
  session: ShortLinkSession;
}): ShortLinkView {
  const { address, usage, list } = input;
  const { creation, record, rows, lost } = input.session;
  if (creation?.status === "created") {
    // Shown at once; its row, when a list has it, says whether it still opens and where.
    const row = rows.find((link) => link.shortUrl === creation.shortUrl);
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
  const unanswered = record != null && !record.startedOver;
  const create = {
    kind: "create",
    truncated: false,
    saved: input.bookmarkId != null,
    failed: false,
    deleted: lost,
    unresolved: record != null && record.startedOver,
  } as const;
  if (creation?.status === "creating") return { ...create, wait: creation.slow ? "creating-slow" : "creating" };
  if (creation?.status === "refused") return { kind: "refused", sentence: creation.sentence };
  if (refusedLocally(address)) return { kind: "refused", sentence: "This address can't be shortened.", local: notPublic(address) };
  const match = findShortLink(rows, address);
  if (match) {
    return { kind: "link", shortUrl: match.shortUrl, targetUrl: match.targetUrl, state: shortLinkState(match), outcome: "existing", copied: null };
  }
  if (usage instanceof Error || list instanceof Error || input.accountId === null) return { kind: "failed" };
  // With an unanswered record, the view never falls back to a plain Create while the list loads.
  const limit = usage !== undefined && limitReached(usage) !== null;
  if (unanswered && list === undefined) return { kind: "unfinished", at: record.at, checking: true, limit };
  if (usage === undefined || list === undefined || record === undefined) return { ...create, wait: "allowance" };

  if (unanswered) return { kind: "unfinished", at: record.at, checking: false, limit };
  if (limit) return { kind: "limit", deleted: lost };
  return {
    ...create,
    wait: input.bookmarkId === undefined ? "page" : null,
    truncated: list.truncated,
    failed: creation?.status === "failed",
  };
}

/**
 * The two copies the Short link view makes, named as what was done: what the
 * clipboard holds now isn't ours to say, since anything may have been copied
 * elsewhere since. Another copy in the popup (the page's plain QR code, its address) leaves no line.
 */
const COPIED_LINE: Partial<Record<Copied["what"], string>> = {
  link: "Short link copied.",
  "tracked-image": "QR image copied.",
};

/** The copy's line for the view: only beside a short link that opens, and only when the popup's latest copy was of that one. */
export const clipboardLine = (view: ShortLinkView, copied: Copied | null) =>
  view.kind === "link" && view.state === "active" && copied?.url === view.shortUrl ? COPIED_LINE[copied.what] : undefined;
