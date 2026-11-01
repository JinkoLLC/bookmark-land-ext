import { describe, expect, it } from "vitest";
import { derivePopupAuthState } from "./popup-state";

describe("derivePopupAuthState", () => {
  it("is loading while Clerk has not loaded, regardless of isSignedIn", () => {
    expect(
      derivePopupAuthState({ isLoaded: false, isSignedIn: undefined }),
    ).toBe("loading");
    expect(derivePopupAuthState({ isLoaded: false, isSignedIn: true })).toBe(
      "loading",
    );
    expect(derivePopupAuthState({ isLoaded: false, isSignedIn: false })).toBe(
      "loading",
    );
  });

  it("is signed-out once loaded without a session", () => {
    expect(derivePopupAuthState({ isLoaded: true, isSignedIn: false })).toBe(
      "signed-out",
    );
    expect(
      derivePopupAuthState({ isLoaded: true, isSignedIn: undefined }),
    ).toBe("signed-out");
  });

  it("trusts Convex auth when Clerk sync is stale but a backend token is valid", () => {
    expect(
      derivePopupAuthState({
        isLoaded: false,
        isSignedIn: undefined,
        stalled: true,
        convexAuth: { isLoading: false, isAuthenticated: true },
      }),
    ).toBe("signed-in");
    expect(
      derivePopupAuthState({
        isLoaded: true,
        isSignedIn: false,
        convexAuth: { isLoading: false, isAuthenticated: true },
      }),
    ).toBe("signed-in");
  });

  it("is signed-in once loaded with a session when no Convex gate is provided", () => {
    expect(derivePopupAuthState({ isLoaded: true, isSignedIn: true })).toBe(
      "signed-in",
    );
  });

  it("waits for Convex auth before rendering signed-in query surfaces", () => {
    expect(
      derivePopupAuthState({
        isLoaded: true,
        isSignedIn: true,
        convexAuth: { isLoading: true, isAuthenticated: false },
      }),
    ).toBe("loading");
    expect(
      derivePopupAuthState({
        isLoaded: true,
        isSignedIn: true,
        stalled: true,
        convexAuth: { isLoading: true, isAuthenticated: false },
      }),
    ).toBe("stalled");
    expect(
      derivePopupAuthState({
        isLoaded: true,
        isSignedIn: true,
        convexAuth: { isLoading: false, isAuthenticated: true },
      }),
    ).toBe("signed-in");
  });

  it("treats Clerk-signed-in but Convex-unauthenticated as stalled, not signed-in", () => {
    expect(
      derivePopupAuthState({
        isLoaded: true,
        isSignedIn: true,
        convexAuth: { isLoading: false, isAuthenticated: false },
      }),
    ).toBe("stalled");
  });

  it("is stalled — a distinct state, not signed-out — when loading stalls", () => {
    expect(
      derivePopupAuthState({
        isLoaded: false,
        isSignedIn: undefined,
        stalled: true,
      }),
    ).toBe("stalled");
    // stalled is irrelevant once Clerk has loaded and no Convex gate is used
    expect(
      derivePopupAuthState({ isLoaded: true, isSignedIn: true, stalled: true }),
    ).toBe("signed-in");
    expect(
      derivePopupAuthState({
        isLoaded: true,
        isSignedIn: false,
        stalled: true,
      }),
    ).toBe("signed-out");
  });
});
