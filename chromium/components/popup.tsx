import { useEffect, useRef, useState } from "react";
import { useAuth, useUser } from "@clerk/chrome-extension";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@convex/api";
import { browser } from "wxt/browser";
import { LogOut, MessageSquare, PanelRight, Settings, User } from "lucide-react";
import { FeedbackForm } from "@/components/feedback-form";
import {
  getAccountEmailFromBackground,
  signOutFromBackground,
} from "@/utils/auth-token";
import { useStalled } from "@/hooks/use-stalled";
import { derivePopupAuthState } from "@/utils/popup-state";
import { QuickSaveSection } from "@/components/quick-save";
import { PendingErrorBanner } from "@/components/pending-error";
import { AuthStalled } from "@/components/auth-stalled";
import {
  LibraryErrorBoundary,
  LibraryErrorFallback,
} from "@/components/library-error-boundary";

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
    <div className="w-80 p-4 text-sm text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
      {state === "loading" && <LoadingView />}
      {state === "stalled" && <AuthStalled />}
      {state === "signed-out" && <SignedOutView />}
      {state === "signed-in" && (
        <LibraryErrorBoundary>
          <SignedInView />
        </LibraryErrorBoundary>
      )}
    </div>
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

function LoadingView() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-neutral-500">Loading…</p>
      <OpenBookmarkLandButton />
    </div>
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

  return (
    <div className="flex flex-col gap-3">
      <p>Sign in to bookmark.land to start saving pages.</p>
      <ul className="list-disc space-y-1 pl-4 text-neutral-500">
        <li>Click this icon, then <span className="font-medium text-neutral-700 dark:text-neutral-300">Add to bookmark.land</span>.</li>
        {shortcut && (
          <li>
            Press <kbd className="rounded border border-neutral-300 px-1 font-mono text-xs dark:border-neutral-700">{shortcut}</kbd> to save instantly.
          </li>
        )}
        <li>Right-click any page or link → Save to bookmark.land.</li>
      </ul>
      <button
        type="button"
        onClick={openSignIn}
        className="rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring"
      >
        Sign in to bookmark.land
      </button>
    </div>
  );
}

function SignedInView() {
  // The feedback form replaces the popup's content (a popup can't host a
  // dialog bigger than itself); Back returns to the save view.
  const [showFeedback, setShowFeedback] = useState(false);
  if (showFeedback) return <FeedbackForm onBack={() => setShowFeedback(false)} />;

  return (
    <div className="flex flex-col gap-3">
      <PopupHeader onFeedback={() => setShowFeedback(true)} />
      <PendingErrorBanner />
      <QuickSaveSection />
      <OpenLibraryPanelButton />
      <OpenBookmarkLandButton variant="secondary" />
      <button
        type="button"
        onClick={() =>
          void browser.tabs.create({
            url: browser.runtime.getURL("/import.html"),
          })
        }
        className="rounded-md border border-neutral-300 px-3 py-2 font-medium hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-ring dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        Import browser bookmarks
      </button>
      <footer className="flex flex-col gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
        <LibrarySummary />
        <button
          type="button"
          onClick={() => setShowFeedback(true)}
          className={`${OUTLINE_BUTTON} flex items-center justify-center gap-2`}
        >
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
          Send feedback
        </button>
        <PrivacyNote />
      </footer>
    </div>
  );
}

/**
 * In-product disclosure of the one piece of browsing activity the extension
 * uses: the active tab's address is checked against the user's library for
 * the saved-page badge. Chrome Web Store policy asks for this to be stated
 * in the UI, not only on the listing.
 */
function PrivacyNote() {
  return (
    <p className="text-xs text-neutral-500">
      While signed in, the address of the page you&apos;re viewing is checked
      against your library to show the saved badge, and its site against
      bookmark.land&apos;s Site security results when you open this popup.
      Nothing is stored unless you save the page.{" "}
      <a
        href={`${import.meta.env.WXT_WEB_APP_URL}/extension/privacy`}
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-2 hover:text-neutral-700 dark:hover:text-neutral-300"
      >
        Privacy
      </a>
    </p>
  );
}

const FILLED_BUTTON =
  "rounded-md bg-neutral-900 px-3 py-2 font-medium text-white hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-white";
const OUTLINE_BUTTON =
  "rounded-md border border-neutral-300 px-3 py-2 font-medium hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-ring dark:border-neutral-700 dark:hover:bg-neutral-800";

