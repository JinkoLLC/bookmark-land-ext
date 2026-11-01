export type AccountToken = {
  token: string;
  accountId: string | null;
  /** The signed-in user's primary email, from the same Clerk client read. */
  email?: string | null;
};

export type AccountTokenSnapshot = AccountToken & { generation: number };

/** Clerk answered and no session exists. Null means no answer, which proves nothing. */
export const SIGNED_OUT = "signed-out";
export type AccountTokenResult = AccountToken | typeof SIGNED_OUT | null;
type FetchToken = () => Promise<AccountTokenResult>;

/** Where the worker keeps the account across restarts, so a switch while it slept is still seen. */
export type AccountIdStore = {
  load: () => Promise<string | null>;
  save: (accountId: string | null) => void;
};

const normalizedCookieDomain = (domain: string) =>
  domain.replace(/^\./, "").toLowerCase();

export function isAccountAuthCookie(
  cookie: { name: string; domain: string },
  frontendApi: string,
  syncHost: string,
) {
  const domain = normalizedCookieDomain(cookie.domain);
  const configuredDomains = [frontendApi, syncHost].map((url) =>
    normalizedCookieDomain(new URL(url).hostname),
  );
  const isSessionCookie =
    cookie.name === "__client" ||
    cookie.name === "__session" ||
    cookie.name.startsWith("__clerk_db_jwt");
  return isSessionCookie && configuredDomains.includes(domain);
}

export type DocumentAuthStatus = "loading" | "authenticated" | "unauthenticated";

/**
 * An open extension document's view of the worker's auth. Invalidation drops
 * the account at once, without waiting for the Convex token to run out, then
 * asks the worker again: a new account (or a false alarm) comes back through
 * the signed-out state, so nothing the old account loaded stays mounted. A token
 * requested before the invalidation can't restore the old account.
 */
export function createDocumentAuth({
  requestToken,
  subscribe,
  onStatus,
}: {
  requestToken: (forceRefresh: boolean) => Promise<string | null>;
  subscribe: (onInvalidated: () => void) => () => void;
  onStatus: (status: DocumentAuthStatus) => void;
}) {
  let epoch = 0;

  const resolve = async (forceRefresh: boolean) => {
    const startedAt = epoch;
    const token = await requestToken(forceRefresh).catch(() => null);
    if (startedAt !== epoch) return null;
    onStatus(token ? "authenticated" : "unauthenticated");
    return token;
  };

  return {
    fetchAccessToken: ({ forceRefreshToken }: { forceRefreshToken: boolean }) =>
      resolve(forceRefreshToken),
    /** Returns the cleanup; a response still on its way is dropped after it. */
    start() {
      void resolve(false);
      const unsubscribe = subscribe(() => {
        epoch += 1;
        onStatus("unauthenticated");
        void resolve(false);
      });
      return () => {
        epoch += 1;
        unsubscribe();
      };
    },
  };
}

/**
 * Owns the background worker's short-lived auth state. The generation fence
 * makes a token resolution that started before logout/account switching
 * unusable, even if its promise resolves later.
 */
export function createAccountTokenState(
  now: () => number = Date.now,
  store?: AccountIdStore,
) {
  let generation = 0;
  let accountId: string | null = null;
  let signedOut = false;
  let restoring: Promise<void> | null = store
    ? store
        .load()
        .then((stored) => {
          if (generation === 0 && accountId === null) accountId = stored;
        })
        .catch(() => {})
        .finally(() => {
          restoring = null;
        })
    : null;
  let invalidationHandler = () => {};
  let cache: {
    value: AccountToken;
    expiresAt: number;
    generation: number;
  } | null = null;
  let inFlight: Promise<AccountTokenSnapshot | null> | null = null;
  let accountRefresh: Promise<AccountTokenSnapshot | null> | null = null;

  const invalidate = () => {
    generation += 1;
    accountId = null;
    store?.save(null);
    cache = null;
    inFlight = null;
    accountRefresh = null;
    invalidationHandler();
  };

  const isCurrent = (snapshot: AccountTokenSnapshot) =>
    snapshot.generation === generation;

  const getToken = async (
    fetchToken: FetchToken,
    forceRefresh = false,
  ): Promise<AccountTokenSnapshot | null> => {
    if (accountRefresh) return accountRefresh;
    if (
      !forceRefresh &&
      cache &&
      cache.generation === generation &&
      now() < cache.expiresAt
    ) {
      return { ...cache.value, generation };
    }
    if (!forceRefresh && inFlight) return inFlight;

    const startedAt = generation;
    const request = (restoring ? restoring.then(fetchToken) : fetchToken()).then((value) => {
      if (!value || startedAt !== generation) return null;
      if (value === SIGNED_OUT) {
        // Once per sign-out: documents ask again when told, and hear this answer.
        const alreadyKnown = signedOut;
        signedOut = true;
        if (!alreadyKnown) invalidate();
        return null;
      }
      signedOut = false;
      if (
        accountId !== null &&
        value.accountId !== null &&
        accountId !== value.accountId
      ) {
        invalidate();
        return null;
      }
      if (accountId !== value.accountId) store?.save(value.accountId);
      accountId = value.accountId;
      cache = { value, expiresAt: now() + 50_000, generation };
      return { ...value, generation };
    });
    let settled: Promise<AccountTokenSnapshot | null> | null = null;
    settled = request.finally(() => {
      if (inFlight === settled) inFlight = null;
    });
    inFlight = settled;
    return settled;
  };

  const refreshAccount = (fetchToken: FetchToken) => {
    if (accountRefresh) return accountRefresh;
    // Do not serve a cached identity while a cookie-driven account check is
    // pending. Existing snapshots remain valid unless the fetched account
    // proves that an account boundary was crossed.
    cache = null;
    const request = getToken(fetchToken, true);
    let settled: Promise<AccountTokenSnapshot | null> | null = null;
    settled = request.finally(() => {
      if (accountRefresh === settled) accountRefresh = null;
    });
    accountRefresh = settled;
    return settled;
  };

  return {
    getToken,
    refreshAccount,
    invalidate,
    isCurrent,
    setInvalidationHandler(handler: () => void) {
      invalidationHandler = handler;
    },
    get generation() {
      return generation;
    },
  };
}
