import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/api";
import { browser } from "wxt/browser";
import { isSaveableUrl, prepareSaveArgs } from "@/utils/quick-save";
import { REFRESH_BADGE_MESSAGE } from "@/utils/messages";
import { badgeFor } from "@/utils/badge";
import { extractDomain } from "../shared/url";
import {
  GET_ACCOUNT_MESSAGE,
  GET_CONVEX_TOKEN_MESSAGE,
  SIGN_OUT_MESSAGE,
  broadcastAccountInvalidated,
  type GetConvexTokenRequest,
} from "@/utils/auth-token";
import { PENDING_ERROR_KEY, pendingErrorFrom } from "@/utils/silent-save";
import {
  createAccountTokenState,
  isAccountAuthCookie,
  SIGNED_OUT,
  type AccountTokenResult,
} from "@/utils/account-auth";

/** Context-menu entries only appear on regular web pages/links. */
const WEB_URL_PATTERNS = ["http://*/*", "https://*/*"];

/**
 * Background worker for the Saved-page indicator: checks whether the current
 * tab's URL is already a Bookmark and sets a per-tab toolbar badge. Runs on
 * tab activation, tab URL changes (including SPA navigation, which fires
 * tabs.onUpdated), and after any extension-initiated save or edit (the popup
 * pings us). Signed out, it only ever clears the badge — no library reads.
 */
