import { describe, expect, it } from "vitest";
import { searchTermFor } from "./panel-search";

describe("searchTermFor", () => {
  it("returns the trimmed term for real input", () => {
    expect(searchTermFor("  react hooks ")).toBe("react hooks");
  });

  it("returns null (browse mode) for empty or whitespace input", () => {
    expect(searchTermFor("")).toBeNull();
    expect(searchTermFor("   ")).toBeNull();
  });
});
