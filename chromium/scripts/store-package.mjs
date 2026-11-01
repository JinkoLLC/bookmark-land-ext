import { readFile, unlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const STORE_MODE_ENV = "BOOKMARK_LAND_STORE_PACKAGE";
export const PRODUCTION_WEB_ORIGIN = "https://bookmark.land";
export const PRODUCTION_CONVEX_ORIGIN = "https://convex.bookmark.land";
export const PRODUCTION_CLERK_FAPI_ORIGIN = "https://clerk.bookmark.land";
export const AUDITED_HOST_PERMISSIONS = Object.freeze([
  `${PRODUCTION_WEB_ORIGIN}/*`,
  `${PRODUCTION_CONVEX_ORIGIN}/*`,
  `${PRODUCTION_CLERK_FAPI_ORIGIN}/*`,
]);
// chrome.sidePanel (Library panel) requires Chrome 114.
export const MINIMUM_CHROME_VERSION = "114";
export const AUDITED_PERMISSIONS = Object.freeze([
  "bookmarks",
  "contextMenus",
  "cookies",
  "sidePanel",
  "storage",
  "tabs",
]);

const ENV_KEYS = Object.freeze([
  "WXT_WEB_APP_URL",
  "WXT_CONVEX_URL",
  "WXT_CLERK_SYNC_HOST",
  "WXT_CLERK_FRONTEND_API",
  "WXT_CLERK_PUBLISHABLE_KEY",
]);

const requireFromHere = createRequire(import.meta.url);

function fail(message) {
  throw new Error(`[store-package] ${message}`);
}

function exactHttpsOrigin(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${name} must be an HTTPS origin`);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    value !== url.origin
  ) {
    fail(`${name} must be an exact HTTPS origin without credentials, path, query, or fragment`);
  }
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]" ||
    host.endsWith(".invalid")
  ) {
    fail(`${name} must not use a local or placeholder host`);
  }
  return url.origin;
}

export function clerkFrontendApiHostFromPublishableKey(key) {
  if (!key.startsWith("pk_live_")) {
    fail("WXT_CLERK_PUBLISHABLE_KEY must be a Clerk production pk_live_ key");
  }
  const encoded = key.slice("pk_live_".length);
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(encoded)) {
    fail("WXT_CLERK_PUBLISHABLE_KEY has an invalid encoded suffix");
  }
  let bytes;
  try {
    bytes = Buffer.from(
      encoded.replaceAll("-", "+").replaceAll("_", "/"),
      "base64",
    );
  } catch {
    fail("WXT_CLERK_PUBLISHABLE_KEY suffix is not valid base64");
  }
  const urlAlphabet = encoded.includes("-") || encoded.includes("_");
  const canonical = urlAlphabet
    ? bytes.toString("base64url")
    : bytes.toString("base64");
  const canonicalUnpadded = canonical.replace(/=+$/, "");
  const canonicalPadded = canonicalUnpadded.padEnd(
    Math.ceil(canonicalUnpadded.length / 4) * 4,
    "=",
  );
  if (encoded !== canonicalUnpadded && encoded !== canonicalPadded) {
    fail("WXT_CLERK_PUBLISHABLE_KEY suffix is not canonical base64");
  }
  let decoded;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("WXT_CLERK_PUBLISHABLE_KEY suffix is not valid UTF-8");
  }
  if (!decoded.endsWith("$") || decoded.indexOf("$") !== decoded.length - 1) {
    fail("WXT_CLERK_PUBLISHABLE_KEY must decode to a Clerk Frontend API host followed by '$'");
  }
  const host = decoded.slice(0, -1).toLowerCase();
  if (
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) ||
    !host.includes(".") ||
    !/[a-z]/.test(host)
  ) {
    fail("WXT_CLERK_PUBLISHABLE_KEY does not encode a valid Frontend API host");
  }
  exactHttpsOrigin(`https://${host}`, "decoded Clerk Frontend API");
  return host;
}

export function validateStoreEnvironment(source) {
  const env = {};
  for (const key of ENV_KEYS) {
    const value = source[key]?.trim();
    if (!value) fail(`Missing required environment variable: ${key}`);
    env[key] = value;
  }

  const web = exactHttpsOrigin(env.WXT_WEB_APP_URL, "WXT_WEB_APP_URL");
  const convex = exactHttpsOrigin(env.WXT_CONVEX_URL, "WXT_CONVEX_URL");
  const sync = exactHttpsOrigin(env.WXT_CLERK_SYNC_HOST, "WXT_CLERK_SYNC_HOST");
  const fapi = exactHttpsOrigin(
    env.WXT_CLERK_FRONTEND_API,
    "WXT_CLERK_FRONTEND_API",
  );
  if (web !== PRODUCTION_WEB_ORIGIN) {
    fail(`WXT_WEB_APP_URL must equal ${PRODUCTION_WEB_ORIGIN}`);
  }
  if (convex !== PRODUCTION_CONVEX_ORIGIN) {
    fail(`WXT_CONVEX_URL must equal ${PRODUCTION_CONVEX_ORIGIN}`);
  }
  if (sync !== PRODUCTION_WEB_ORIGIN) {
    fail(`WXT_CLERK_SYNC_HOST must equal ${PRODUCTION_WEB_ORIGIN}`);
  }
  if (fapi !== PRODUCTION_CLERK_FAPI_ORIGIN) {
    fail(`WXT_CLERK_FRONTEND_API must equal ${PRODUCTION_CLERK_FAPI_ORIGIN}`);
  }
  const keyHost = clerkFrontendApiHostFromPublishableKey(
    env.WXT_CLERK_PUBLISHABLE_KEY,
  );
  if (new URL(fapi).hostname.toLowerCase() !== keyHost) {
    fail("WXT_CLERK_PUBLISHABLE_KEY and WXT_CLERK_FRONTEND_API refer to different Clerk hosts");
  }
  return Object.freeze({ ...env, WXT_CLERK_FRONTEND_API: fapi });
}

/** Chrome's manifest `version` rules: 1-4 dot-separated integers, each
 * 0-65535 with no leading zeros, and at least one non-zero component. */
export function isChromeVersion(value) {
  if (typeof value !== "string") return false;
  const parts = value.split(".");
  if (parts.length < 1 || parts.length > 4) return false;
  if (!parts.every((part) => /^(0|[1-9]\d{0,4})$/.test(part) && Number(part) <= 65535)) {
    return false;
  }
  return parts.some((part) => Number(part) > 0);
}

function sortedStrings(value, field) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    fail(`manifest.${field} must be an array of strings`);
  }
  return [...value].sort();
}

