import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AUDITED_HOST_PERMISSIONS,
  AUDITED_PERMISSIONS,
  MINIMUM_CHROME_VERSION,
  PRODUCTION_CLERK_FAPI_ORIGIN,
  PRODUCTION_CONVEX_ORIGIN,
  PRODUCTION_WEB_ORIGIN,
  isChromeVersion,
  manifestForStore,
  validateStoreEnvironment,
  validateStoreManifest,
  validateStoreZip,
} from "./store-package.mjs";

// jszip is a direct devDependency: wxt 0.21 dropped it, so borrowing wxt's copy broke.
const JSZip = createRequire(import.meta.url)("jszip");

const clerkKey = (host) =>
  `pk_live_${Buffer.from(`${host}$`).toString("base64url")}`;

const safeEnv = (host = new URL(PRODUCTION_CLERK_FAPI_ORIGIN).hostname) => ({
  WXT_WEB_APP_URL: PRODUCTION_WEB_ORIGIN,
  WXT_CONVEX_URL: PRODUCTION_CONVEX_ORIGIN,
  WXT_CLERK_SYNC_HOST: PRODUCTION_WEB_ORIGIN,
  WXT_CLERK_FRONTEND_API: `https://${host}`,
  WXT_CLERK_PUBLISHABLE_KEY: clerkKey(host),
});

const safeManifest = (host = "clerk.bookmark.land") => ({
  manifest_version: 3,
  name: "bookmark.land",
  version: "1.0.0",
  minimum_chrome_version: MINIMUM_CHROME_VERSION,
  homepage_url: PRODUCTION_WEB_ORIGIN,
  permissions: [...AUDITED_PERMISSIONS],
  host_permissions: [
    `${PRODUCTION_WEB_ORIGIN}/*`,
    `${PRODUCTION_CONVEX_ORIGIN}/*`,
    `https://${host}/*`,
  ],
});

describe("validateStoreEnvironment", () => {
  it("accepts exact production origins and a matching live Clerk key", () => {
    expect(validateStoreEnvironment(safeEnv())).toMatchObject(safeEnv());
  });

  it.each([
    ["a missing value", { WXT_CONVEX_URL: "" }],
    ["a dev Clerk key", { WXT_CLERK_PUBLISHABLE_KEY: "pk_test_placeholder" }],
    ["a placeholder live key", { WXT_CLERK_PUBLISHABLE_KEY: "pk_live_xxxxxxxx" }],
    ["a truncated live key", { WXT_CLERK_PUBLISHABLE_KEY: clerkKey("clerk.bookmark.land").slice(0, -1) }],
    ["localhost", { WXT_CLERK_FRONTEND_API: "http://localhost:3000" }],
    ["the dev Convex deployment", { WXT_CONVEX_URL: "https://some-dev-deployment-123.convex.cloud" }],
    ["a web URL path", { WXT_WEB_APP_URL: "https://bookmark.land/dashboard" }],
    ["URL credentials", { WXT_CLERK_FRONTEND_API: "https://user:pass@clerk.bookmark.land" }],
    ["an unapproved public FAPI", { WXT_CLERK_FRONTEND_API: "https://other.clerk.accounts.dev" }],
  ])("rejects %s", (_label, patch) => {
    expect(() => validateStoreEnvironment({ ...safeEnv(), ...patch })).toThrow();
  });

  it("rejects a live key for a different Clerk FAPI", () => {
    expect(() =>
      validateStoreEnvironment({
        ...safeEnv(),
        WXT_CLERK_PUBLISHABLE_KEY: clerkKey("other.clerk.accounts.dev"),
      }),
    ).toThrow(/different Clerk hosts/);
  });
});

describe("isChromeVersion", () => {
  it.each(["1", "1.0.0", "1.0.0.0", "0.1", "65535.65535.65535.65535", "10.0"])(
    "accepts %s",
    (version) => expect(isChromeVersion(version)).toBe(true),
  );

  it.each(["", "0", "0.0.0", "01.2", "1.02", "65536.1", "1.0.0.0.0", "1.0.0-beta", "1..0", ".1", 100])(
    "rejects %s",
    (version) => expect(isChromeVersion(version)).toBe(false),
  );
});

describe("store manifest", () => {
  it("keeps the stable key for ordinary builds and strips it in store mode", () => {
    const manifest = { ...safeManifest(), key: "stable-unpacked-key" };
    expect(manifestForStore(manifest, false)).toHaveProperty("key");
    expect(manifestForStore(manifest, true)).not.toHaveProperty("key");
  });

  it("accepts the exact audited store manifest", () => {
    expect(
      validateStoreManifest(safeManifest(), "https://clerk.bookmark.land"),
    ).toBe(true);
  });

  it.each([
    ["the unpacked key", { key: "stable-unpacked-key" }],
    ["an extra permission", { permissions: [...AUDITED_PERMISSIONS, "history"] }],
    ["a missing permission", { permissions: AUDITED_PERMISSIONS.slice(1) }],
    ["an extra host permission", { host_permissions: [...AUDITED_HOST_PERMISSIONS, "https://example.com/*"] }],
    ["a missing host permission", { host_permissions: AUDITED_HOST_PERMISSIONS.slice(1) }],
    ["localhost", { homepage_url: "http://localhost:3000" }],
    ["optional permissions", { optional_permissions: ["history"] }],
    ["a missing minimum Chrome version", { minimum_chrome_version: undefined }],
    ["a pre-sidePanel minimum Chrome version", { minimum_chrome_version: "110" }],
    ["a non-numeric version", { version: "1.0.0-beta" }],
    ["an all-zero version", { version: "0.0.0" }],
    ["content scripts", { content_scripts: [{ matches: ["<all_urls>"], js: ["content.js"] }] }],
    ["external connections", { externally_connectable: { matches: ["https://example.com/*"] } }],
  ])("rejects %s", (_label, patch) => {
    expect(() => validateStoreManifest({ ...safeManifest(), ...patch })).toThrow();
  });

  it("rejects an unexpected Clerk host permission", () => {
    expect(() =>
      validateStoreManifest(
        safeManifest("other.clerk.accounts.dev"),
        "https://clerk.bookmark.land",
      ),
    ).toThrow(/does not match/);
  });
});

describe("validateStoreZip", () => {
  it.each([
    ["an extra permission", { permissions: [...AUDITED_PERMISSIONS, "history"] }],
    ["the unpacked key", { key: "stable-unpacked-key" }],
  ])("rejects %s in the packaged manifest", async (_label, patch) => {
    const directory = await mkdtemp(join(tmpdir(), "bookmark-land-store-"));
    const zipPath = join(directory, "extension.zip");
    try {
      const zip = new JSZip();
      zip.file("manifest.json", JSON.stringify({ ...safeManifest(), ...patch }));
      await writeFile(zipPath, await zip.generateAsync({ type: "nodebuffer" }));
      await expect(
        validateStoreZip(zipPath, PRODUCTION_CLERK_FAPI_ORIGIN),
      ).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
