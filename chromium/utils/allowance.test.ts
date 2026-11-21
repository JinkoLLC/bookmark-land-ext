import { describe, expect, it } from "vitest";
import { allowanceWarningFor } from "./allowance";

describe("allowanceWarningFor", () => {
  it("returns null when the selection fits", () => {
    expect(allowanceWarningFor(2, 98, 100)).toBeNull();
    expect(allowanceWarningFor(0, 100, 100)).toBeNull();
  });

  it("reports the room left when the selection exceeds the allowance", () => {
    expect(allowanceWarningFor(10, 98, 100)).toEqual({ remaining: 2 });
  });

  it("handles an already-full library", () => {
    expect(allowanceWarningFor(5, 100, 100)).toEqual({ remaining: 0 });
  });

  it("never reports negative remaining when over the limit", () => {
    expect(allowanceWarningFor(5, 120, 100)).toEqual({ remaining: 0 });
  });
});
