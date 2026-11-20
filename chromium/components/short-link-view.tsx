import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQueries } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { browser } from "wxt/browser";
import { ExternalLink } from "lucide-react";
import { openUpgrade } from "@/components/quick-save";
import { PageAddress, QrExports, QrImage, TEXT_LINK, useCopyState, useQrSvg, type CopyState } from "@/components/qr-view";
import { ShortLinkMeter } from "@/components/short-link-meter";
import { StatusLine } from "@/components/status-line";
import { ViewHeader } from "@/components/view-header";
import { MORE_BELOW, useScrollMore } from "@/hooks/use-scroll-more";
import { getAccountFromBackground } from "@/utils/auth-token";
import { copyText, copyWhenReady } from "@/utils/clipboard";
import {
  NEW_SESSION,
  clipboardLine,
  createRecordKey,
  deriveShortLinkView,
  limitReached,
  observeList,
  readCreateRecord,
  refusalFrom,
  shortLinkSession,
  shortLinkText,
  trackedQrAddress,
  unfinishedSentence,
  type Copied,
  type ShortLinkList,
  type ShortLinkUsage,
  type ShortLinkView as View,
} from "@/utils/short-link";

const RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const MUTED = "text-neutral-500 dark:text-neutral-400";
const OUTLINE = `rounded-md border border-neutral-300 px-3 py-2 font-medium hover:bg-neutral-50 aria-disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-neutral-800 ${RING}`;
const FILLED = `rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground hover:bg-primary-hover aria-disabled:opacity-70 ${RING}`;

/**
 * The decided fallback if a real toolbar popup refuses a clipboard write
 * whose value arrives after the click: clear this and a creation ends on
 * "Short link created" with Copy focused, and Copy does the copying.
 */
const COPY_ON_CREATE = true;
const SLOW_AFTER_MS = 8_000;
/** How long a change stays in the view's live region before it is cleared. */
const ANNOUNCED_FOR_MS = 3_000;
const UNAVAILABLE = "Short links aren't included in your plan.";
const DELETED = "This short link was deleted.";

/** The active tab's page: its address as the browser gives it, and parsed as the server stores a destination. */
export type PageTab = { url: string; address: string; title?: string };

export type ShortLinkModel = {
  /** False once the server says short links aren't open to the account. */
  open: boolean;
  usage: ShortLinkUsage | undefined;
  view: View | null;
  /** The view opened: load the account's short links. */
  load: () => void;
  create: () => void;
  /** Leaves an unfinished creation for the ordinary view, which keeps a warning until the page has a short link. */
  startOver: () => void;
  /** The popup's latest copy, in this view or the QR code view: kept in the root so it outlives both. */
  lastCopied: Copied | null;
  setLastCopied: (copied: Copied) => void;
  /** Asks the server again for the short links and the allowance. */
  reload: () => void;
};

/**
 * Short links for the popup's page, held in the popup's root: a creation in
 * flight outlives the view, so leaving and re-entering never shows a fresh
 * Create. Nothing here sends the page's address except `create`.
 */
