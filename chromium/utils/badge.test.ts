import { describe, expect, it } from "vitest";
import { badgeFor, SAVED_BADGE, SECURITY_BADGE } from "./badge";

describe("badgeFor", () => {
  it("shows nothing for a page that isn't saved, flagged or not", () => {
    expect(badgeFor({ saved: false })).toBeNull();
    expect(badgeFor({ saved: false, riskLevel: "vulnerable" })).toBeNull();
  });

  it("shows a green check on a saved page", () => {
    expect(badgeFor({ saved: true })).toEqual(SAVED_BADGE);
    expect(SAVED_BADGE).toMatchObject({ text: "✓", textColor: "#ffffff" });
  });

  it("shows a red exclamation mark on a saved Vulnerable or End-of-life site", () => {
    expect(badgeFor({ saved: true, riskLevel: "vulnerable" })).toEqual(SECURITY_BADGE);
    expect(badgeFor({ saved: true, riskLevel: "endOfLife" })).toEqual(SECURITY_BADGE);
    expect(SECURITY_BADGE).toMatchObject({ text: "!", background: "#dc2626", textColor: "#ffffff" });
  });

  it("keeps the check for a Possibly affected site", () => {
    expect(badgeFor({ saved: true, riskLevel: "possiblyAffected" })).toEqual(SAVED_BADGE);
  });
});
