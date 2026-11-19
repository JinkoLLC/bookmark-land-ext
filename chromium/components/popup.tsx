import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useAuth, useUser } from "@clerk/chrome-extension";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { FunctionReturnType } from "convex/server";
import { browser } from "wxt/browser";
import { ExternalLink, LogOut, PanelRight, Settings, User } from "lucide-react";
import { FeedbackForm } from "@/components/feedback-form";
import { QrView } from "@/components/qr-view";
import { ShortLinkView, useShortLink, type PageTab } from "@/components/short-link-view";
import {
  getAccountEmailFromBackground,
  signOutFromBackground,
} from "@/utils/auth-token";
import { useStalled } from "@/hooks/use-stalled";
import { derivePopupAuthState } from "@/utils/popup-state";
import { moveIndex } from "@/utils/list-keys";
import { parseAddress, refusedLocally } from "@/utils/short-link";
import { QuickSaveSection } from "@/components/quick-save";
import { PendingErrorBanner } from "@/components/pending-error";
import { AuthStalled } from "@/components/auth-stalled";
import { StatusLine } from "@/components/status-line";
import {
  LibraryErrorBoundary,
  LibraryErrorFallback,
} from "@/components/library-error-boundary";

const RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const MUTED = "text-neutral-500 dark:text-neutral-400";
const OUTLINE_BUTTON = `rounded-md border border-neutral-300 px-3 py-2 font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800 ${RING}`;
const HEADER =
  "flex h-11 shrink-0 items-center gap-2 border-b border-neutral-200 px-3 dark:border-neutral-800";

/**
 * A column capped at Chrome's 600 px popup limit: a fixed header, a middle
 * region that scrolls on its own when its content doesn't fit, and (signed
 * in) a fixed footer.
 */
export function Popup() {
  const { isLoaded, isSignedIn } = useAuth();
  const convexAuth = useConvexAuth();
  const waitingForAuth =
    !isLoaded || (isSignedIn === true && convexAuth.isLoading);
  const stalled = useStalled(waitingForAuth);
  // Same state machine as the side panel and import wizard. In particular,
  // Clerk-signed-in but no backend token (offline, Frontend API down) is
  // "stalled" with a way out, not an endless "Preparing…".
  const state = derivePopupAuthState({
    isLoaded,
    isSignedIn,
    stalled,
    convexAuth,
  });

  return (
    <div className="flex max-h-[600px] w-80 flex-col bg-white text-sm text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
      {state === "signed-in" ? (
        <LibraryErrorBoundary
          fallback={(retry) => (
            <PlainView>
              <LibraryErrorFallback onRetry={retry} />
            </PlainView>
          )}
        >
          <SignedInView />
        </LibraryErrorBoundary>
      ) : state === "signed-out" ? (
        <SignedOutView />
      ) : (
        <PlainView>
          {state === "loading" && <LoadingView />}
          {state === "stalled" && <AuthStalled />}
        </PlainView>
      )}
    </div>
  );
}

function Brand() {
  return (
    <>
      <img src="/icon/32.png" alt="" className="h-6 w-6 shrink-0" />
      {/* The name gives way first when the header runs out of room. */}
      <h1 className="min-w-0 flex-1 truncate font-semibold">bookmark.land</h1>
    </>
  );
}

/** The states without a library: logo and name over the content, no footer. */
function PlainView({ children }: { children: ReactNode }) {
  return (
    <>
      <header className={HEADER}>
        <Brand />
      </header>
      <main className="flex min-h-0 flex-col gap-3 overflow-y-auto p-3">{children}</main>
    </>
  );
}

/** The real key binding for the save command (users can rebind it, and
 * Chrome drops it on conflict) so the popup never shows a stale shortcut. */
function useSaveShortcut(): string | null {
  const [shortcut, setShortcut] = useState<string | null>(null);
  useEffect(() => {
    void browser.commands
      .getAll()
      .then((commands) => {
        const cmd = commands.find((c) => c.name === "save-page");
        setShortcut(cmd?.shortcut || null);
      })
      .catch(() => setShortcut(null));
  }, []);
  return shortcut;
}

