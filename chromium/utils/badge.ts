/**
 * The toolbar badge for the active tab. Pure so the colour rules are tested.
 *
 * - A saved page whose Site is flagged Vulnerable or End-of-life: a red box
 *   with a white "!" (a security warning beats "saved").
 * - Any other saved page: a green box with a white check.
 * - Not saved: no badge.
 *
 * "Possibly affected" (a distro package that may already be patched) does
 * not warn here; the popup and side panel still show it.
 */

export interface Badge {
  text: string;
  background: string;
  textColor: string;
}

export const SAVED_BADGE: Badge = { text: "✓", background: "#16a34a", textColor: "#ffffff" };
export const SECURITY_BADGE: Badge = { text: "!", background: "#dc2626", textColor: "#ffffff" };

const WARNING_LEVELS = new Set(["vulnerable", "endOfLife"]);

export function badgeFor(input: { saved: boolean; riskLevel?: string }): Badge | null {
  if (!input.saved) return null;
  if (input.riskLevel && WARNING_LEVELS.has(input.riskLevel)) return SECURITY_BADGE;
  return SAVED_BADGE;
}
