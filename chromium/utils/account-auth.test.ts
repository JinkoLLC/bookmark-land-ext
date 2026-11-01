import { describe, expect, it } from "vitest";
import {
  createAccountTokenState,
  isAccountAuthCookie,
  SIGNED_OUT,
  type AccountToken,
} from "./account-auth";

const token = (accountId: string): AccountToken => ({
  token: `${accountId}-token`,
  accountId,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("account token state", () => {
  it("invalidates once when Clerk says signed out, however often documents ask again", async () => {
    const state = createAccountTokenState(() => 1);
    let invalidations = 0;
    state.setInvalidationHandler(() => {
      invalidations += 1;
    });
    await state.getToken(async () => token("account-a"));

    const signedOut = async () => SIGNED_OUT as typeof SIGNED_OUT;
    expect(await state.refreshAccount(signedOut)).toBeNull();
    expect(await state.getToken(signedOut, true)).toBeNull();
    expect(await state.getToken(signedOut, true)).toBeNull();
    expect(invalidations).toBe(1);

    await state.getToken(async () => token("account-b"), true);
    await state.refreshAccount(signedOut);
    expect(invalidations).toBe(2);
  });

  it("does not treat an unanswered request as signed out", async () => {
    const state = createAccountTokenState(() => 1);
    let invalidations = 0;
    state.setInvalidationHandler(() => {
      invalidations += 1;
    });
    await state.getToken(async () => token("account-a"));
    expect(await state.refreshAccount(async () => null)).toBeNull();
    expect(invalidations).toBe(0);
  });

  it("sees an account switch that happened while the worker was asleep", async () => {
    const saved: Array<string | null> = [];
    const first = createAccountTokenState(() => 1, {
      load: async () => null,
      save: (id) => saved.push(id),
    });
    await first.getToken(async () => token("account-a"));
    expect(saved).toEqual(["account-a"]);

    const restarted = createAccountTokenState(() => 1, {
      load: async () => saved[saved.length - 1],
      save: (id) => saved.push(id),
    });
    let invalidations = 0;
    restarted.setInvalidationHandler(() => {
      invalidations += 1;
    });
    expect(await restarted.getToken(async () => token("account-b"))).toBeNull();
    expect(invalidations).toBe(1);
    expect(saved[saved.length - 1]).toBeNull();
  });

  it("switches cleanly from account A to account B", async () => {
    const state = createAccountTokenState(() => 1);
    const fetchToken = async () => token("account-a");
    expect(await state.getToken(fetchToken)).toMatchObject({ accountId: "account-a" });

    state.invalidate();
    expect(await state.getToken(async () => token("account-b"))).toMatchObject({
      accountId: "account-b",
    });
  });

  it("rejects a token that resolves after logout", async () => {
    const pending = deferred<AccountToken | null>();
    const state = createAccountTokenState();
    const request = state.getToken(() => pending.promise);
    state.invalidate();
    pending.resolve(token("account-a"));
    expect(await request).toBeNull();
  });

  it("does not let a stale promise clear or populate the next request", async () => {
    const first = deferred<AccountToken | null>();
    const second = deferred<AccountToken | null>();
    const state = createAccountTokenState();
    const oldRequest = state.getToken(() => first.promise);
    state.invalidate();
    const newRequest = state.getToken(() => second.promise);
    first.resolve(token("account-a"));
    second.resolve(token("account-b"));
    expect(await oldRequest).toBeNull();
    expect(await newRequest).toMatchObject({ token: "account-b-token" });
    expect(await state.getToken(async () => token("unexpected"))).toMatchObject({
      token: "account-b-token",
    });
  });

  it("force-refreshes without invalidating an in-flight token", async () => {
    const pending = deferred<AccountToken | null>();
    const state = createAccountTokenState();
    const originalRequest = state.getToken(() => pending.promise);

    const refreshed = await state.getToken(
      async () => token("account-a"),
      true,
    );
    pending.resolve(token("account-a"));

    expect(refreshed).toMatchObject({ accountId: "account-a", generation: 0 });
    await expect(originalRequest).resolves.toMatchObject({
      accountId: "account-a",
      generation: 0,
    });
    expect(state.isCurrent(refreshed!)).toBe(true);
  });

  it("prioritizes cookie-driven account refresh over cached and forced tokens", async () => {
    const state = createAccountTokenState();
    await state.getToken(async () => token("account-a"));
    const pending = deferred<AccountToken | null>();

    const refresh = state.refreshAccount(() => pending.promise);
    const concurrent = state.getToken(async () => token("unexpected"), true);
    pending.resolve(token("account-a"));

    await expect(refresh).resolves.toMatchObject({ accountId: "account-a" });
    await expect(concurrent).resolves.toMatchObject({ accountId: "account-a" });
  });

  it("does not restore a stale cache after account refresh fails", async () => {
    const state = createAccountTokenState();
    await state.getToken(async () => token("account-a"));
    await expect(state.refreshAccount(async () => null)).resolves.toBeNull();
    let fetched = false;

    await expect(
      state.getToken(async () => {
        fetched = true;
        return token("account-a");
      }),
    ).resolves.toMatchObject({ accountId: "account-a" });
    expect(fetched).toBe(true);
  });

  it("runs account cleanup for a late concurrent mismatch", async () => {
    const first = deferred<AccountToken | null>();
    const invalidations: number[] = [];
    const state = createAccountTokenState();
    state.setInvalidationHandler(() => invalidations.push(state.generation));
    const oldRequest = state.getToken(() => first.promise);

    await expect(
      state.refreshAccount(async () => token("account-b")),
    ).resolves.toMatchObject({ accountId: "account-b", generation: 0 });
    first.resolve(token("account-a"));

    await expect(oldRequest).resolves.toBeNull();
    expect(invalidations).toEqual([1]);
  });

  it("fences queued saves after account invalidation", async () => {
    const state = createAccountTokenState();
    const snapshot = await state.getToken(async () => token("account-a"));
    expect(snapshot).not.toBeNull();
    state.invalidate();
    expect(state.isCurrent(snapshot!)).toBe(false);
  });

  it("supports repeated sign-in and sign-out without retaining credentials", async () => {
    const state = createAccountTokenState();
    for (let i = 0; i < 5; i += 1) {
      expect(await state.getToken(async () => token(`account-${i}`))).toMatchObject({
        accountId: `account-${i}`,
      });
      state.invalidate();
      expect(await state.getToken(async () => null)).toBeNull();
    }
  });
});

describe("account auth cookie matching", () => {
  const frontendApi = "https://accounts.bookmark.land";
  const syncHost = "https://bookmark.land";

  it("matches session cookies only on configured domains", () => {
    expect(
      isAccountAuthCookie(
        { name: "__client", domain: ".accounts.bookmark.land" },
        frontendApi,
        syncHost,
      ),
    ).toBe(true);
    expect(
      isAccountAuthCookie(
        { name: "__clerk_db_jwt_abc", domain: "bookmark.land" },
        frontendApi,
        syncHost,
      ),
    ).toBe(true);
    expect(
      isAccountAuthCookie(
        { name: "__session", domain: "unrelated.clerk.com" },
        frontendApi,
        syncHost,
      ),
    ).toBe(false);
    expect(
      isAccountAuthCookie(
        { name: "unrelated", domain: "bookmark.land" },
        frontendApi,
        syncHost,
      ),
    ).toBe(false);
  });
});
