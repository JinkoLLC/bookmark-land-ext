import { browser } from "wxt/browser";

/** Runtime message asking the background worker for a Convex-template JWT. */
export const GET_CONVEX_TOKEN_MESSAGE = "bookmark-land:get-convex-token";

export type GetConvexTokenRequest = {
  type: typeof GET_CONVEX_TOKEN_MESSAGE;
  forceRefreshToken?: boolean;
};

type GetConvexTokenResponse = {
  token: string | null;
};

export async function getConvexTokenFromBackground(
  forceRefreshToken = false,
): Promise<string | null> {
  try {
    const response = (await browser.runtime.sendMessage({
      type: GET_CONVEX_TOKEN_MESSAGE,
      forceRefreshToken,
    } satisfies GetConvexTokenRequest)) as GetConvexTokenResponse | undefined;
    return typeof response?.token === "string" ? response.token : null;
  } catch (error) {
    console.warn("[extension] Background token request failed", error);
    return null;
  }
}

/** Runtime message asking the background worker who is signed in. */
export const GET_ACCOUNT_MESSAGE = "bookmark-land:get-account";
/** Runtime message asking the background worker to sign out of bookmark.land. */
export const SIGN_OUT_MESSAGE = "bookmark-land:sign-out";

/** Sent by the worker to every open extension document when its account state is invalidated. */
export const ACCOUNT_INVALIDATED_MESSAGE = "bookmark-land:account-invalidated";

export async function broadcastAccountInvalidated(): Promise<void> {
  try {
    await browser.runtime.sendMessage({ type: ACCOUNT_INVALIDATED_MESSAGE });
  } catch {
    // Rejects when no extension document is open, which is the usual case.
  }
}

export function onAccountInvalidated(handler: () => void): () => void {
  const listener = (message: unknown) => {
    if ((message as { type?: unknown } | null)?.type === ACCOUNT_INVALIDATED_MESSAGE) handler();
  };
  browser.runtime.onMessage.addListener(listener);
  return () => browser.runtime.onMessage.removeListener(listener);
}

/**
 * The signed-in user's email, read by the background worker from Clerk's
 * Frontend API (the popup's own clerk-js is often not signed in: auth runs
 * through the worker, see convex-extension-provider.tsx).
 */
export async function getAccountEmailFromBackground(): Promise<string | null> {
  try {
    const response = (await browser.runtime.sendMessage({ type: GET_ACCOUNT_MESSAGE })) as
      | { email?: string | null }
      | undefined;
    return typeof response?.email === "string" ? response.email : null;
  } catch {
    return null;
  }
}

/** Ends the bookmark.land session in this browser; true when it worked. */
export async function signOutFromBackground(): Promise<boolean> {
  try {
    const response = (await browser.runtime.sendMessage({ type: SIGN_OUT_MESSAGE })) as
      | { ok?: boolean }
      | undefined;
    return response?.ok === true;
  } catch {
    return false;
  }
}
