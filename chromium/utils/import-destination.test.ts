import { describe, expect, it } from "vitest";
import {
  destinationArgFor,
  destinationBaseDepth,
  importedCollectionName,
} from "./import-destination";

const depths: Record<string, number> = { top: 0, nested: 2, deepest: 4 };
const depthOf = (id: string) => depths[id];
const NOW = new Date(2026, 10, 1, 15, 42);

describe("importedCollectionName", () => {
  it("names the default destination after the moment of the import", () => {
    expect(importedCollectionName(NOW)).toMatch(/^Imported Nov 1, 2026,? 3:42\sPM$/);
  });
});

describe("destinationBaseDepth", () => {
  it("top-level destinations import at depth 1", () => {
    expect(destinationBaseDepth({ kind: "imported" }, depthOf)).toBe(1);
    expect(destinationBaseDepth({ kind: "new", name: "X" }, depthOf)).toBe(1);
  });

  it("existing destinations import one level below the collection", () => {
    expect(destinationBaseDepth({ kind: "existing", id: "top" }, depthOf)).toBe(1);
    expect(destinationBaseDepth({ kind: "existing", id: "nested" }, depthOf)).toBe(3);
    expect(destinationBaseDepth({ kind: "existing", id: "deepest" }, depthOf)).toBe(5);
  });

  it("treats an unpicked or unknown existing destination as top-level", () => {
    expect(destinationBaseDepth({ kind: "existing" }, depthOf)).toBe(1);
    expect(destinationBaseDepth({ kind: "existing", id: "gone" }, depthOf)).toBe(1);
  });
});

describe("destinationArgFor", () => {
  it("maps the complete choices to action arguments", () => {
    expect(destinationArgFor({ kind: "imported" }, NOW)).toEqual({
      type: "create",
      name: importedCollectionName(NOW),
    });
    expect(destinationArgFor({ kind: "new", name: "  My Import " })).toEqual({
      type: "create",
      name: "My Import",
    });
    expect(destinationArgFor({ kind: "existing", id: "top" })).toEqual({
      type: "collection",
      id: "top",
    });
  });

  it("returns null while the choice is incomplete", () => {
    expect(destinationArgFor({ kind: "new", name: "   " })).toBeNull();
    expect(destinationArgFor({ kind: "existing" })).toBeNull();
  });
});
