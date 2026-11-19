import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQueries } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { browser } from "wxt/browser";
import { ExternalLink } from "lucide-react";
import { openUpgrade } from "@/components/quick-save";
import { QrExports, QrImage, TEXT_LINK, useQrSvg } from "@/components/qr-view";
import { StatusLine } from "@/components/status-line";
import { ViewHeader } from "@/components/view-header";
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
const FILLED = `rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground hover:opacity-90 aria-disabled:opacity-70 ${RING}`;

/**
 * The decided fallback if a real toolbar popup refuses a clipboard write
 * whose value arrives after the click: clear this and a creation ends on
 * "Short link created" with Copy focused, and Copy does the copying.
 */
const COPY_ON_CREATE = true;
const SLOW_AFTER_MS = 8_000;

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
  /** Who is signed in; undefined = not known yet, null = the worker has no email. */
  account: string | null | undefined,
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

  const address = tab?.address;
  const key = address && account !== undefined ? createRecordKey(account ?? "", address) : null;
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
    // Closing the popup ends its connection, so it may never learn the answer.
    void browser.storage.session.set({ [key]: { at: Date.now() } }).catch(() => {});
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
        async (result) => setCreation({ status: "created", shortUrl: result.shortUrl, copied: await copied }),
        (error) => {
          console.error("[extension] Short link creation failed", error);
          const sentence = refusalFrom(error);
          setCreation(sentence ? { status: "refused", sentence } : { status: "failed" });
        },
      )
      .finally(() => {
        clearTimeout(slow);
        forget(key);
      });
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
    view: address ? deriveShortLinkView({ address, usage, list, bookmarkId, creation, record }) : null,
    load: () => setWanted(true),
    create,
    reload: () => setDropped(true),
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

/** The short link itself, its destination, and (while it is active) its tracked QR code. */
function LinkBlock({ view, copyButton }: { view: Extract<View, { kind: "link" }>; copyButton: React.RefObject<HTMLButtonElement | null> }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  const text = shortLinkText(view.shortUrl);
  const svg = useQrSvg(trackedQrAddress(view.shortUrl));
  const copy = (
    <button
      ref={copyButton}
      type="button"
      onClick={() => void copyText(view.shortUrl).then(setCopied)}
      className={`shrink-0 ${view.state === "active" ? FILLED : OUTLINE}`}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
  return (
    <>
      {view.state === "active" ? (
        <StatusLine tone="ok" role="status" className="font-medium">
          {view.outcome === "created-copied"
            ? "Short link created and copied"
            : view.outcome === "created"
              ? "Short link created"
              : "This page already has a short link"}
        </StatusLine>
      ) : (
        <StatusLine tone="error" role="status" className="font-medium">
          {view.state === "paused"
            ? "This page's short link is paused."
            : "This page's short link was blocked and no longer opens."}
        </StatusLine>
      )}
      <div className="flex items-center gap-2">
        {view.state === "active" ? (
          <input
            readOnly
            aria-label="Short link"
            value={text}
            onFocus={(event) => event.target.select()}
            className={`min-w-0 flex-1 rounded-md border border-neutral-300 bg-transparent px-2 py-2 dark:border-neutral-700 ${RING}`}
          />
        ) : (
          <p className="min-w-0 flex-1 break-all font-medium">{text}</p>
        )}
        {view.state !== "blocked" && copy}
      </div>
      <span role="status" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
      {copied === false && (
        <StatusLine tone="error" role="alert" className="text-xs">
          Couldn&apos;t copy. Select the short link and copy it.
        </StatusLine>
      )}
      <p className={`break-all text-xs ${MUTED}`}>Opens {view.targetUrl}</p>
      {view.state === "active" && svg && (
        <>
          <hr className="border-neutral-200 dark:border-neutral-800" />
          <h2 className="font-medium">Tracked QR code</h2>
          <div className="flex gap-3">
            <QrImage svg={svg} label={`Tracked QR code for ${text}`} size={112} />
            <QrExports svg={svg} fileName={`qr-${new URL(view.shortUrl).pathname.slice(1)}`} stacked />
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
  const body = useRef<HTMLElement>(null);
  const copyButton = useRef<HTMLButtonElement>(null);

  // After a creation, focus goes to Copy. Any other change that removed the
  // focused control sends focus to the view's start instead of to <body>.
  const outcome = view.kind === "link" ? view.outcome : view.kind;
  const shown = useRef(outcome);
  useEffect(() => {
    if (shown.current === outcome) return;
    shown.current = outcome;
    if (outcome === "created" || outcome === "created-copied") copyButton.current?.focus();
    else if (document.activeElement === document.body) body.current?.focus();
  }, [outcome]);

  const page = (
    <div className="min-w-0">
      {tab.title?.trim() && (
        <p className="truncate font-medium" title={tab.title}>
          {tab.title.trim()}
        </p>
      )}
      <p className={`mt-0.5 break-all text-xs ${MUTED}`}>{tab.url}</p>
    </div>
  );
  const allowance = usage && <p className={`text-xs ${MUTED}`}>{allowanceLine(usage, view.kind === "create")}</p>;

  let content: ReactNode;
  if (view.kind === "unavailable") {
    content = <p role="status">Short links aren&apos;t included in your plan.</p>;
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
    content = (
      <>
        {page}
        <p role="status">{unfinishedSentence(view.at, Date.now())}</p>
        <button
          type="button"
          aria-disabled={view.checking}
          onClick={() => !view.checking && reload()}
          className={FILLED}
        >
          {view.checking ? "Checking…" : "Check again"}
        </button>
        <button
          type="button"
          aria-disabled={view.checking}
          onClick={() => !view.checking && create()}
          className={OUTLINE}
        >
          Create short link anyway
        </button>
        <p className={`text-xs ${MUTED}`}>This may use a second short link.</p>
      </>
    );
  } else if (view.kind === "limit") {
    const limit = usage && limitReached(usage);
    content = (
      <>
        {page}
        {limit?.sentences.map((sentence) => <p key={sentence}>{sentence}</p>)}
        {limit?.upgrade && (
          <button type="button" onClick={openUpgrade} className={OUTLINE}>
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
          {creating ? "Creating…" : "Create short link"}
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
      <ViewHeader title="Short link" onBack={onBack} focusOnOpen />
      <main ref={body} tabIndex={-1} className="flex min-h-0 scroll-py-2 flex-col gap-2 overflow-y-auto p-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
        {content}
      </main>
    </>
  );
}
