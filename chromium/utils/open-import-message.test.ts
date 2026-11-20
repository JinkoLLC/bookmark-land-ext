import { beforeEach, describe, expect, it, vi } from "vitest";

type External = (
  message: unknown,
  sender: { tab?: { id?: number } },
  sendResponse: (reply: unknown) => void,
) => unknown;

const fake = vi.hoisted(() => ({
  external: [] as unknown[],
  create: vi.fn(async (_options: unknown) => undefined),
  setUninstallURL: vi.fn(async (_url: string) => undefined),
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
        sendMessage: async () => undefined,
        getURL: (path: string) => `chrome-extension://test-id${path}`,
        getManifest: () => ({ version: "9.9.9" }),
        onMessage: { addListener: () => {}, removeListener: () => {} },
        onInstalled: event(),
        onMessageExternal: { addListener: (listener: unknown) => fake.external.push(listener) },
        setUninstallURL: fake.setUninstallURL,
      },
      cookies: { getAll: async () => [], onChanged: event() },
      tabs: { query: async () => [], onActivated: event(), onUpdated: event(), create: fake.create },
      action: { setBadgeText: async () => {} },
      storage: { session: { get: async () => ({}), remove: async () => {}, set: async () => {} } },
      contextMenus: { onClicked: event(), create: () => {} },
      commands: { onCommand: event() },
    },
  };
});

describe("messages from the web app", () => {
  beforeEach(async () => {
    vi.resetModules();
    fake.external.length = 0;
    fake.create.mockClear();
    vi.stubEnv("WXT_CLERK_FRONTEND_API", "https://clerk.example.test");
    vi.stubEnv("WXT_CLERK_SYNC_HOST", "https://app.example.test");
    vi.stubEnv("WXT_CONVEX_URL", "https://convex.example.test");
    vi.stubEnv("WXT_WEB_APP_URL", "https://web.example.test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    vi.stubGlobal("defineBackground", (main: () => void) => main());
    await import("../entrypoints/background");
  });

  const send = (message: unknown, sender: { tab?: { id?: number } } = {}) => {
    const reply = vi.fn();
    (fake.external[0] as External)(message, sender, reply);
    return reply;
  };

  it("sends uninstalls to the goodbye page, tagged with the version", () => {
    expect(fake.setUninstallURL).toHaveBeenLastCalledWith(
      "https://web.example.test/extension/uninstalled?v=9.9.9",
    );
  });

  it("answers a ping with the version", () => {
    expect(send({ type: "ping" })).toHaveBeenCalledWith({ version: "9.9.9" });
    expect(fake.create).not.toHaveBeenCalled();
  });

  it("opens the Browser import and replies at once, carrying the sender's tab", () => {
    const reply = send({ type: "open-import" }, { tab: { id: 7 } });
    expect(reply).toHaveBeenCalledWith({ ok: true });
    expect(fake.create).toHaveBeenCalledWith({ url: "chrome-extension://test-id/import.html?return=7" });
  });

  it("opens the plain import page when the sender has no tab", () => {
    send({ type: "open-import" });
    expect(fake.create).toHaveBeenCalledWith({ url: "chrome-extension://test-id/import.html" });
  });

  it("ignores anything else", () => {
    for (const message of [null, "open-import", {}, { type: "open-library" }]) {
      expect(send(message)).not.toHaveBeenCalled();
    }
    expect(fake.create).not.toHaveBeenCalled();
  });
});