export default defineBackground(() => {
  const convex = new ConvexHttpClient(import.meta.env.WXT_CONVEX_URL, {
    skipConvexDeploymentUrlCheck: true,
  });

  // clerk-js's getToken throws a spurious clerk_offline in MV3 service
  // workers (verified: its /v1/environment and /v1/client fetches succeed,
  // the session is present, yet token minting trips the SDK's offline gate
  // in both syncHost and plain background modes). So the worker mints the
  // Convex-template token with direct Frontend API calls — the same wire
  // protocol clerk-js uses, including the dev-instance __clerk_db_jwt
  // query parameter (that is Clerk's own dev-browser auth; production
  // instances authenticate via the __client cookie on the FAPI domain,
  // carried by credentials: "include" + the host permission).
  const FAPI = import.meta.env.WXT_CLERK_FRONTEND_API;
  const FAPI_TIMEOUT_MS = 4_000;

  // Convex JWTs live 60s; cache for 50s and single-flight concurrent
  // requests so rapid tab events don't multiply FAPI traffic.
  const ACCOUNT_ID_KEY = "bookmark-land:account-id";
  const authState = createAccountTokenState(Date.now, {
    load: async () => {
      const stored = (await browser.storage.session.get(ACCOUNT_ID_KEY))[ACCOUNT_ID_KEY];
      return typeof stored === "string" ? stored : null;
    },
    save: (accountId) => {
      const saved = accountId
        ? browser.storage.session.set({ [ACCOUNT_ID_KEY]: accountId })
        : browser.storage.session.remove(ACCOUNT_ID_KEY);
      void saved.catch(() => {});
    },
  });

  const getToken = async (forceRefresh = false) =>
    authState.getToken(fetchToken, forceRefresh);

  // The query-string candidate (dev __clerk_db_jwt, or "" in production)
  // whose client last produced a token.
  let activeClientQuery = "";

  /**
   * Sign out: end every session on this browser's Clerk client, which is the
   * bookmark.land web session too (sync host). Same call clerk-js's
   * signOut() makes: DELETE /v1/client/sessions, sent as POST + _method.
   */
  const signOut = async (): Promise<boolean> => {
    // Resolves which client is signed in (a fresh worker hasn't fetched yet).
    await getToken().catch(() => null);
    const qs = activeClientQuery;
    try {
      const res = await fetch(
        `${FAPI}/v1/client/sessions${qs ? `${qs}&` : "?"}_method=DELETE`,
        {
          method: "POST",
          credentials: "include",
          signal: AbortSignal.timeout(FAPI_TIMEOUT_MS),
        },
      );
      if (!res.ok) {
        console.warn("[extension] FAPI sign-out error", res.status);
        return false;
      }
      return true;
    } catch (error) {
      console.error("[extension] Sign out failed", error);
      return false;
    } finally {
      // Whatever the outcome, drop the cached token and refresh the badge.
      authState.invalidate();
    }
  };

  const fetchToken = async (): Promise<AccountTokenResult> => {
    // Signed out only if a client answered with no session and nothing failed:
    // a 5xx, 429 or token error could be hiding the session that matters.
    let clientWithoutSession = false;
    let inconclusive = false;
    try {
      // Dev instances authenticate via __clerk_db_jwt cookies on the sync
      // host (values rotate — try each candidate); production authenticates
      // via the __client cookie on the FAPI domain, carried by
      // credentials: "include" (the empty query-string candidate).
      const cookies = await browser.cookies
        .getAll({ url: `${import.meta.env.WXT_CLERK_SYNC_HOST}/` })
        .catch(() => []);
      const devBrowserValues = [
        ...new Set(
          cookies
            .filter((c) => c.name.startsWith("__clerk_db_jwt") && c.value)
            .sort((a, b) =>
              a.name === "__clerk_db_jwt"
                ? -1
                : b.name === "__clerk_db_jwt"
                  ? 1
                  : 0,
            )
            .map((c) => c.value),
        ),
      ];
      const candidates = devBrowserValues.map(
        (value) => `?__clerk_db_jwt=${encodeURIComponent(value)}`,
      );
      candidates.push("");

      for (const qs of candidates) {
        const clientRes = await fetch(`${FAPI}/v1/client${qs}`, {
          credentials: "include",
          signal: AbortSignal.timeout(FAPI_TIMEOUT_MS),
        });
        if (!clientRes.ok) {
          if (clientRes.status >= 500 || clientRes.status === 429) {
            console.warn("[extension] FAPI /client error", clientRes.status);
            inconclusive = true;
          }
          continue;
        }
        const client = (await clientRes.json())?.response as
          | {
              sessions?: {
                id: string;
                status: string;
                user_id?: string;
                user?: {
                  id?: string;
                  primary_email_address_id?: string;
                  email_addresses?: { id: string; email_address: string }[];
                };
              }[];
              last_active_session_id?: string;
            }
          | undefined;
        const sessionId =
          client?.last_active_session_id ??
          client?.sessions?.find((se) => se.status === "active")?.id;
        if (!sessionId) {
          clientWithoutSession = true; // this client is signed out
          continue;
        }
        const session = client?.sessions?.find((se) => se.id === sessionId);
        const tokenRes = await fetch(
          `${FAPI}/v1/client/sessions/${sessionId}/tokens/convex${qs}`,
          {
            method: "POST",
            credentials: "include",
            signal: AbortSignal.timeout(FAPI_TIMEOUT_MS),
          },
        );
        if (!tokenRes.ok) {
          inconclusive = true;
          if (tokenRes.status >= 500 || tokenRes.status === 429) {
            console.warn("[extension] FAPI token error", tokenRes.status);
          }
          continue;
        }
        const token = (await tokenRes.json()) as { jwt?: string };
        if (token.jwt) {
          // Remembered so Sign out ends the same client this token came from.
          activeClientQuery = qs;
          const user = session?.user;
          return {
            token: token.jwt,
            accountId:
              session?.user_id ?? user?.id ?? accountIdFromToken(token.jwt),
            email:
              user?.email_addresses?.find((e) => e.id === user.primary_email_address_id)
                ?.email_address ??
              user?.email_addresses?.[0]?.email_address ??
              null,
          };
        }
        inconclusive = true;
      }
      return clientWithoutSession && !inconclusive ? SIGNED_OUT : null;
    } catch (error) {
      console.error("[extension] Background token fetch failed", error);
      return null;
    }
  };

  const accountIdFromToken = (token: string): string | null => {
    try {
      const payload = token.split(".")[1];
      if (!payload) return null;
      const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
      const decoded = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))) as {
        sub?: unknown;
      };
      return typeof decoded.sub === "string" ? decoded.sub : null;
    } catch {
      return null;
    }
  };

  const clearBadge = (tabId: number) =>
    browser.action.setBadgeText({ tabId, text: "" });

  const updateBadge = async (tabId: number, url: string | undefined) => {
    if (!isSaveableUrl(url)) {
      await clearBadge(tabId);
      return;
    }
    const tokenSnapshot = await getToken();
    if (!tokenSnapshot) {
      await clearBadge(tabId);
      return;
    }
    try {
      convex.setAuth(tokenSnapshot.token);
      const saved = await convex.query(api.bookmarks.findSavedByUrl, { url });
      if (!authState.isCurrent(tokenSnapshot)) return;
      // Only a saved page can warn, so the Site lookup is skipped otherwise.
      const site = saved ? extractDomain(url) : "";
      let riskLevel: string | undefined;
      if (site) {
        try {
          const [risk] = await convex.query(api.siteSecurity.flaggedSites, { sites: [site] });
          riskLevel = risk?.riskLevel;
        } catch (error) {
          // The warning is extra: a failed lookup keeps the saved check.
          console.warn("[extension] Site risk lookup failed", error);
        }
      }
      if (!authState.isCurrent(tokenSnapshot)) return;
      const badge = badgeFor({ saved: !!saved, riskLevel });
      if (!badge) {
        await clearBadge(tabId);
        return;
      }
      await browser.action.setBadgeBackgroundColor({ tabId, color: badge.background });
      await browser.action.setBadgeTextColor({ tabId, color: badge.textColor });
      if (!authState.isCurrent(tokenSnapshot)) return;
      await browser.action.setBadgeText({ tabId, text: badge.text });
    } catch (error) {
      if (!authState.isCurrent(tokenSnapshot)) return;
      console.error("[extension] Saved-page check failed", error);
      await clearBadge(tabId);
    }
  };

  let pendingErrorOperation = Promise.resolve();
  const enqueuePendingErrorOperation = (operation: () => Promise<void>) => {
    const result = pendingErrorOperation.then(operation, operation);
    pendingErrorOperation = result.catch(() => {});
    return result;
  };
  const clearPendingError = () =>
    enqueuePendingErrorOperation(() =>
      browser.storage.session.remove(PENDING_ERROR_KEY),
    );
  const refreshActiveBadge = async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) return;
    await clearBadge(tab.id);
    await updateBadge(tab.id, tab.url);
  };
  const accountChanged = () => {
    void clearPendingError();
    void refreshActiveBadge();
    // Open documents hold the old account's library until they hear about it.
    void broadcastAccountInvalidated();
  };
  authState.setInvalidationHandler(accountChanged);

  // Cookie changes are the browser-visible account lifecycle boundary.
  // Explicit removals fence immediately. Cookie replacement quarantines the
  // cache while the account is resolved, so routine rotation keeps current
  // operations alive but an account switch advances the generation.
  browser.cookies.onChanged.addListener(({ cookie, removed, cause }) => {
    if (
      !isAccountAuthCookie(
        cookie,
        import.meta.env.WXT_CLERK_FRONTEND_API,
        import.meta.env.WXT_CLERK_SYNC_HOST,
      )
    ) {
      return;
    }
    if (removed) {
      if (cause === "overwrite") return; // the replacement arrives as its own event
      if (cause === "explicit") {
        authState.invalidate();
        return;
      }
      // A site deletes a cookie by re-setting it already expired, so this is how
      // a web sign-out arrives, but it can be routine too. Ask Clerk.
    }

    void authState.refreshAccount(fetchToken);
  });

  browser.tabs.onActivated.addListener(({ tabId }) => {
    void browser.tabs
      .get(tabId)
      .then((tab) => updateBadge(tabId, tab.url))
      .catch(() => clearBadge(tabId));
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // URL changes cover SPA navigation; `complete` covers initial loads
    // where the URL was already set before this listener ran. Background
    // tabs are skipped (onActivated re-checks when they come forward), so
    // restoring a 40-tab session doesn't fire 40 library lookups.
    if (!tab.active) return;
    if (changeInfo.url || changeInfo.status === "complete") {
      void updateBadge(tabId, tab.url);
    }
  });

  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (typeof message !== "object" || message === null) return;
    const typed = message as { type?: string };

    if (typed.type === GET_CONVEX_TOKEN_MESSAGE) {
      void getToken(Boolean((message as GetConvexTokenRequest).forceRefreshToken))
        .then((snapshot) => sendResponse({ token: snapshot?.token ?? null }))
        .catch((error) => {
          console.error("[extension] Background token response failed", error);
          sendResponse({ token: null });
        });
      return true;
    }

    if (typed.type === GET_ACCOUNT_MESSAGE) {
      void getToken()
        .then((snapshot) => sendResponse({ email: snapshot?.email ?? null }))
        .catch(() => sendResponse({ email: null }));
      return true;
    }

    if (typed.type === SIGN_OUT_MESSAGE) {
      void signOut().then((ok) => sendResponse({ ok }));
      return true;
    }

    if (typed.type === REFRESH_BADGE_MESSAGE) {
      void browser.tabs
        .query({ active: true, currentWindow: true })
        .then(([tab]) => {
          if (tab?.id !== undefined) void updateBadge(tab.id, tab.url);
        });
    }
  });

  // --- Context-menu silent saves -----------------------------------------
  // Success surfaces through the Saved-page indicator; a failure parks a
  // pending-error record (storage.session) that the popup shows with a
  // retry on its next open, plus a red "!" on the icon for that tab.

  // The web app pings to learn the extension is installed (externally_connectable
  // limits senders to the web app origin). Answers with the version only.
  browser.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
    if ((message as { type?: unknown } | null)?.type === "ping") {
      sendResponse({ version: browser.runtime.getManifest().version });
    }
  });

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === "install") {
      // First run: the toolbar icon is unpinned by default, so a store
      // install is otherwise invisible. The welcome page says how to pin,
      // sign in, and save.
      void browser.tabs.create({
        url: `${import.meta.env.WXT_WEB_APP_URL}/extension/welcome`,
      });
    }
    browser.contextMenus.create({
      id: "bl-save-page",
      title: "Save to bookmark.land",
      contexts: ["page"],
      documentUrlPatterns: WEB_URL_PATTERNS,
    });
    browser.contextMenus.create({
      id: "bl-save-link",
      title: "Save link to bookmark.land",
      contexts: ["link"],
      targetUrlPatterns: WEB_URL_PATTERNS,
    });
  });

  const silentSave = async (
    url: string | undefined,
    title: string | undefined,
    tab: { id?: number; url?: string } | undefined,
  ) => {
    if (!isSaveableUrl(url)) return;
    const tokenSnapshot = await getToken();
    if (!tokenSnapshot || !authState.isCurrent(tokenSnapshot)) return;
    try {
      convex.setAuth(tokenSnapshot.token);
      await convex.mutation(api.bookmarkMutations.create, {
        ...prepareSaveArgs({ url, title }),
        skipDuplicates: true,
      });
      if (tab?.id !== undefined) await updateBadge(tab.id, tab.url);
    } catch (error) {
      console.error("[extension] Silent save failed", error);
      if (!authState.isCurrent(tokenSnapshot)) return;
      await enqueuePendingErrorOperation(async () => {
        if (!authState.isCurrent(tokenSnapshot)) return;
        await browser.storage.session.set({
          [PENDING_ERROR_KEY]: pendingErrorFrom(url, error),
        });
        if (!authState.isCurrent(tokenSnapshot)) {
          await browser.storage.session.remove(PENDING_ERROR_KEY);
        }
      });
      if (!authState.isCurrent(tokenSnapshot)) return;
      if (tab?.id !== undefined) {
        await browser.action.setBadgeBackgroundColor({
          tabId: tab.id,
          color: "#dc2626",
        });
        await browser.action.setBadgeTextColor({ tabId: tab.id, color: "#ffffff" });
        if (!authState.isCurrent(tokenSnapshot)) return;
        await browser.action.setBadgeText({ tabId: tab.id, text: "!" });
      }
    }
  };

  void browser.runtime.setUninstallURL(
    `${import.meta.env.WXT_WEB_APP_URL}/extension/uninstalled`,
  );

  // Keyboard shortcut: save the active tab right away, then open the popup
  // (Chrome 127+; older Chromes just get the badge) so the user can
  // organize the bookmark without a second click.
  browser.commands.onCommand.addListener((command) => {
    if (command !== "save-page") return;
    void browser.tabs
      .query({ active: true, currentWindow: true })
      .then(async ([tab]) => {
        if (!tab) return;
        await silentSave(tab.url, tab.title, tab);
        await browser.action.openPopup().catch(() => {});
      });
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "bl-save-page") {
      // The page's own title comes from the tab; links save with no title
      // (metadata extraction fills it in server-side).
      void silentSave(info.pageUrl, tab?.title, tab);
    } else if (info.menuItemId === "bl-save-link") {
      void silentSave(info.linkUrl, undefined, tab);
    }
  });
});
