import { useEffect, useState } from "react";

export const AUTH_STALL_MS = 8_000;

/**
 * True once `waiting` has been continuously true for `ms`. Used to detect
 * clerk-js failing to load (dead dev-browser cookie → endless 401s) so the
 * UI can fall back instead of showing "Loading…" forever.
 */
export function useStalled(waiting: boolean, ms = AUTH_STALL_MS): boolean {
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (!waiting) {
      setStalled(false);
      return;
    }
    const timer = setTimeout(() => setStalled(true), ms);
    return () => clearTimeout(timer);
  }, [waiting, ms]);

  return stalled;
}
