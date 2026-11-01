import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import {
  isSaveableUrl,
  prepareSaveArgs,
  stateFromResult,
  stateFromError,
  deriveQuickSaveView,
} from "./quick-save";

describe("isSaveableUrl", () => {
  it("accepts http and https pages", () => {
    expect(isSaveableUrl("https://example.com/a")).toBe(true);
    expect(isSaveableUrl("http://example.com")).toBe(true);
  });

  it("rejects browser-internal and non-web schemes", () => {
    expect(isSaveableUrl("chrome://extensions")).toBe(false);
    expect(isSaveableUrl("about:blank")).toBe(false);
    expect(isSaveableUrl("file:///tmp/a.html")).toBe(false);
    expect(isSaveableUrl("chrome-extension://abc/popup.html")).toBe(false);
    expect(isSaveableUrl("javascript:void(0)")).toBe(false);
  });

  it("rejects missing or oversized URLs", () => {
    expect(isSaveableUrl(undefined)).toBe(false);
    expect(isSaveableUrl("")).toBe(false);
    expect(isSaveableUrl(`https://example.com/${"a".repeat(2048)}`)).toBe(
      false,
    );
  });
});

describe("prepareSaveArgs", () => {
  it("passes url and trimmed title", () => {
    expect(
      prepareSaveArgs({ url: "https://a.com", title: "  Hello  " }),
    ).toEqual({ url: "https://a.com", title: "Hello" });
  });

  it("truncates titles to the server limit (100)", () => {
    const args = prepareSaveArgs({
      url: "https://a.com",
      title: "x".repeat(250),
    });
    expect(args.title).toHaveLength(100);
  });

  it("omits empty or missing titles", () => {
    expect(prepareSaveArgs({ url: "https://a.com", title: "   " })).toEqual({
      url: "https://a.com",
    });
    expect(prepareSaveArgs({ url: "https://a.com" })).toEqual({
      url: "https://a.com",
    });
  });
});

describe("stateFromResult", () => {
  it("maps a fresh save with its bookmark id", () => {
    expect(stateFromResult({ duplicate: false, bookmarkId: "bm1" })).toEqual({
      status: "saved",
      bookmarkId: "bm1",
    });
  });

  it("maps a restore from Trash with its existing title", () => {
    expect(
      stateFromResult({
        duplicate: false,
        restored: true,
        existingTitle: "Old title",
        bookmarkId: "bm2",
      }),
    ).toEqual({
      status: "restored",
      existingTitle: "Old title",
      bookmarkId: "bm2",
    });
  });

  it("maps an active duplicate to the existing bookmark", () => {
    expect(stateFromResult({ duplicate: true, bookmarkId: "bm3" })).toEqual({
      status: "already-saved",
      bookmarkId: "bm3",
    });
  });
});

describe("stateFromError", () => {
  it("maps the plan-limit ConvexError with its limit", () => {
    expect(stateFromError(new ConvexError("BOOKMARK_LIMIT_REACHED:100"))).toEqual(
      { status: "error", kind: "limit", limit: 100 },
    );
  });

  it("treats other ConvexErrors as retryable", () => {
    expect(stateFromError(new ConvexError("RATE_LIMITED"))).toEqual({
      status: "error",
      kind: "retryable",
    });
    expect(stateFromError(new ConvexError({ kind: "RateLimited" }))).toEqual({
      status: "error",
      kind: "retryable",
    });
  });

  it("treats plain errors and unknowns as retryable", () => {
    expect(stateFromError(new Error("network down"))).toEqual({
      status: "error",
      kind: "retryable",
    });
    expect(stateFromError(undefined)).toEqual({
      status: "error",
      kind: "retryable",
    });
  });
});

describe("deriveQuickSaveView", () => {
  const tab = { url: "https://a.com/" };

  it("prioritizes an active save flow over everything", () => {
    expect(
      deriveQuickSaveView({
        tab,
        existing: null,
        saveState: { status: "saving" },
      }),
    ).toEqual({ kind: "save-flow", state: { status: "saving" } });
  });

  it("is checking while the tab resolves", () => {
    expect(
      deriveQuickSaveView({ tab: undefined, existing: undefined, saveState: null }),
    ).toEqual({ kind: "checking" });
  });

  it("shows the Add button without waiting for the duplicate lookup", () => {
    expect(
      deriveQuickSaveView({ tab, existing: undefined, saveState: null }),
    ).toEqual({ kind: "ready" });
  });

  it("is unsupported for non-saveable pages regardless of the lookup", () => {
    expect(
      deriveQuickSaveView({ tab: null, existing: undefined, saveState: null }),
    ).toEqual({ kind: "unsupported" });
  });

  it("is ready (Add button) when the page is not saved yet", () => {
    expect(deriveQuickSaveView({ tab, existing: null, saveState: null })).toEqual(
      { kind: "ready" },
    );
  });

  it("goes straight to edit mode when the page is already saved", () => {
    expect(
      deriveQuickSaveView({
        tab,
        existing: { bookmarkId: "bm1" },
        saveState: null,
      }),
    ).toEqual({ kind: "already-saved", bookmarkId: "bm1" });
  });
});
