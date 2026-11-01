import { browser } from "wxt/browser";

/**
 * Dev-instance auth repair. clerk-js in the extension reads ONE cookie —
 * the bare `__clerk_db_jwt` on the sync host — but Clerk's web SDK also
 * maintains key-suffixed variants (`__clerk_db_jwt_<hash>`), and the values
 * can diverge (rotation, other localhost Clerk apps). A stale bare cookie
 * makes every popup/panel load fail with 401 "Unable to authenticate this
 * browser". Before mounting ClerkProvider we validate the candidates the
 * same way the background worker does and write the working value back to
 * the bare cookie. Production instances have no `__clerk_db_jwt` cookies,
 * so this is a no-op there.
 */

export const BARE_COOKIE = "__clerk_db_jwt";
const PROBE_TIMEOUT_MS = 4_000;

export interface CookieCandidate {
  name: string;
  value: string;
  expirationDate?: number;
}

/**
 * Pure planning half: which distinct values to validate, in order. The bare
 * cookie's value goes first (valid bare cookie → nothing to rewrite);
 * duplicates collapse. Returns null only when there are no Clerk dev-browser
 * cookies at all (production / fresh profile).
 *
 * Even a single, unanimous bare cookie must be validated: clerk-js can start
 * from a cached extension session, then fail at the first 60s token refresh
 * because that bare `__clerk_db_jwt` is dead. If validation proves every
 * candidate dead, the repair removes the bare cookie so clerk-js can fall
 * back to its chrome.storage session instead of taking the panel down.
 */
export function planDevBrowserRepair(
  cookies: CookieCandidate[],
): { bare: string | undefined; values: string[] } | null {
  const candidates = cookies.filter(
    (c) => c.name.startsWith(BARE_COOKIE) && c.value,
  );
  if (candidates.length === 0) return null;
  // An empty-string bare cookie counts as missing.
  const bare =
    candidates.find((c) => c.name === BARE_COOKIE)?.value || undefined;
  const values = [
    ...new Set([
      ...(bare ? [bare] : []),
      ...candidates.map((c) => c.value),
    ]),
  ];
  return { bare, values };
}

type ProbeVerdict = "active" | "alive" | "dead" | "unknown";

/** One candidate against FAPI: does this dev browser exist, and does it
 * carry an active session? Mirrors the background worker's check. */
async function probeDevBrowser(value: string): Promise<ProbeVerdict> {
  try {
    const res = await fetch(
      `${import.meta.env.WXT_CLERK_FRONTEND_API}/v1/client?__clerk_db_jwt=${encodeURIComponent(value)}`,
      { credentials: "omit", signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) },
    );
    if (res.status === 401) return "dead";
    if (!res.ok) return "unknown"; // 5xx/429 — can't judge
    const client = ((await res.json()) as {
      response?: { sessions?: { status: string }[] } | null;
    }).response;
    return client?.sessions?.some((s) => s.status === "active")
      ? "active"
      : "alive";
  } catch {
    return "unknown"; // network error / timeout — can't judge
  }
}

/**
 * Validates candidates against the Frontend API and repairs the bare cookie
 * when a different candidate is the working one — preferring one that
 * carries an active session over a merely-alive (signed-out) dev browser.
 * When EVERY candidate is definitively dead, the bare cookie is removed so
 * clerk-js falls back to its chrome.storage copy (which may hold the
 * rotated, still-live value). Fails open: transient errors leave the
 * cookies untouched and clerk-js proceeds as before.
 */
export async function ensureFreshDevBrowserCookie(): Promise<void> {
  try {
    const syncHost = import.meta.env.WXT_CLERK_SYNC_HOST;
    const url = `${syncHost}/`;
    const cookies = await browser.cookies.getAll({ url }).catch(() => []);
    const plan = planDevBrowserRepair(cookies);
    if (!plan) return;

    const writeBare = async (value: string) => {
      if (value === plan.bare) return;
      const source = cookies.find((c) => c.value === value);
      await browser.cookies.set({
        url,
        name: BARE_COOKIE,
        value,
        expirationDate: source?.expirationDate,
      });
    };

    let firstAlive: string | null = null;
    let sawTransient = false;
    for (const value of plan.values) {
      const verdict = await probeDevBrowser(value);
      if (verdict === "active") {
        await writeBare(value);
        return;
      }
      if (verdict === "alive" && firstAlive === null) firstAlive = value;
      if (verdict === "unknown") sawTransient = true;
    }
    if (firstAlive !== null) {
      await writeBare(firstAlive);
      return;
    }
    if (!sawTransient) {
      // Every candidate is dead: drop the bare cookie so clerk-js can use
      // its storage fallback. If that is dead too, the UI's stalled
      // fallback offers the web sign-in, which mints a fresh dev browser.
      await browser.cookies.remove({ url, name: BARE_COOKIE }).catch(() => {});
    }
  } catch (error) {
    console.warn("[extension] dev-browser cookie check skipped", error);
  }
}
