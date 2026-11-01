import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { readFile, unlink } from "node:fs/promises";
import {
  MINIMUM_CHROME_VERSION,
  STORE_MODE_ENV,
  manifestForStore,
  validateStoreEnvironment,
  validateStoreManifest,
  validateStoreZip,
} from "./scripts/store-package.mjs";

// Stable extension ID: kplnlpkpadnofifobjpbkhimpaldaghk
// Derived from this public key so every unpacked load gets the same ID,
// which Clerk's allowed_origins must reference (see README.md).
// The matching private key is NOT in the repo (only needed for non-store
// CRX packing); the Chrome Web Store manages its own key on upload.
const CRX_PUBLIC_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwi7MOC9VPsuzW92BbRo4S8/bc2UFR5T6OJ+B/Z/xiei/0AVsZ2RldB42JBXEUR2ovpWQu03nvNZkOchUgj/veWhQCdbN6IRNFpJMfg/v5tWNQOc40DSYN5hW/vTBCfxR7DgcSNfDaBr2i3P7r3fLpl3klJSWObuqLpk+uQU1eVlLhn+6hoNwE/k82mh3Acuyui94H7MeKG8DRz+kpzutW2IsQicttBF3cKWGk8Kz7iQZTOuDLaMJJgKwgJO4Na2xCyPwRp7jwmCrxv/a7HUIEie4OBKjjDmnydBwjQiSSoQM7KP5Ecj8W9vHJBD/oWD9d9qeF+ryegJfIuYANG8IMwIDAQAB";

// Env vars (WXT_-prefixed) come from .env (see .env.example) or
// the process environment. The function forms below are required so WXT
// loads .env before the values are read.
const isWxtPrepare = () => process.argv.includes("prepare");

const preparePlaceholder = (key: string): string => {
  switch (key) {
    case "WXT_CLERK_SYNC_HOST":
      return "http://localhost";
    case "WXT_CLERK_FRONTEND_API":
      return "https://placeholder.invalid";
    case "WXT_WEB_APP_URL":
      return "http://localhost:3000";
    default:
      return "placeholder";
  }
};

const env = (key: string): string => {
  const value = import.meta.env?.[key] ?? process.env[key];
  if (value?.trim()) {
    return value;
  }
  if (isWxtPrepare()) {
    return preparePlaceholder(key);
  }
  throw new Error(
    `[wxt.config] Missing required environment variable: ${key}. See .env.example.`,
  );
};

let expectedStoreFapiOrigin: string | null = null;

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    plugins: [tailwindcss()],
    define: {
      // @clerk/chrome-extension references Node's `global`, which Vite
      // does not shim. Without this the popup throws at Clerk init.
      global: "globalThis",
    },
    resolve: {
      alias: [
        {
          // @clerk/ui lazy-loads a Solana wallet screen from its SignIn,
          // SignUp and UserProfile components. None of those render in the
          // extension, so ship a null component instead of ~400 kB of
          // @solana/* code (Chrome Web Store: no unnecessary code).
          find: /^.*\/Web3SolanaWalletButtons\.js$/,
          replacement: resolve("stubs/web3-solana-wallet-buttons.tsx"),
        },
      ],
    },
  }),
  alias: {
    "@convex": resolve("convex-api"),
  },
  manifest: () => {
    const storeMode = process.env[STORE_MODE_ENV] === "1";
    const storeEnv = storeMode
      ? validateStoreEnvironment({
          WXT_WEB_APP_URL: env("WXT_WEB_APP_URL"),
          WXT_CONVEX_URL: env("WXT_CONVEX_URL"),
          WXT_CLERK_SYNC_HOST: env("WXT_CLERK_SYNC_HOST"),
          WXT_CLERK_FRONTEND_API: env("WXT_CLERK_FRONTEND_API"),
          WXT_CLERK_PUBLISHABLE_KEY: env("WXT_CLERK_PUBLISHABLE_KEY"),
        })
      : null;
    expectedStoreFapiOrigin = storeEnv?.WXT_CLERK_FRONTEND_API ?? null;
    const manifest = {
      name: "bookmark.land",
      description:
        "Save the page you're reading to bookmark.land with one click.",
      homepage_url: env("WXT_WEB_APP_URL"),
      // chrome.sidePanel shipped in Chrome 114; storage.session and the
      // rest of the MV3 surface used here are older. Older Chromes would
      // install the extension and then throw at sidePanel calls.
      minimum_chrome_version: MINIMUM_CHROME_VERSION,
      key: CRX_PUBLIC_KEY,
      // cookies + storage are required by Clerk's web-app session sync;
      // tabs gives Quick save the current tab's url/title and lets the background worker check URLs for the Saved-page indicator;
      // contextMenus powers the right-click silent saves.
      // sidePanel hosts the Library panel; bookmarks is READ-ONLY access for
      // the Browser import flow (ADR-0001: the native tree is never written).
      permissions: [
        "bookmarks",
        "contextMenus",
        "cookies",
        "sidePanel",
        "storage",
        "tabs",
      ],
      commands: {
        // Saves immediately (no popup click needed); the background worker
        // then opens the popup for organizing where Chrome allows it.
        "save-page": {
          suggested_key: { default: "Ctrl+Shift+S", mac: "Command+Shift+S" },
          description: "Save the current page to bookmark.land",
        },
      },
      host_permissions: [
        `${env("WXT_CLERK_SYNC_HOST")}/*`,
        `${env("WXT_CONVEX_URL")}/*`,
        `${env("WXT_CLERK_FRONTEND_API")}/*`,
      ],
    };
    const result = manifestForStore(manifest, storeMode);
    if (storeEnv) {
      validateStoreManifest(
        { manifest_version: 3, ...result },
        storeEnv.WXT_CLERK_FRONTEND_API,
      );
    }
    return result;
  },
  hooks: {
    "zip:extension:start": async (wxt) => {
      if (process.env[STORE_MODE_ENV] !== "1") return;
      if (!expectedStoreFapiOrigin) {
        throw new Error("[store-package] Store environment was not validated");
      }
      const manifestPath = resolve(wxt.config.outDir, "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<
        string,
        unknown
      >;
      validateStoreManifest(manifest, expectedStoreFapiOrigin);
    },
    "zip:extension:done": async (_wxt, zipPath) => {
      if (process.env[STORE_MODE_ENV] !== "1") return;
      if (!expectedStoreFapiOrigin) {
        throw new Error("[store-package] Store environment was not validated");
      }
      try {
        await validateStoreZip(zipPath, expectedStoreFapiOrigin);
      } catch (error) {
        await unlink(zipPath).catch(() => undefined);
        throw error;
      }
    },
  },
});
