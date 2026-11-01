export type PopupAuthState = "loading" | "stalled" | "signed-out" | "signed-in";

/**
 * Derives the extension surface's auth state from Clerk's `useAuth()` output,
 * plus Convex auth when the surface is about to run authenticated Convex
 * queries. Convex auth is the stricter gate: Clerk can still think the user is
 * signed in after token refresh starts 401ing, but rendering live queries at
 * that point throws `ConvexError("Not authenticated")`.
 *
 * `stalled` covers auth providers failing to load (e.g. a dead dev-browser
 * cookie 401s every Frontend API call — terminal, Clerk never retries): rather
 * than an endless "Loading…", the surface shows a recovery hint. It is a
 * distinct state, NOT "signed-out" — on a slow network the user may well
 * be signed in, so the copy must not claim otherwise.
 */
export function derivePopupAuthState(input: {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  stalled?: boolean;
  convexAuth?: {
    isLoading: boolean;
    isAuthenticated: boolean;
  };
}): PopupAuthState {
  const convexAuthenticated = input.convexAuth?.isAuthenticated === true;

  if (!input.isLoaded) {
    return convexAuthenticated
      ? "signed-in"
      : input.stalled
        ? "stalled"
        : "loading";
  }
  if (!input.isSignedIn && !convexAuthenticated) return "signed-out";

  if (!input.convexAuth) return "signed-in";
  if (input.convexAuth.isAuthenticated) return "signed-in";
  if (input.convexAuth.isLoading) {
    return input.stalled ? "stalled" : "loading";
  }
  return "stalled";
}
