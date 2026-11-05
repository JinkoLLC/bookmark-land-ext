import { describe, expect, it } from "vitest";
import { importPagePath, parseReturnTabId } from "./setup-return";

describe("importPagePath", () => {
  it("carries the web app tab id", () => {
    expect(importPagePath(42)).toBe("/import.html?return=42");
    expect(importPagePath(0)).toBe("/import.html?return=0");
  });

  it("is the plain import page without a usable tab id", () => {
    expect(importPagePath(undefined)).toBe("/import.html");
    expect(importPagePath(-1)).toBe("/import.html");
    expect(importPagePath(Number.NaN)).toBe("/import.html");
  });
});

describe("parseReturnTabId", () => {
  it("reads a tab id", () => {
    expect(parseReturnTabId("?return=42")).toBe(42);
    expect(parseReturnTabId("?x=1&return=0")).toBe(0);
  });

  it("is null when absent or malformed", () => {
    expect(parseReturnTabId("")).toBeNull();
    expect(parseReturnTabId("?return=")).toBeNull();
    expect(parseReturnTabId("?return=abc")).toBeNull();
    expect(parseReturnTabId("?return=-3")).toBeNull();
    expect(parseReturnTabId("?return=1.5")).toBeNull();
    expect(parseReturnTabId("?return=99999999999999999999")).toBeNull();
  });
});