/**
 * The active tab when it is a web page (http or https, of any length): what
 * the Short link / QR code row works on, read apart from Quick save's own
 * check. undefined = resolving; null = not a web page.
 */
function usePageTab(): PageTab | null | undefined {
  const [tab, setTab] = useState<PageTab | null | undefined>(undefined);
  useEffect(() => {
    void browser.tabs
      .query({ active: true, currentWindow: true })
      .then(([active]) => {
        const address = parseAddress(active?.url);
        setTab(active?.url && address ? { url: active.url, address, title: active.title } : null);
      })
      .catch(() => setTab(null));
  }, []);
  return tab;
}

type ViewName = "feedback" | "qr" | "short";

/**
 * Views that replace the popup's content (a popup can't host a dialog bigger
 * than itself), as a stack: the Short link view can open from the QR view.
 * What is underneath stays mounted, so Back returns to it as it was and to
 * the control that opened the view.
 */
function useViews() {
  const [stack, setStack] = useState<ViewName[]>([]);
  const openers = useRef<(HTMLElement | null)[]>([]);
  const returnTo = useRef<HTMLElement | null | undefined>(undefined);
  const top = stack.at(-1);

  const open = (view: ViewName) => {
    openers.current.push(document.activeElement as HTMLElement | null);
    setStack((now) => [...now, view]);
  };
  const back = () => {
    returnTo.current = openers.current.pop() ?? null;
    setStack((now) => now.slice(0, -1));
  };

  useEffect(() => {
    const opener = returnTo.current;
    if (opener === undefined) return;
    returnTo.current = undefined;
    // The opener is gone when short links closed to the account meanwhile:
    // the QR code button, or the QR view's heading, stands in for it.
    const target = opener?.isConnected
      ? opener
      : document.getElementById(top === "qr" ? "qr-heading" : "qr-code-button");
    target?.focus();
  }, [stack, top]);

  // Escape leaves the QR code and Short link views, where the browser lets
  // the popup see the key. Not the feedback form: it would drop a typed message.
  useEffect(() => {
    if (top !== "qr" && top !== "short") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      back();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [top]);

  return { stack, top, open, back };
}

function openBookmarkLand() {
  void browser.tabs.create({
    url: `${import.meta.env.WXT_WEB_APP_URL}/dashboard`,
  });
  window.close();
}

function LoadingView() {
  return (
    <>
      <p className={MUTED}>Loading…</p>
      <button type="button" onClick={openBookmarkLand} className={OUTLINE_BUTTON}>
        Open bookmark.land
      </button>
    </>
  );
}

function SignedOutView() {
  const openSignIn = () => {
    // Sign-in happens on the web app; the extension picks the session up
    // automatically via Clerk's sync host. No credentials in the popup.
    void browser.tabs.create({
      url: `${import.meta.env.WXT_WEB_APP_URL}/sign-in`,
    });
    window.close();
  };

  const shortcut = useSaveShortcut();
  const tab = usePageTab();
  const views = useViews();

  return (
    <>
      {views.top === "qr" && tab && <QrView url={tab.url} onBack={views.back} canShorten={false} />}
      <div className={views.top ? "hidden" : "contents"}>
        <PlainView>
          <p>Sign in to bookmark.land to start saving pages.</p>
          <ul className={`list-disc space-y-1 pl-4 ${MUTED}`}>
            <li>Open bookmark.land from the browser toolbar, then choose <span className="font-medium text-neutral-700 dark:text-neutral-300">Save to bookmark.land</span>.</li>
            {shortcut && (
              <li>
                Press <kbd className="rounded border border-neutral-300 px-1 font-mono text-xs dark:border-neutral-700">{shortcut}</kbd> to save instantly.
              </li>
            )}
            {/* The menu labels registered in entrypoints/background.ts. */}
            <li>Right-click a page and choose Save to bookmark.land, or a link and choose Save link to bookmark.land.</li>
          </ul>
          <button
            type="button"
            onClick={openSignIn}
            className={`rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground hover:bg-primary-hover ${RING}`}
          >
            Sign in to bookmark.land
          </button>
          {/* A QR code is made in the browser, so it needs no account. */}
          {tab && (
            <button id="qr-code-button" type="button" onClick={() => views.open("qr")} className={OUTLINE_BUTTON}>
              QR code
            </button>
          )}
        </PlainView>
      </div>
    </>
  );
}

/** True while the element's content is taller than its box. */
function useOverflows(ref: RefObject<HTMLElement | null>): boolean {
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const check = () => setOverflows(element.scrollHeight > element.clientHeight);
    const observer = new ResizeObserver(check);
    observer.observe(element);
    // The content's own box: it grows without the scroller's box changing.
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, [ref]);
  return overflows;
}

