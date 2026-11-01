import { useEffect, useMemo, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import {
  ConvexProviderWithAuth,
  type ConvexReactClient,
} from "convex/react";
import { createDocumentAuth, type DocumentAuthStatus } from "@/utils/account-auth";
import { getConvexTokenFromBackground, onAccountInvalidated } from "@/utils/auth-token";

/**
 * Convex auth for extension documents.
 *
 * Clerk's React getToken path is fragile in MV3 surfaces when the synced
 * localhost dev-browser cookie is stale or the surface has been closed long
 * enough for the 60s session token to expire. Clerk's own extension docs
 * recommend minting fresh tokens from a background service worker; the worker
 * in this extension already talks directly to Clerk's Frontend API and handles
 * dev `__clerk_db_jwt` candidates plus production cookies. This provider uses
 * that worker as the single Convex-token source for popup, side panel, and
 * import pages. The worker also tells open documents when the account ends, so
 * private content unmounts then rather than when the Convex token runs out.
 */
export function ConvexProviderWithExtensionAuth({
  client,
  children,
}: {
  client: ConvexReactClient;
  children: ReactNode;
}) {
  return (
    <ConvexProviderWithAuth client={client} useAuth={useExtensionConvexAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}

function useExtensionConvexAuth() {
  const [status, setStatus] = useState<DocumentAuthStatus>("loading");
  const [auth] = useState(() =>
    createDocumentAuth({
      requestToken: getConvexTokenFromBackground,
      subscribe: onAccountInvalidated,
      // Committed synchronously: the signed-out render must not batch with the
      // worker's next answer, or Convex would keep the old auth through a switch.
      onStatus: (next) => flushSync(() => setStatus(next)),
    }),
  );

  useEffect(() => auth.start(), [auth]);

  return useMemo(
    () => ({
      isLoading: status === "loading",
      isAuthenticated: status === "authenticated",
      fetchAccessToken: auth.fetchAccessToken,
    }),
    [auth, status],
  );
}