export function useShortLink(
  tab: PageTab | null | undefined,
  bookmarkId: string | null | undefined,
): ShortLinkModel {
  const [wanted, setWanted] = useState(false);
  // Dropping a subscription for one render makes the server answer afresh. A
  // loaded allowance stays (it is live anyway), so what the view says about a
  // limit holds through "Check again"; only one that failed is asked for again.
  const [dropped, setDropped] = useState<null | "list" | "all">(null);
  useEffect(() => {
    if (dropped) setDropped(null);
  }, [dropped]);
  const queries = useMemo(
    () =>
      dropped === "all"
        ? {}
        : {
            usage: { query: api.shortLinks.usage, args: {} },
            ...(wanted && !dropped && { list: { query: api.shortLinks.list, args: {} } }),
          },
    [dropped, wanted],
  );
  // useQueries hands a failed load back as a value, so the view can say so.
  const results = useQueries(queries) as {
    usage?: ShortLinkUsage | Error;
    list?: ShortLinkList | Error;
  };

  // The stable account id the background worker tracks: what the record is
  // keyed by. undefined = not answered yet; null = the worker couldn't say.
  const [accountId, setAccountId] = useState<string | null | undefined>(undefined);
  const [asked, setAsked] = useState(0);
  useEffect(() => {
    let current = true;
    void getAccountFromBackground().then((account) => current && setAccountId(account.id));
    return () => {
      current = false;
    };
  }, [asked]);

  const address = tab?.address;
  const key = address && accountId ? createRecordKey(accountId, address) : null;
  // What is remembered between list answers; `session` is that with the list now on hand applied.
  const [stored, setSession] = useState(NEW_SESSION);
  const list = results.list;
  const session = address ? observeList(stored, list, address) : stored;
  useEffect(() => {
    if (!address || session === stored) return;
    setSession((now) => observeList(now, list, address));
    // A short link for the address in the list answers the record's question.
    if (key && stored.record != null && session.record === null) void browser.storage.session.remove(key).catch(() => {});
  }, [session, stored, list, address, key]);

  useEffect(() => {
    if (!key) return;
    let current = true;
    const read = (at: number | null) => current && setSession((now) => shortLinkSession.recordRead(now, at));
    void browser.storage.session.get(key).then(
      (items: Record<string, unknown>) => read(readCreateRecord(items[key])),
      () => read(null),
    );
    return () => {
      current = false;
    };
  }, [key]);

  const createShortLink = useMutation(api.shortLinks.create);
  const create = () => {
    if (!key || !address || session.creation?.status === "creating") return;
    // An earlier attempt's record stays as it is: only a creation with nothing before it writes (and, on a failure, removes) its own.
    const own = session.record == null;
    setSession((now) => shortLinkSession.creating(now));
    // Closing the popup ends its connection, so it may never learn the answer.
    if (own) void browser.storage.session.set({ [key]: { at: Date.now() } }).catch(() => {});
    const forget = () => void browser.storage.session.remove(key).catch(() => {});
    const pending = createShortLink({
      targetUrl: address,
      ...(bookmarkId && { bookmarkId: bookmarkId as Id<"bookmarks"> }),
    });
    const copied = COPY_ON_CREATE
      ? copyWhenReady("text/plain", pending.then((result) => new Blob([result.shortUrl], { type: "text/plain" })))
      : null;
    const slow = setTimeout(
      () => setSession((now) => (now.creation?.status === "creating" ? shortLinkSession.creating(now, true) : now)),
      SLOW_AFTER_MS,
    );
    void pending
      .then(
        ({ shortUrl }) => {
          // The short link exists whatever the clipboard does, and a deferred write may never settle.
          setSession((now) => shortLinkSession.created(now, shortUrl));
          forget();
          void copied?.then((ok) => setSession((now) => shortLinkSession.copySettled(now, shortUrl, ok)));
        },
        (error) => {
          console.error("[extension] Short link creation failed", error);
          setSession((now) => shortLinkSession.failed(now, refusalFrom(error)));
          if (own) forget();
        },
      )
      .finally(() => clearTimeout(slow));
  };

  const usage = results.usage;
  const view = address ? deriveShortLinkView({ address, usage, list, accountId, bookmarkId, session }) : null;

  return {
    open: !usage || usage instanceof Error || usage.available,
    usage: usage instanceof Error ? undefined : usage,
    view,
    load: () => setWanted(true),
    create,
    startOver: () => setSession(shortLinkSession.startOver),
    lastCopied: session.copied,
    setLastCopied: (copied) => setSession((now) => shortLinkSession.copied(now, copied)),
    reload: () => {
      setDropped(usage instanceof Error ? "all" : "list");
      if (accountId === null) {
        setAccountId(undefined);
        setAsked((n) => n + 1);
      }
    },
  };
}