function SignedInView() {
  const views = useViews();
  const email = useAccountEmail();
  const tab = usePageTab();
  // Which Bookmark the page is, as Quick save finds or makes it: a short link
  // created here is attached to it.
  const [bookmarkId, setBookmarkId] = useState<string | null | undefined>(undefined);
  const shortLink = useShortLink(tab, email, bookmarkId);
  const openShortLink = () => {
    shortLink.load();
    views.open("short");
  };

  // Session summary — the authenticated read model for account limits and
  // bookmark counts. Live, so a Quick save bumps the count in place.
  const summary = useQuery(api.subscriptions.getSubscriptionInfo, {});
  useEffect(() => {
    if (summary === null) console.error("[extension] Subscription summary query returned no data");
  }, [summary]);

  const middle = useRef<HTMLElement>(null);
  const scrolls = useOverflows(middle);
  const link = `flex h-6 items-center underline underline-offset-2 hover:text-neutral-950 dark:hover:text-white rounded ${RING}`;

  return (
    <>
      {views.stack.map((view, index) => (
        <div key={view} className={index === views.stack.length - 1 ? "contents" : "hidden"}>
          {view === "feedback" && <FeedbackForm onBack={views.back} />}
          {view === "qr" && tab && (
            <QrView
              url={tab.url}
              onBack={views.back}
              onShortLink={shortLink.open ? openShortLink : undefined}
              canShorten={!refusedLocally(tab.address)}
            />
          )}
          {view === "short" && tab && <ShortLinkView tab={tab} model={shortLink} onBack={views.back} />}
        </div>
      ))}
      <div className={views.top ? "hidden" : "contents"}>
        <PopupHeader email={email ?? undefined} />
        <main
          ref={middle}
          aria-label="This page"
          // A stop of its own only when there is something to scroll. The scroll
          // padding keeps a focused control's ring clear of the region's edge.
          tabIndex={scrolls ? 0 : undefined}
          className="min-h-0 flex-1 scroll-py-2 overflow-y-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          <div className="flex flex-col gap-2 p-3">
            <PendingErrorBanner />
            <QuickSaveSection onBookmark={setBookmarkId} />
            {/* For any web page, whatever Quick save makes of it; after Organize. */}
            {tab && (
              <div className="flex gap-2">
                {shortLink.open && (
                  <button type="button" onClick={openShortLink} className={`flex-1 ${OUTLINE_BUTTON}`}>
                    Short link
                  </button>
                )}
                <button
                  id="qr-code-button"
                  type="button"
                  onClick={() => views.open("qr")}
                  className={`flex-1 ${OUTLINE_BUTTON}`}
                >
                  QR code
                </button>
              </div>
            )}
            <PrivacyNote />
          </div>
        </main>
        <footer className="flex shrink-0 flex-col border-t border-neutral-200 px-3 pb-2 pt-[7px] text-xs text-neutral-700 dark:border-neutral-800 dark:text-neutral-300">
          {summary === null ? (
            // Only the plan summary failed; the page's own state above stands.
            <div className="flex items-center gap-2">
              <StatusLine tone="error" role="alert" className="min-w-0 flex-1">
                Couldn&apos;t load your plan and bookmark count.
              </StatusLine>
              <button type="button" onClick={() => window.location.reload()} className={`shrink-0 font-medium ${link}`}>
                Retry
              </button>
            </div>
          ) : (
            <PlanLine summary={summary} />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                void browser.tabs.create({
                  url: browser.runtime.getURL("/import.html"),
                })
              }
              className={link}
            >
              Import browser bookmarks
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => views.open("feedback")}
              className={link}
            >
              Send feedback
            </button>
          </div>
        </footer>
      </div>
    </>
  );
}

