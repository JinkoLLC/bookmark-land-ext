import { useEffect, useState } from "react";
import { ensureFreshDevBrowserCookie } from "@/utils/dev-browser";

/**
 * Runs the dev-browser cookie repair once before ClerkProvider mounts, so
 * clerk-js reads a validated `__clerk_db_jwt`. Resolves immediately (no
 * network) unless the sync host's candidate cookies diverge; never blocks
 * on failure.
 */
export function useDevBrowserReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    void ensureFreshDevBrowserCookie().finally(() => {
      if (mounted) setReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return ready;
}