function OpenBookmarkLandButton({
  variant = "primary",
}: {
  variant?: "primary" | "secondary";
}) {
  const openBookmarkLand = () => {
    void browser.tabs.create({
      url: `${import.meta.env.WXT_WEB_APP_URL}/dashboard`,
    });
    window.close();
  };

  return (
    <button
      type="button"
      onClick={openBookmarkLand}
      className={variant === "primary" ? FILLED_BUTTON : OUTLINE_BUTTON}
    >
      Open bookmark.land
    </button>
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

/** The popup's main call to action once signed in. */
function OpenLibraryPanelButton() {
  const windowId = useActiveWindowId();
  return (
    <button
      type="button"
      disabled={windowId === null}
      onClick={() => openLibraryPanel(windowId)}
      className={`${FILLED_BUTTON} flex items-center justify-center gap-2`}
    >
      <PanelRight className="h-4 w-4" aria-hidden="true" />
      Open Library panel
    </button>
  );
}

/** Logo and name, with a one-click Library panel button at the right. */
function PopupHeader({ onFeedback }: { onFeedback: () => void }) {
  const windowId = useActiveWindowId();
  const email = useAccountEmail();
  return (
    <div className="-mx-1 -mt-1 flex items-center justify-between gap-2 border-b border-neutral-200 pb-2 dark:border-neutral-800">
      <span className="flex min-w-0 items-center gap-2 px-1">
        <img src="/icon/32.png" alt="" className="h-6 w-6 shrink-0" />
        <span className="min-w-0">
          <span className="block font-semibold leading-tight">bookmark.land</span>
          {/* Who the extension is signed in as, at the top where it belongs. */}
          <span className="block truncate text-xs text-neutral-500" title={email}>
            {email ? `Signed in as ${email}` : "Signed in"}
          </span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          disabled={windowId === null}
          onClick={() => openLibraryPanel(windowId)}
          aria-label="Open Library panel"
          title="Open Library panel"
          className="rounded-md p-1.5 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white"
        >
          <PanelRight className="h-4 w-4" aria-hidden="true" />
        </button>
        <AccountMenu email={email} onFeedback={onFeedback} />
      </span>
    </div>
  );
}

/**
 * Who is signed in. The popup's clerk-js often has no user (auth runs through
 * the background worker), so the worker's Clerk read is the fallback.
 */
function useAccountEmail(): string | undefined {
  const { user } = useUser();
  const clerkEmail = user?.primaryEmailAddress?.emailAddress;
  const [workerEmail, setWorkerEmail] = useState<string | null>(null);
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
  return clerkEmail ?? workerEmail ?? undefined;
}

/**
 * The account button (the user's initial) and its menu. The extension has no
 * session of its own: it uses the bookmark.land session in this browser
 * (Clerk sync host), so signing out here signs out the website too, and the
 * menu says so.
 */
function AccountMenu({ email, onFeedback }: { email?: string; onFeedback: () => void }) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
  const item =
    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60 dark:hover:bg-neutral-800";

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        title={email ? `Account: ${email}` : "Account"}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring"
      >
        {initial ?? <User className="h-4 w-4" aria-hidden="true" />}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-9 z-20 w-60 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        >
          <p className="truncate px-2 py-1.5 text-xs text-neutral-500" title={email}>
            {email ?? "Signed in"}
          </p>
          <div className="my-1 border-t border-neutral-200 dark:border-neutral-800" />
          <button type="button" role="menuitem" onClick={openSettings} className={item}>
            <Settings className="h-4 w-4" aria-hidden="true" />
            Account settings
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onFeedback();
            }}
            className={item}
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            Send feedback
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void doSignOut()}
            disabled={signingOut}
            className={`${item} text-red-600 dark:text-red-400`}
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {signingOut ? "Signing out…" : "Sign out"}
              <span className="block text-xs text-neutral-500">
                Of bookmark.land in this browser
              </span>
            </span>
          </button>
          {failed && (
            <p className="px-2 py-1 text-xs text-red-600 dark:text-red-400">
              Couldn&apos;t sign out. Check your connection and try again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function LibrarySummary() {
  // Session summary — the authenticated read model for account limits and
  // bookmark counts. Live, so a Quick save bumps the count in place.
  const summary = useQuery(api.subscriptions.getSubscriptionInfo, {});

  if (summary === undefined) {
    return <p className="text-xs text-neutral-500">Loading your plan…</p>;
  }

  if (!summary) {
    console.error("[extension] Subscription summary query returned no data");
    return <LibraryErrorFallback onRetry={() => window.location.reload()} />;
  }

  return (
    <p className="flex justify-between text-xs text-neutral-500">
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
