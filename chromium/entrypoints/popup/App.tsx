import { ClerkProvider } from "@clerk/chrome-extension";
import { ConvexReactClient } from "convex/react";
import { Popup } from "@/components/popup";
import { useDevBrowserReady } from "@/hooks/use-dev-browser-ready";
import { ConvexProviderWithExtensionAuth } from "@/components/convex-extension-provider";

type RequiredExtensionEnv =
  | "WXT_CONVEX_URL"
  | "WXT_CLERK_PUBLISHABLE_KEY"
  | "WXT_CLERK_SYNC_HOST";

const requiredEnv = (key: RequiredExtensionEnv): string => {
  const value = (import.meta.env as Record<string, string | undefined>)[key];
  if (!value?.trim()) {
    throw new Error(
      `[extension] Missing required environment variable: ${key}. See extension/.env.example.`,
    );
  }
  return value;
};

const CONVEX_URL = requiredEnv("WXT_CONVEX_URL");
const CLERK_PUBLISHABLE_KEY = requiredEnv("WXT_CLERK_PUBLISHABLE_KEY");
const CLERK_SYNC_HOST = requiredEnv("WXT_CLERK_SYNC_HOST");

// Convex auth is minted by the background worker so extension surfaces stay
// authenticated even when Clerk's synced localhost dev-browser cookie is stale.
// syncHost still lets Clerk hydrate user/session UI from the web app.
const convex = new ConvexReactClient(CONVEX_URL, {
  skipConvexDeploymentUrlCheck: true,
});

export default function App() {
  // Repair a stale dev-browser cookie BEFORE clerk-js reads it (no-op in
  // production and on agreeing cookies).
  if (!useDevBrowserReady()) return null;
  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      syncHost={CLERK_SYNC_HOST}
    >
      <ConvexProviderWithExtensionAuth client={convex}>
        <Popup />
      </ConvexProviderWithExtensionAuth>
    </ClerkProvider>
  );
}
