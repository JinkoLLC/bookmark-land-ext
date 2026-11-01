import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDocumentAuth, type DocumentAuthStatus } from "./account-auth";

type Listener<T> = (arg: T) => unknown;
type CookieChange = { cookie: { name: string; domain: string }; removed: boolean; cause: string };

const fake = vi.hoisted(() => ({
  sendMessage: vi.fn(async (_message: unknown) => undefined),
  cookieListeners: [] as unknown[],
  messageListeners: [] as unknown[],
}));

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    setAuth() {}
    query() {
      return Promise.resolve(null);
    }
  },
}));

vi.mock("wxt/browser", () => {
  const event = () => ({ addListener: () => {} });
  return {
    browser: {
      runtime: {
        sendMessage: fake.sendMessage,
        onMessage: {
          addListener: (listener: unknown) => fake.messageListeners.push(listener),
          removeListener: (listener: unknown) =>
            fake.messageListeners.splice(fake.messageListeners.indexOf(listener), 1),
        },
        onInstalled: event(),
        setUninstallURL: async () => {},
      },
      cookies: {
        getAll: async () => [],
        onChanged: { addListener: (listener: unknown) => fake.cookieListeners.push(listener) },
      },
      tabs: { query: async () => [], onActivated: event(), onUpdated: event(), create: async () => {} },
      action: { setBadgeText: async () => {} },
      storage: { session: { get: async () => ({}), remove: async () => {}, set: async () => {} } },
      contextMenus: { onClicked: event(), create: () => {} },
      commands: { onCommand: event() },
    },
  };
});

const INVALIDATED = { type: "bookmark-land:account-invalidated" };

describe("background worker", () => {
  beforeEach(async () => {
    vi.resetModules();
    fake.sendMessage.mockClear();
    fake.cookieListeners.length = 0;
    fake.messageListeners.length = 0;
    vi.stubEnv("WXT_CLERK_FRONTEND_API", "https://clerk.example.test");
    vi.stubEnv("WXT_CLERK_SYNC_HOST", "https://app.example.test");
    vi.stubEnv("WXT_CONVEX_URL", "https://convex.example.test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    vi.stubGlobal("defineBackground", (main: () => void) => main());
    await import("../entrypoints/background");
  });

  const changeCookie = (change: CookieChange) =>
    (fake.cookieListeners[0] as Listener<CookieChange>)(change);
  const session = { name: "__session", domain: "app.example.test" };

  it("tells open documents when a web logout removes the session cookie", () => {
    changeCookie({ cookie: session, removed: true, cause: "explicit" });
    expect(fake.sendMessage).toHaveBeenCalledWith(INVALIDATED);
  });

  it("does not tell them about a routine cookie rotation", () => {
    changeCookie({ cookie: session, removed: true, cause: "overwrite" });
    expect(fake.sendMessage).not.toHaveBeenCalled();
  });

  const clerkAnswers = (client: unknown, status = 200) =>
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ response: client }), { status })));

  it("tells open documents when a web logout expires the session cookie and Clerk has no session", async () => {
    clerkAnswers(null);
    changeCookie({ cookie: session, removed: true, cause: "expired_overwrite" });
    await vi.waitFor(() => expect(fake.sendMessage).toHaveBeenCalledWith(INVALIDATED));
  });

  it("tells open documents when a replaced __client cookie means Clerk has no session", async () => {
    clerkAnswers({ sessions: [] });
    changeCookie({ cookie: { name: "__client", domain: "clerk.example.test" }, removed: false, cause: "explicit" });
    await vi.waitFor(() => expect(fake.sendMessage).toHaveBeenCalledWith(INVALIDATED));
  });

  it.each([500, 429])("keeps the account when Clerk answers %i, which proves nothing", async (status) => {
    clerkAnswers(null, status);
    changeCookie({ cookie: session, removed: true, cause: "expired_overwrite" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fake.sendMessage).not.toHaveBeenCalled();
  });

  it("keeps the account when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    changeCookie({ cookie: session, removed: true, cause: "expired_overwrite" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fake.sendMessage).not.toHaveBeenCalled();
  });

  it("survives having no open document to tell", () => {
    fake.sendMessage.mockRejectedValueOnce(new Error("Receiving end does not exist."));
    expect(() => changeCookie({ cookie: session, removed: true, cause: "explicit" })).not.toThrow();
  });

  it("tells open documents when the extension signs out", async () => {
    const respond = vi.fn();
    (fake.messageListeners[0] as (message: unknown, sender: unknown, send: unknown) => unknown)(
      { type: "bookmark-land:sign-out" },
      {},
      respond,
    );
    await vi.waitFor(() => expect(respond).toHaveBeenCalled());
    expect(fake.sendMessage).toHaveBeenCalledWith(INVALIDATED);
  });
});

