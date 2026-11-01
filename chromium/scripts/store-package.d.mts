export const STORE_MODE_ENV: string;
export const PRODUCTION_WEB_ORIGIN: string;
export const PRODUCTION_CONVEX_ORIGIN: string;
export const PRODUCTION_CLERK_FAPI_ORIGIN: string;
export const MINIMUM_CHROME_VERSION: string;
export const AUDITED_PERMISSIONS: readonly string[];

export function isChromeVersion(value: unknown): boolean;
export function clerkFrontendApiHostFromPublishableKey(key: string): string;
export function validateStoreEnvironment(
  source: Record<string, string | undefined>,
): Readonly<Record<string, string>>;
export function validateStoreManifest(
  manifest: Record<string, unknown>,
  expectedFapiOrigin?: string,
): true;
export function validateStoreZip(
  zipPath: string,
  expectedFapiOrigin?: string,
): Promise<Record<string, unknown>>;
export function manifestForStore<T extends Record<string, unknown>>(
  manifest: T,
  storeMode: boolean,
): T | Omit<T, "key">;