function ManageLink() {
  return (
    <a
      href={`${import.meta.env.WXT_WEB_APP_URL}/links`}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex min-h-6 items-center gap-1 ${TEXT_LINK}`}
    >
      Manage short links
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  );
}

type LinkView = Extract<View, { kind: "link" }>;

/** What a short link's view opens on: how it came to be, or why it doesn't open. */
const linkStatus = (view: LinkView) =>
  view.state === "paused"
    ? "This page's short link is paused, so it won't open."
    : view.state === "blocked"
      ? "This page's short link was blocked and no longer opens."
      : view.outcome === "created"
        ? "Short link created"
        : "This page already has a short link";

/** The short link itself, its destination, and (while it is active) its tracked QR code. */
function LinkBlock({
  view,
  copyButton,
  last,
  setLast,
}: {
  view: LinkView;
  copyButton: React.RefObject<HTMLButtonElement | null>;
  last: Copied | null;
  setLast: (copied: Copied) => void;
}) {
  // Two copies share the clipboard: only the latest one reads "Copied".
  const [link, setLink] = useCopyState();
  const [image, setImage] = useCopyState();
  const clipboard = clipboardLine(view, last);
  const latest = (what: "link" | "tracked-image", set: typeof setLink, other: typeof setLink) => (state: CopyState) => {
    set(state);
    if (state !== "copied") return;
    setLast({ what, url: view.shortUrl });
    other((now) => (now === "copied" ? "idle" : now));
  };
  const text = shortLinkText(view.shortUrl);
  const svg = useQrSvg(trackedQrAddress(view.shortUrl));
  const copy = (
    <button
      ref={copyButton}
      type="button"
      onClick={() => void copyText(view.shortUrl).then((ok) => latest("link", setLink, setImage)(ok ? "copied" : "failed"))}
      // Just copied: Copy is no longer the next thing to do. The clear border keeps its size.
      className={`shrink-0 ${clipboard && last?.what === "link" ? OUTLINE : `border border-transparent ${FILLED}`}`}
    >
      {link === "copied" ? "Copied" : "Copy"}
    </button>
  );
  const destination = (
    <PageAddress
      className={MUTED}
      text={
        view.state === "blocked"
          ? `Used to open ${view.targetUrl}`
          : view.state === "paused"
            ? `Points to ${view.targetUrl}`
            : `Opens ${view.targetUrl}`
      }
    />
  );
  return (
    <>
      {/* Announced by the view's own status region. */}
      {/* Pausing is usually the user's own choice: only a block is an error. */}
      {/* The check is for a creation: a short link that was already there gets a plain link icon. */}
      <StatusLine
        tone={view.state === "paused" ? "paused" : view.state === "blocked" ? "error" : view.outcome === "created" ? "ok" : "link"}
        className="font-medium"
      >
        {linkStatus(view)}
      </StatusLine>
      {clipboard && <p className={`text-xs ${MUTED}`}>{clipboard}</p>}
      {/* What a link that doesn't open pointed to comes before the link. */}
      {view.state !== "active" && destination}
      {view.state === "active" ? (
        <div className="flex items-center gap-2">
          <input
            readOnly
            aria-label="Short link"
            // In full: what Copy copies.
            value={view.shortUrl}
            onFocus={(event) => event.target.select()}
            className={`min-w-0 flex-1 rounded-md border border-neutral-300 bg-transparent px-2 py-2 dark:border-neutral-700 ${RING}`}
          />
          {copy}
        </div>
      ) : (
        // A paused or blocked short link wouldn't open, so there is nothing to hand on: plain text, nothing that looks like a field.
        <p className="[overflow-wrap:anywhere]">
          <span className="sr-only">Short link: </span>
          {view.shortUrl}
        </p>
      )}
      {link === "failed" ? (
        <StatusLine tone="error" role="alert" className="text-xs">
          Couldn&apos;t copy. Select the short link and copy it.
        </StatusLine>
      ) : (
        // The creation's own copy was refused, and neither copy here has been made since.
        view.state === "active" &&
        view.copied === false &&
        !clipboard && (
          <StatusLine tone="error" role="alert" className="text-xs">
            Couldn&apos;t copy it. Use the Copy button.
          </StatusLine>
        )
      )}
      {view.state === "active" && destination}
      {view.state === "active" && svg && (
        <>
          <hr className="border-neutral-200 dark:border-neutral-800" />
          <h2 className="font-medium">Tracked QR code</h2>
          {/* The three buttons are taller than the code: it sits level with their middle. */}
          <div className="flex items-center gap-3">
            <QrImage svg={svg} label={`Tracked QR code for ${text}`} size={112} />
            <QrExports
              svg={svg}
              fileName={`qr-${new URL(view.shortUrl).pathname.slice(1)}`}
              stacked
              copyState={[image, latest("tracked-image", setImage, setLink)]}
            />
          </div>
          <p className={`text-xs ${MUTED}`}>Scans are counted, and you can change where it opens.</p>
        </>
      )}
      <p className="text-xs">
        <ManageLink />
      </p>
    </>
  );
}

/**
 * The Short link view. Opening it loads the account's short links and
 * allowance (neither request carries the page's address) and compares them
 * with the address here; only Create sends the address.
 */
export function ShortLinkView({
  tab,
  model,
  onBack,
  onQr,
}: {
  tab: PageTab;
  model: ShortLinkModel;
  onBack: () => void;
  /** Opens the QR code view over this one; absent when this view was opened from it. */
  onQr?: () => void;
}) {
  const { usage, create, reload, startOver } = model;
  // The root derives a view whenever there is a page, which this view needs to open.
  const view = model.view!;
  const scroll = useScrollMore();
  const body = scroll.element;
  const copyButton = useRef<HTMLButtonElement>(null);

  // After a creation, focus goes to Copy. Any other change that removed the
  // focused control sends focus to the view's start instead of to <body>.
  // A short link's state counts as a change: one that gets paused loses its Copy.
  // So does another short link taking its place: its block is a new one (see the key below).
  const outcome = view.kind === "link" ? `${view.outcome} ${view.state} ${view.shortUrl}` : view.kind;
  const wasDeleted = (view.kind === "create" || view.kind === "limit") && view.deleted;
  const shown = useRef(outcome);
  useEffect(() => {
    if (shown.current === outcome) return;
    const before = shown.current;
    shown.current = outcome;
    if (outcome.startsWith("created") && !before.startsWith("created")) copyButton.current?.focus();
    else if (document.activeElement === document.body) body?.focus();
  }, [outcome, body]);

  const page = (
    <div className="min-w-0">
      {tab.title?.trim() && (
        <p className="line-clamp-2 font-medium" title={tab.title}>
          {tab.title.trim()}
        </p>
      )}
      <PageAddress text={tab.url} className={`mt-0.5 ${MUTED}`} />
    </div>
  );
  const allowance = usage && <ShortLinkMeter usage={usage} />;

  const limit = usage && limitReached(usage);
  /** Why nothing can be created, and the way out of it. `upgrade`: the Upgrade button's style. */
  const limits = (upgrade: string) =>
    limit && (
      <>
        {limit.sentences.map((sentence) => (
          <p key={sentence}>{sentence}</p>
        ))}
        {limit.upgrade && (
          <button type="button" onClick={openUpgrade} className={upgrade}>
            Upgrade
          </button>
        )}
        {limit.manage && (
          <p className="text-xs">
            <ManageLink />
          </p>
        )}
        {limit.heldUnsaid && allowance}
      </>
    );
  // Deleting is done on the website, so the line comes with the way there (once, where the limit names it too).
  const deleted = wasDeleted && (
    <>
      <StatusLine tone="error" className="font-medium">
        {DELETED}
      </StatusLine>
      {!(view.kind === "limit" && limit?.manage) && (
        <p className="text-xs">
          <ManageLink />
        </p>
      )}
    </>
  );
  // One region for what the view turns into: it stays mounted and its text
  // changes, which a line that arrives already filled wouldn't be announced for.
  // Failures are alerts of their own.
  const announcement =
    view.kind === "unavailable"
      ? UNAVAILABLE
      : view.kind === "link"
        ? [linkStatus(view), clipboardLine(view, model.lastCopied)].filter(Boolean).join(". ")
        : view.kind === "unfinished"
          ? unfinishedSentence(view.at, Date.now())
          : `${wasDeleted ? `${DELETED} ` : ""}${view.kind === "limit" ? (limit?.sentences.join(" ") ?? "") : ""}`.trim();
  // Only a change after the view opened is put in the region, and it is
  // cleared again: what the view shows is read once, from the content itself.
  // A copy is a change too, and the same copy made again is said again.
  const [said, setSaid] = useState("");
  const announced = useRef({ announcement, copied: model.lastCopied });
  useEffect(() => {
    if (announced.current.announcement === announcement && announced.current.copied === model.lastCopied) return;
    announced.current = { announcement, copied: model.lastCopied };
    setSaid(announcement);
    const timer = setTimeout(() => setSaid(""), ANNOUNCED_FOR_MS);
    return () => clearTimeout(timer);
  }, [announcement, model.lastCopied]);

  let content: ReactNode;
  if (view.kind === "unavailable") {
    content = <p>{UNAVAILABLE}</p>;
  } else if (view.kind === "failed") {
    content = (
      <>
        <StatusLine tone="error" role="alert" className="font-medium">
          Couldn&apos;t load your short links. Check your connection.
        </StatusLine>
        <button type="button" onClick={reload} className={OUTLINE}>
          Retry
        </button>
      </>
    );
  } else if (view.kind === "refused") {
    content = (
      <>
        {page}
        <StatusLine tone="error" role="alert" className="font-medium">
          {view.sentence}
        </StatusLine>
        {/* Not a dead end: the plain QR code is made in the browser, whatever the address. */}
        {view.local && (
          <p className={`text-xs ${MUTED}`}>
            Short links need a public web address.
            {onQr && (
              <>
                {" A "}
                <button type="button" onClick={onQr} className={`min-h-6 ${TEXT_LINK}`}>
                  QR code
                </button>
                {" still works for it."}
              </>
            )}
          </p>
        )}
      </>
    );
  } else if (view.kind === "link") {
    content = (
      <>
        {/* Keyed: a "Copied" still showing belongs to the short link it was clicked for, never to one that replaces it. */}
        <LinkBlock key={view.shortUrl} view={view} copyButton={copyButton} last={model.lastCopied} setLast={model.setLastCopied} />
        {allowance}
      </>
    );
  } else if (view.kind === "unfinished") {
    content = (
      <>
        {page}
        <p>{unfinishedSentence(view.at, Date.now())}</p>
        <button
          type="button"
          aria-disabled={view.checking}
          aria-describedby="checking-note"
          onClick={() => !view.checking && reload()}
          className={FILLED}
        >
          {view.checking ? "Checking…" : "Check again"}
        </button>
        {/* Why the button does nothing for now; always there, so its text is announced when it arrives. The button's label shows the progress. */}
        <p id="checking-note" role="status" className="sr-only">
          {view.checking && "Checking your short links…"}
        </p>
        {view.limit ? (
          // Nothing can be created now, so creating again isn't offered. Check again stays the filled button.
          limits(OUTLINE)
        ) : (
          <>
            {/* Only leaves this view: nothing is created by this click, and every rule of an ordinary Create applies after it. */}
            <button type="button" aria-describedby="start-over-note" onClick={startOver} className={OUTLINE}>
              Create a new short link
            </button>
            <p id="start-over-note" className={`text-xs ${MUTED}`}>
              If the first one was created, creating again uses a second short link.
            </p>
          </>
        )}
      </>
    );
  } else if (view.kind === "limit") {
    content = (
      <>
        {page}
        {deleted}
        {/* Upgrade is the only way forward here, so it is the filled button. */}
        {limits(FILLED)}
      </>
    );
  } else {
    const creating = view.wait === "creating" || view.wait === "creating-slow";
    content = (
      <>
        {page}
        {deleted}
        {view.failed && (
          <StatusLine tone="error" role="alert" className="font-medium">
            {/* With an earlier attempt unanswered, "nothing was used" can't be promised. */}
            {view.unresolved ? "Couldn't create the short link this time." : "Couldn't create the short link. Nothing was used. Try again."}
          </StatusLine>
        )}
        {view.truncated && (
          <p className="text-xs">
            Only your newest 1,000 short links were checked. An older one for this page may exist. <ManageLink />
          </p>
        )}
        {view.unresolved && (
          <p id="second-link-note" className="text-xs">
            If your earlier attempt went through, this creates a second short link.
          </p>
        )}
        <button
          type="button"
          aria-disabled={view.wait !== null}
          // While the button does nothing, the line under it says why.
          aria-describedby={[view.unresolved && "second-link-note", view.wait !== null && "create-status"].filter(Boolean).join(" ") || undefined}
          onClick={() => view.wait === null && create()}
          className={FILLED}
        >
          {creating ? "Creating…" : COPY_ON_CREATE ? "Create and copy short link" : "Create short link"}
        </button>
        <div id="create-status" role="status" className={`flex flex-col gap-2 text-xs ${MUTED}`}>
          {view.wait === "allowance" ? (
            <p>Checking your allowance…</p>
          ) : view.wait === "page" ? (
            <p>Checking this page…</p>
          ) : view.wait === "creating-slow" ? (
            <p>Still creating… check your connection.</p>
          ) : (
            <>
              {/* The button's label shows the progress: this names it for a screen reader, and nothing moves. */}
              {view.wait === "creating" && <p className="sr-only">Creating the short link…</p>}
              {allowance}
            </>
          )}
        </div>
        <p className={`text-xs ${MUTED}`}>
          Creating one sends this address to bookmark.land and uses 1 of this month&apos;s short links.
          Deleting it later doesn&apos;t give it back.{!view.saved && " It doesn't save the page."}
        </p>
      </>
    );
  }

  return (
    <>
      <ViewHeader title="Short link" id="short-link-heading" onBack={onBack} focusOnOpen />
      <main
        ref={scroll.ref}
        aria-labelledby="short-link-heading"
        // Takes focus when a change removes the focused control; a Tab stop only when there is something to scroll.
        tabIndex={scroll.overflows ? 0 : -1}
        className={`min-h-0 scroll-py-2 overflow-y-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${scroll.more ? MORE_BELOW : ""}`}
      >
        <div className="flex flex-col gap-2 p-3">
          <p role="status" className="sr-only">
            {said}
          </p>
          {content}
        </div>
      </main>
    </>
  );
}