/**
 * In-product disclosure of the one piece of browsing activity the extension
 * uses: the active tab's address is checked against the user's library for
 * the saved-page badge. Chrome Web Store policy asks for this to be stated
 * in the UI, not only on the listing. Last block of the scrolling region:
 * always reachable, never taking fixed space.
 */
function PrivacyNote() {
  return (
    <p className={`text-xs ${MUTED}`}>
      While signed in, the address of the page you&apos;re viewing is checked
      against your library to show the saved badge, and its site against
      bookmark.land&apos;s Site security results when you open this popup.
      Nothing is added to your library unless you save the page. Creating a
      short link stores this address with it.{" "}
      <a
        href={`${import.meta.env.WXT_WEB_APP_URL}/extension/privacy`}
        target="_blank"
        rel="noreferrer"
        className={`rounded underline underline-offset-2 hover:text-neutral-700 dark:hover:text-neutral-300 ${RING}`}
      >
        Privacy
      </a>
    </p>
  );
}

/** The popup's window, resolved on open: sidePanel.open needs it up front
 * because it must run synchronously off the click (the user gesture). */
function useActiveWindowId(): number | null {
  const [windowId, setWindowId] = useState<number | null>(null);
  useEffect(() => {
    let mounted = true;
    void browser.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => {
        if (mounted && tab?.windowId !== undefined) setWindowId(tab.windowId);
      })
      .catch(() => {
        if (mounted) setWindowId(null);
      });
    return () => {
      mounted = false;
    };
  }, []);
  return windowId;
}

function openLibraryPanel(windowId: number | null) {
  if (windowId === null) return;
  // sidePanel.open must run synchronously off the user gesture.
  void browser.sidePanel.open({ windowId }).then(() => window.close());
}