export function validateStoreManifest(manifest, expectedFapiOrigin) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    fail("manifest must be an object");
  }
  if (manifest.manifest_version !== 3) fail("manifest_version must be 3");
  if (manifest.homepage_url !== PRODUCTION_WEB_ORIGIN) {
    fail(`manifest.homepage_url must equal ${PRODUCTION_WEB_ORIGIN}`);
  }
  if (Object.hasOwn(manifest, "key")) {
    fail("store manifest must not contain the unpacked-only key");
  }
  if (manifest.minimum_chrome_version !== MINIMUM_CHROME_VERSION) {
    fail(`manifest.minimum_chrome_version must equal ${MINIMUM_CHROME_VERSION}`);
  }
  // WXT injects `version` from package.json after the config hook runs, so
  // it is only present in the built and zipped manifests.
  if (Object.hasOwn(manifest, "version") && !isChromeVersion(manifest.version)) {
    fail("manifest.version must be 1 to 4 dot-separated integers, each 0-65535 without leading zeros, and not all zero");
  }

  const actualPermissions = sortedStrings(manifest.permissions, "permissions");
  const expectedPermissions = [...AUDITED_PERMISSIONS].sort();
  if (JSON.stringify(actualPermissions) !== JSON.stringify(expectedPermissions)) {
    fail(`manifest permissions differ from the audited set: ${actualPermissions.join(", ")}`);
  }

  const hostPermissions = sortedStrings(manifest.host_permissions, "host_permissions");
  if (expectedFapiOrigin && !hostPermissions.includes(`${expectedFapiOrigin}/*`)) {
    fail("manifest Clerk host permission does not match WXT_CLERK_FRONTEND_API");
  }
  const expectedHostPermissions = [...AUDITED_HOST_PERMISSIONS].sort();
  if (JSON.stringify(hostPermissions) !== JSON.stringify(expectedHostPermissions)) {
    fail("manifest host_permissions must exactly match the audited production web, Convex, and Clerk origins");
  }

  for (const field of ["optional_permissions", "optional_host_permissions"]) {
    if (Object.hasOwn(manifest, field)) fail(`manifest.${field} is not approved`);
  }
  if (Object.hasOwn(manifest, "externally_connectable")) {
    fail("manifest.externally_connectable is not approved");
  }
  if (Object.hasOwn(manifest, "content_scripts")) {
    fail("manifest.content_scripts is not approved");
  }

  const manifestText = JSON.stringify(manifest);
  if (/localhost|127\.0\.0\.1|\[?::1\]?|http:\/\//i.test(manifestText)) {
    fail("manifest contains a local or insecure URL");
  }
  return true;
}

export async function validateStoreZip(zipPath, expectedFapiOrigin) {
  const JSZip = requireFromHere("jszip");
  const zip = await JSZip.loadAsync(await readFile(zipPath));
  const manifestEntry = zip.file("manifest.json");
  if (!manifestEntry) fail("store ZIP does not contain manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(await manifestEntry.async("string"));
  } catch {
    fail("store ZIP contains an invalid manifest.json");
  }
  validateStoreManifest(manifest, expectedFapiOrigin);
  return manifest;
}

export function manifestForStore(manifest, storeMode) {
  if (!storeMode) return manifest;
  const { key: _unpackedKey, ...storeManifest } = manifest;
  return storeManifest;
}

async function main() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const extensionDir = resolve(scriptDir, "..");
  const packageJson = JSON.parse(
    await readFile(resolve(extensionDir, "package.json"), "utf8"),
  );
  const zipPath = resolve(
    extensionDir,
    ".output",
    `${packageJson.name}-${packageJson.version}-chrome.zip`,
  );
  await unlink(zipPath).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
  });

  const wxtBin = resolve(extensionDir, "node_modules/wxt/bin/wxt.mjs");
  const result = spawnSync(
    process.execPath,
    [wxtBin, "zip", "--mode", "production", "--browser", "chrome", "--mv3"],
    {
      cwd: extensionDir,
      env: { ...process.env, [STORE_MODE_ENV]: "1" },
      stdio: "inherit",
    },
  );
  if (result.error || result.status !== 0) {
    await unlink(zipPath).catch(() => undefined);
    if (result.error) throw result.error;
    fail(`WXT zip failed with exit code ${result.status}`);
  }

  const zipBytes = await readFile(zipPath).catch(async (error) => {
    await unlink(zipPath).catch(() => undefined);
    throw error;
  });
  const digest = createHash("sha256").update(zipBytes).digest("hex");
  console.log(`[store-package] Verified store package: ${zipPath}`);
  console.log(`[store-package] SHA-256: ${digest}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
