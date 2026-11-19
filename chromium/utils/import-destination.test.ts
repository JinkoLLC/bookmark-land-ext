import { describe, expect, it } from "vitest";
import {
  destinationArgFor,
  destinationBaseDepth,
  importedCollectionName,
  collectionWithPath,
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

describe("collectionWithPath", () => {
  const options = [
    { id: "a", name: "Research", depth: 0 },
    { id: "b", name: "Policy", depth: 1 },
    { id: "c", name: "Grid storage", depth: 2 },
    { id: "d", name: "Typography", depth: 1 },
    { id: "e", name: "Engineering", depth: 0 },
  ];

  it("gives the parents of a nested collection, outermost first", () => {
    expect(collectionWithPath(options, "c")).toEqual({ name: "Grid storage", path: "Research / Policy" });
    // A sibling's subtree in between is not an ancestor.
    expect(collectionWithPath(options, "d")).toEqual({ name: "Typography", path: "Research" });
  });

  it("has no path at the top level and nothing for an unknown id", () => {
    expect(collectionWithPath(options, "e")).toEqual({ name: "Engineering", path: "" });
    expect(collectionWithPath(options, undefined)).toBeNull();
  });
});
