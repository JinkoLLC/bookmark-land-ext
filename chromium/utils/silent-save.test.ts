import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { pendingErrorFrom, isPendingSilentError } from "./silent-save";

describe("pendingErrorFrom", () => {
  it("maps the plan-limit error with its limit", () => {
    expect(
      pendingErrorFrom(
        "https://a.com",
        new ConvexError("BOOKMARK_LIMIT_REACHED:100"),
      ),
    ).toEqual({ url: "https://a.com", kind: "limit", limit: 100 });
  });

  it("maps everything else as retryable", () => {
    expect(pendingErrorFrom("https://a.com", new Error("offline"))).toEqual({
      url: "https://a.com",
      kind: "retryable",
    });
    expect(pendingErrorFrom("https://a.com", undefined)).toEqual({
      url: "https://a.com",
      kind: "retryable",
    });
  });
});

describe("isPendingSilentError", () => {
  it("accepts valid records", () => {
    expect(
      isPendingSilentError({ url: "https://a.com", kind: "retryable" }),
    ).toBe(true);
    expect(
      isPendingSilentError({ url: "https://a.com", kind: "limit", limit: 100 }),
    ).toBe(true);
  });

  it("rejects malformed values", () => {
    expect(isPendingSilentError(null)).toBe(false);
    expect(isPendingSilentError({ url: 1, kind: "limit" })).toBe(false);
    expect(isPendingSilentError({ url: "x", kind: "other" })).toBe(false);
  });
});