/** Logo and name, the labelled Library panel button, and the account menu. */
function PopupHeader({ email }: { email?: string }) {
  const windowId = useActiveWindowId();
  return (
    <header className={`${HEADER} relative z-20`}>
      <Brand />
      <button
        type="button"
        disabled={windowId === null}
        onClick={() => openLibraryPanel(windowId)}
        title="Open Library panel"
        className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-neutral-300 px-2 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800 ${RING}`}
      >
        <PanelRight className="h-4 w-4" aria-hidden="true" />
        Library panel
      </button>
      <AccountMenu email={email} />
    </header>
  );
}

/**
 * Who is signed in. The popup's clerk-js often has no user (auth runs through
 * the background worker), so the worker's Clerk read is the fallback.
 */
function useAccountEmail(): string | null | undefined {
  const { user } = useUser();
  const clerkEmail = user?.primaryEmailAddress?.emailAddress;
  // undefined = the worker hasn't answered; null = it has no email
  const [workerEmail, setWorkerEmail] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (clerkEmail) return;
    let mounted = true;
    void getAccountEmailFromBackground().then((email) => {
      if (mounted) setWorkerEmail(email);
    });
    return () => {
      mounted = false;
    };
  }, [clerkEmail]);
  return clerkEmail ?? workerEmail;
}

/**
 * The account button (the user's initial) and its menu; the email is the
 * button's name and the menu's first row. The extension has no session of
 * its own: it uses the bookmark.land session in this browser (Clerk sync
 * host), so signing out here signs out the website too, and the menu says so.
 */
function AccountMenu({ email }: { email?: string }) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const items = () => [
    ...(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []),
  ];

  useEffect(() => {
    // Focus moves into the menu, as the menu pattern asks.
    if (open) rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  const onMenuKey = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    const all = items();
    const next = moveIndex(event.key, all.indexOf(document.activeElement as HTMLElement), all.length);
    if (next === null) return;
    event.preventDefault();
    all[next].focus();
  };

  const openSettings = () => {
    void browser.tabs.create({ url: `${import.meta.env.WXT_WEB_APP_URL}/settings` });
    window.close();
  };

  const [failed, setFailed] = useState(false);
  const doSignOut = async () => {
    setSigningOut(true);
    setFailed(false);
    // The background worker owns the session (it ends it and clears the
    // badge); reloading re-reads the now signed-out state.
    if (await signOutFromBackground()) {
      window.location.reload();
      return;
    }
    setSigningOut(false);
    setFailed(true);
  };

  const initial = email?.trim()[0]?.toUpperCase();
  const label = email ? `Account: ${email}` : "Account";
  const item = `flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-neutral-100 focus:bg-neutral-100 disabled:opacity-60 dark:hover:bg-neutral-800 dark:focus:bg-neutral-800 ${RING}`;

  return (
    <div
      ref={rootRef}
      className="relative shrink-0"
      onKeyDown={open ? onMenuKey : undefined}
      // Focus leaving (a click elsewhere, or Tab) closes the menu.
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={`flex h-7 w-7 items-center justify-center rounded-full bg-neutral-200 text-xs font-semibold text-neutral-800 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600 ${RING}`}
      >
        {initial ? <span aria-hidden="true">{initial}</span> : <User className="h-4 w-4" aria-hidden="true" />}
      </button>
      {open && (
        <div className="absolute right-0 top-9 w-60 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          <p className={`truncate px-2 py-1.5 text-xs ${MUTED}`} title={email}>
            {email ?? "Signed in"}
          </p>
          <div className="my-1 border-t border-neutral-200 dark:border-neutral-800" />
          <div role="menu" aria-label="Account">
            <button type="button" role="menuitem" onClick={openBookmarkLand} className={item}>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Open bookmark.land
            </button>
            <button type="button" role="menuitem" onClick={openSettings} className={item}>
              <Settings className="h-4 w-4" aria-hidden="true" />
              Account settings
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => void doSignOut()}
              disabled={signingOut}
              className={item}
            >
              <LogOut className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
              <span>
                {signingOut ? "Signing out…" : "Sign out"}
                {/* Keeps the two lines apart in the button's name. */}
                <span className="sr-only">, </span>
                {/* On the focused item's tint: one step darker than helper text. */}
                <span className="block text-xs text-neutral-600 dark:text-neutral-400">
                  Of bookmark.land in this browser
                </span>
              </span>
            </button>
          </div>
          {failed && (
            <StatusLine tone="error" role="alert" className="px-2 py-1 text-xs">
              Couldn&apos;t sign out. Check your connection and try again.
            </StatusLine>
          )}
        </div>
      )}
    </div>
  );
}

/** Plan and library size; the count keeps its denominator. */
function PlanLine({
  summary,
}: {
  summary: NonNullable<FunctionReturnType<typeof api.subscriptions.getSubscriptionInfo>> | undefined;
}) {
  if (summary === undefined) {
    return <p className={`leading-[18px] ${MUTED}`}>Loading your plan…</p>;
  }
  return (
    <p className={`flex justify-between leading-[18px] ${MUTED}`}>
      <span>
        <span className="font-medium capitalize text-neutral-700 dark:text-neutral-300">
          {summary.plan}
        </span>{" "}
        plan
      </span>
      <span>
        <span className="font-medium text-neutral-700 dark:text-neutral-300">
          {summary.bookmarkCount.toLocaleString()}
        </span>{" "}
        / {summary.limit.toLocaleString()} bookmarks
      </span>
    </p>
  );
}