describe("createDocumentAuth", () => {
  function setup() {
    const responses: Array<(token: string | null) => void> = [];
    const statuses: DocumentAuthStatus[] = [];
    let invalidate = () => {};
    const unsubscribe = vi.fn();
    const auth = createDocumentAuth({
      requestToken: () => new Promise((resolve) => responses.push(resolve)),
      subscribe: (handler) => {
        invalidate = handler;
        return unsubscribe;
      },
      onStatus: (status) => statuses.push(status),
    });
    return { auth, responses, statuses, unsubscribe, invalidate: () => invalidate() };
  }
  const settled = () => new Promise((resolve) => setTimeout(resolve));

  it("drops the account the moment the worker reports invalidation", async () => {
    const t = setup();
    t.auth.start();
    t.responses[0]("old-account");
    await settled();
    expect(t.statuses).toEqual(["authenticated"]);

    t.invalidate();
    expect(t.statuses).toEqual(["authenticated", "unauthenticated"]);
  });

  it("never lets a token requested before invalidation restore the account", async () => {
    const t = setup();
    t.auth.start();
    const refresh = t.auth.fetchAccessToken({ forceRefreshToken: true });
    t.invalidate();
    t.responses[0]("old-account");
    t.responses[1]("old-account");
    await expect(refresh).resolves.toBeNull();
    expect(t.statuses).toEqual(["unauthenticated"]);
  });

  it("stays signed out when the worker has no account after invalidation", async () => {
    const t = setup();
    t.auth.start();
    t.invalidate();
    t.responses[1](null);
    await settled();
    expect(t.statuses).toEqual(["unauthenticated", "unauthenticated"]);
  });

  it("comes back through signed-out for the next account", async () => {
    const t = setup();
    t.auth.start();
    t.responses[0]("old-account");
    await settled();
    t.invalidate();
    t.responses[1]("new-account");
    await settled();
    expect(t.statuses).toEqual(["authenticated", "unauthenticated", "authenticated"]);
  });

  it("treats a failed token request as signed out", async () => {
    const statuses: DocumentAuthStatus[] = [];
    createDocumentAuth({
      requestToken: () => Promise.reject(new Error("worker gone")),
      subscribe: () => () => {},
      onStatus: (status) => statuses.push(status),
    }).start();
    await settled();
    expect(statuses).toEqual(["unauthenticated"]);
  });

  it("ignores everything after cleanup", async () => {
    const t = setup();
    const stop = t.auth.start();
    stop();
    t.responses[0]("old-account");
    await settled();
    expect(t.statuses).toEqual([]);
    expect(t.unsubscribe).toHaveBeenCalledOnce();
  });
});

describe("ConvexProviderWithExtensionAuth", () => {
  it("takes its auth state from the invalidation-aware document auth", () => {
    const source = readFileSync(new URL("../components/convex-extension-provider.tsx", import.meta.url), "utf8");
    expect(source).toContain("subscribe: onAccountInvalidated");
    expect(source).toContain("auth.start()");
    expect(source).toContain("fetchAccessToken: auth.fetchAccessToken");
  });
});
