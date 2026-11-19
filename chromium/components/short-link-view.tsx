import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQueries } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { browser } from "wxt/browser";
import { ExternalLink } from "lucide-react";
import { openUpgrade } from "@/components/quick-save";
import { PageAddress, QrExports, QrImage, TEXT_LINK, useCopyState, useQrSvg, type CopyState } from "@/components/qr-view";
import { StatusLine } from "@/components/status-line";
import { ViewHeader } from "@/components/view-header";
import { MORE_BELOW, useScrollMore } from "@/hooks/use-scroll-more";
import { getAccountFromBackground } from "@/utils/auth-token";
import { copyText, copyWhenReady } from "@/utils/clipboard";
import {
  allowanceLine,
  createRecordKey,
  deriveShortLinkView,
  findShortLink,
  limitReached,
  readCreateRecord,
  refusalFrom,
  shortLinkText,
  trackedQrAddress,
  unfinishedSentence,
  type ShortLinkCreation,
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
  // Dropping both subscriptions for one render makes the server answer afresh.
  const [dropped, setDropped] = useState(false);
  useEffect(() => {
    if (dropped) setDropped(false);
  }, [dropped]);
  const queries = useMemo(
    () =>
      dropped
        ? {}
        : {
            usage: { query: api.shortLinks.usage, args: {} },
            ...(wanted && { list: { query: api.shortLinks.list, args: {} } }),
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
  const [record, setRecord] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    if (!key) return;
    let current = true;
    void browser.storage.session.get(key).then(
      (items: Record<string, unknown>) => current && setRecord(readCreateRecord(items[key])),
      () => current && setRecord(null),
    );
    return () => {
      current = false;
    };
  }, [key]);
  const forget = (recordKey: string) => {
    setRecord(null);
    void browser.storage.session.remove(recordKey).catch(() => {});
  };

  const [creation, setCreation] = useState<ShortLinkCreation | null>(null);
  const createShortLink = useMutation(api.shortLinks.create);
  const create = () => {
    if (!key || !address || creation?.status === "creating") return;
    setCreation({ status: "creating", slow: false });
    // A second attempt leaves the first one's record as it is: only that one's
    // answer (a match in the list) or a success here settles it.
    const second = record != null;
    // Closing the popup ends its connection, so it may never learn the answer.
    if (!second) void browser.storage.session.set({ [key]: { at: Date.now() } }).catch(() => {});
    const pending = createShortLink({
      targetUrl: address,
      ...(bookmarkId && { bookmarkId: bookmarkId as Id<"bookmarks"> }),
    });
    const copied = COPY_ON_CREATE
      ? copyWhenReady("text/plain", pending.then((result) => new Blob([result.shortUrl], { type: "text/plain" })))
      : Promise.resolve(false);
    const slow = setTimeout(
      () => setCreation((now) => (now?.status === "creating" ? { status: "creating", slow: true } : now)),
      SLOW_AFTER_MS,
    );
    void pending
      .then(
        (result) => {
          // The short link exists whatever the clipboard does, and a deferred write may never settle.
          setCreation({ status: "created", shortUrl: result.shortUrl, copied: null });
          forget(key);
          void copied.then((ok) =>
            setCreation((now) => (now?.status === "created" && now.shortUrl === result.shortUrl ? { ...now, copied: ok } : now)),
          );
        },
        (error) => {
          console.error("[extension] Short link creation failed", error);
          const sentence = refusalFrom(error);
          setCreation(sentence ? { status: "refused", sentence } : { status: "failed" });
          if (!second) forget(key);
        },
      )
      .finally(() => clearTimeout(slow));
  };

  // A short link for the address in the list answers the record's question.
  const list = results.list;
  const matched = Boolean(address && list && !(list instanceof Error) && findShortLink(list.links, address));
  useEffect(() => {
    if (matched && key && record != null) forget(key);
  }, [matched, key, record]);

  const usage = results.usage;
  return {
    open: !usage || usage instanceof Error || usage.available,
    usage: usage instanceof Error ? undefined : usage,
    view: address ? deriveShortLinkView({ address, usage, list, accountId, bookmarkId, creation, record }) : null,
    load: () => setWanted(true),
    create,
    reload: () => {
      setDropped(true);
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
    ? "This page's short link is paused."
    : view.state === "blocked"
      ? "This page's short link was blocked and no longer opens."
      : view.outcome === "created"
        ? "Short link created"
        : "This page already has a short link";

const ON_CLIPBOARD = { link: "The short link is on your clipboard.", image: "The QR image is on your clipboard." };

/** The short link itself, its destination, and (while it is active) its tracked QR code. */
function LinkBlock({ view, copyButton }: { view: LinkView; copyButton: React.RefObject<HTMLButtonElement | null> }) {
  // Two copies share the clipboard: only the latest one reads "Copied".
  const [link, setLink] = useCopyState();
  const [image, setImage] = useCopyState();
  // What the latest copy here put on the clipboard; before one, what the creation did.
  const [last, setLast] = useState<keyof typeof ON_CLIPBOARD | null>(null);
  const onClipboard = last ?? (view.copied ? "link" : null);
  const latest = (what: keyof typeof ON_CLIPBOARD, set: typeof setLink, other: typeof setLink) => (state: CopyState) => {
    set(state);
    if (state !== "copied") return;
    setLast(what);
    other((now) => (now === "copied" ? "idle" : now));
  };
  const text = shortLinkText(view.shortUrl);
  const svg = useQrSvg(trackedQrAddress(view.shortUrl));
  const copy = (
    <button
      ref={copyButton}
      type="button"
      onClick={() => void copyText(view.shortUrl).then((ok) => latest("link", setLink, setImage)(ok ? "copied" : "failed"))}
      className={`shrink-0 ${FILLED}`}
    >
      {link === "copied" ? "Copied" : "Copy"}
    </button>
  );
  const destination = (
    <PageAddress
      className={MUTED}
      text={
        view.state === "blocked"
          ? `Opened ${view.targetUrl}`
          : view.state === "paused"
            ? `Points to ${view.targetUrl}. It won't open while paused.`
            : `Opens ${view.targetUrl}`
      }
    />
  );
  return (
    <>
      {/* Announced by the view's own status region. */}
      <StatusLine tone={view.state === "active" ? "ok" : "error"} className="font-medium">
        {linkStatus(view)}
      </StatusLine>
      {view.state === "active" && onClipboard && <p className={`text-xs ${MUTED}`}>{ON_CLIPBOARD[onClipboard]}</p>}
      {/* What a link that doesn't open pointed to comes before the link. */}
      {view.state !== "active" && destination}
      <div className="flex items-center gap-2">
        <input
          readOnly
          aria-label="Short link"
          value={text}
          onFocus={(event) => event.target.select()}
          className={`min-w-0 flex-1 rounded-md border border-neutral-300 bg-transparent px-2 py-2 dark:border-neutral-700 ${RING}`}
        />
        {/* A paused or blocked short link wouldn't open, so there is nothing to hand on. */}
        {view.state === "active" && copy}
      </div>
      <span role="status" className="sr-only">
        {link === "copied" ? "Short link copied" : image === "copied" ? "Image copied" : ""}
      </span>
      {link === "failed" && (
        <StatusLine tone="error" role="alert" className="text-xs">
          Couldn&apos;t copy. Select the short link and copy it.
        </StatusLine>
      )}
      {view.state === "active" && destination}
      {view.state === "active" && svg && (
        <>
          <hr className="border-neutral-200 dark:border-neutral-800" />
          <h2 className="font-medium">Tracked QR code</h2>
          <div className="flex gap-3">
            <QrImage svg={svg} label={`Tracked QR code for ${text}`} size={112} />
            <QrExports
              svg={svg}
              fileName={`qr-${new URL(view.shortUrl).pathname.slice(1)}`}
              stacked
              copyState={[image, latest("image", setImage, setLink)]}
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
export function ShortLinkView({ tab, model, onBack }: { tab: PageTab; model: ShortLinkModel; onBack: () => void }) {
  const { usage, create, reload } = model;
  // The root derives a view whenever there is a page, which this view needs to open.
  const view = model.view!;
  const scroll = useScrollMore();
  const body = scroll.element;
  const copyButton = useRef<HTMLButtonElement>(null);

  // After a creation, focus goes to Copy. Any other change that removed the
  // focused control sends focus to the view's start instead of to <body>.
  const outcome = view.kind === "link" ? view.outcome : view.kind;
  const shown = useRef(outcome);
  useEffect(() => {
    if (shown.current === outcome) return;
    shown.current = outcome;
    if (outcome === "created") copyButton.current?.focus();
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
  const allowance = usage && <p className={`text-xs ${MUTED}`}>{allowanceLine(usage, view.kind === "create")}</p>;

  const limit = usage && limitReached(usage);
  // One region for what the view turns into: it stays mounted and its text
  // changes, which a line that arrives already filled wouldn't be announced for.
  // Failures are alerts of their own.
  const announcement =
    view.kind === "unavailable"
      ? UNAVAILABLE
      : view.kind === "link"
        ? `${linkStatus(view)}${view.copied ? `. ${ON_CLIPBOARD.link}` : ""}`
        : view.kind === "unfinished"
          ? unfinishedSentence(view.at, Date.now())
          : view.kind === "limit"
            ? (limit?.sentences.join(" ") ?? "")
            : "";
  // Only a change after the view opened is put in the region, and it is
  // cleared again: what the view shows is read once, from the content itself.
  const [said, setSaid] = useState("");
  const announced = useRef(announcement);
  useEffect(() => {
    if (announced.current === announcement) return;
    announced.current = announcement;
    setSaid(announcement);
    const timer = setTimeout(() => setSaid(""), ANNOUNCED_FOR_MS);
    return () => clearTimeout(timer);
  }, [announcement]);

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
      </>
    );
  } else if (view.kind === "link") {
    content = (
      <>
        <LinkBlock view={view} copyButton={copyButton} />
        {allowance}
      </>
    );
  } else if (view.kind === "unfinished") {
    // "Create and copy anyway" passes the same checks as an ordinary Create.
    const waiting = view.checking || view.wait !== null;
    content = (
      <>
        {page}
        <p>{unfinishedSentence(view.at, Date.now())}</p>
        {view.failed && (
          // Not "nothing was used": the first attempt may have made one.
          <StatusLine tone="error" role="alert" className="font-medium">
            The second attempt failed.
          </StatusLine>
        )}
        <button
          type="button"
          aria-disabled={view.checking}
          onClick={() => !view.checking && reload()}
          className={FILLED}
        >
          {view.checking ? "Checking…" : "Check again"}
        </button>
        {view.limit ? (
          <>
            {limit?.sentences.map((sentence) => <p key={sentence}>{sentence}</p>)}
            {limit?.manage && (
              <p className="text-xs">
                <ManageLink />
              </p>
            )}
            {allowance}
          </>
        ) : (
          <>
            <button
              type="button"
              aria-disabled={waiting}
              aria-describedby="create-anyway-note"
              onClick={() => !waiting && create()}
              className={OUTLINE}
            >
              {COPY_ON_CREATE ? "Create and copy anyway" : "Create short link anyway"}
            </button>
            {/* Read with the button it explains. */}
            <p id="create-anyway-note" className={`text-xs ${MUTED}`}>
              {!view.checking && view.wait === "page" ? "Checking this page…" : "This may use a second short link."}
            </p>
          </>
        )}
      </>
    );
  } else if (view.kind === "limit") {
    content = (
      <>
        {page}
        {limit?.sentences.map((sentence) => <p key={sentence}>{sentence}</p>)}
        {limit?.upgrade && (
          // The only way forward here, so it is the filled button.
          <button type="button" onClick={openUpgrade} className={FILLED}>
            Upgrade
          </button>
        )}
        {limit?.manage && (
          <p className="text-xs">
            <ManageLink />
          </p>
        )}
        {allowance}
      </>
    );
  } else {
    const creating = view.wait === "creating" || view.wait === "creating-slow";
    content = (
      <>
        {page}
        {view.failed && (
          <StatusLine tone="error" role="alert" className="font-medium">
            Couldn&apos;t create the short link. Nothing was used. Try again.
          </StatusLine>
        )}
        <button
          type="button"
          aria-disabled={view.wait !== null}
          onClick={() => view.wait === null && create()}
          className={FILLED}
        >
          {creating ? "Creating…" : COPY_ON_CREATE ? "Create and copy short link" : "Create short link"}
        </button>
        <div role="status" className={`flex flex-col gap-2 text-xs ${MUTED}`}>
          {view.wait === "allowance" ? (
            <p>Checking your allowance…</p>
          ) : view.wait === "page" ? (
            <p>Checking this page…</p>
          ) : (
            allowance
          )}
          {view.wait === "creating-slow" && <p>Still creating… check your connection.</p>}
        </div>
        <p className={`text-xs ${MUTED}`}>
          Creating one sends this address to bookmark.land and uses 1 of this month&apos;s short links.
          Deleting it later doesn&apos;t give it back.{!view.saved && " It doesn't save the page."}
        </p>
        {view.truncated && (
          <p className="text-xs">
            Only your newest 1,000 short links were checked. An older one for this page may exist: <ManageLink />
          </p>
        )}
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
