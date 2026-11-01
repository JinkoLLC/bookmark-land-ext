import { describe, expect, it } from "vitest";
import { allowanceWarningFor } from "./allowance";

describe("allowanceWarningFor", () => {
  it("returns null when the selection fits", () => {
    expect(allowanceWarningFor(2, 98, 100)).toBeNull();
    expect(allowanceWarningFor(0, 100, 100)).toBeNull();
  });

  it("computes the split when the selection exceeds the allowance", () => {
    expect(allowanceWarningFor(10, 98, 100)).toEqual({
      remaining: 2,
      willImport: 2,
      willSkip: 8,
    });
  });

  it("handles an already-full library", () => {
    expect(allowanceWarningFor(5, 100, 100)).toEqual({
      remaining: 0,
      willImport: 0,
      willSkip: 5,
    });
  });

  it("never reports negative remaining when over the limit", () => {
    expect(allowanceWarningFor(5, 120, 100)).toEqual({
      remaining: 0,
      willImport: 0,
      willSkip: 5,
    });
  });
});
