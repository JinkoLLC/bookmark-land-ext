import { describe, expect, it } from "vitest";
import {
  destinationArgFor,
  destinationBaseDepth,
  destinationName,
  importedCollectionName,
  importReadiness,
  collectionWithPath,
  COLLECTION_GONE,
} from "./import-destination";

const depths: Record<string, number> = { top: 0, nested: 2, deepest: 4 };
const depthOf = (id: string) => depths[id];
const NOW = new Date(2026, 10, 1, 15, 42);
const NAME = importedCollectionName(NOW);

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
    // The name it is given, not one made at the moment of the call.
    expect(destinationArgFor({ kind: "imported" }, NAME)).toEqual({
      type: "create",
      name: NAME,
    });
    expect(destinationArgFor({ kind: "new", name: "  My Import " }, NAME)).toEqual({
      type: "create",
      name: "My Import",
    });
    expect(destinationArgFor({ kind: "existing", id: "top" }, NAME)).toEqual({
      type: "collection",
      id: "top",
    });
  });

  it("returns null while the choice is incomplete", () => {
    expect(destinationArgFor({ kind: "new", name: "   " }, NAME)).toBeNull();
    expect(destinationArgFor({ kind: "existing" }, NAME)).toBeNull();
  });
});

describe("destinationName", () => {
  const options = [{ id: "top", name: "Research", depth: 0 }];

  it("is the name the import submits", () => {
    expect(destinationName({ kind: "imported" }, NAME, options)).toBe(NAME);
    expect(destinationName({ kind: "new", name: " My Import " }, NAME, options)).toBe("My Import");
    expect(destinationName({ kind: "existing", id: "top" }, NAME, options)).toBe("Research");
  });

  it("has a stand-in while the choice is incomplete", () => {
    expect(destinationName({ kind: "new", name: " " }, NAME, options)).toBe("the new collection");
    expect(destinationName({ kind: "existing" }, NAME, options)).toBe("the collection you choose");
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

describe("importReadiness", () => {
  const loaded = [{ id: "top" }, { id: "nested" }];
  const base = {
    destination: { kind: "existing", id: "top" },
    collections: loaded,
    livePages: "ready",
    plan: "ready",
    selection: "some",
  } as const;
  const READY = { ready: true };
  const no = (reason: string, waiting = false) => ({ ready: false, reason, waiting });

  it.each([
    ["existing collection, everything loaded", {}, READY],
    ["default destination", { destination: { kind: "imported" } }, READY],
    ["default destination while the collections failed", { destination: { kind: "imported" }, collections: "failed" }, READY],
    ["new collection, named", { destination: { kind: "new", name: "Mine" }, collections: "loading" }, READY],
    ["new collection, name blank", { destination: { kind: "new", name: "  " } }, no("Name the new collection.")],
    ["no collection chosen yet", { destination: { kind: "existing" } }, no("Choose a collection to import into.")],
    ["collections retry in flight, id kept", { collections: "loading" }, no("Loading your collections…", true)],
    ["collections retry in flight, live pages known", { collections: "loading", livePages: "ready" }, no("Loading your collections…", true)],
    ["collections read failed", { collections: "failed" }, no("Your collections didn’t load: retry in step 2, or import into a new collection.")],
    ["collection gone from the completed read", { destination: { kind: "existing", id: "deleted" } }, no(COLLECTION_GONE)],
    ["collection gone, choice cleared", { destination: { kind: "existing", gone: true } }, no(COLLECTION_GONE)],
    ["live-page check loading", { livePages: "loading" }, no("Waiting for the live-page check in step 2.", true)],
    ["live-page check failed", { livePages: "failed" }, no("The live-page check failed: retry it in step 2.")],
    ["plan failed", { plan: "failed" }, READY],
    ["plan loading", { plan: "loading" }, READY],
    ["nothing selected", { selection: "none" }, no("Select at least one folder")],
    ["nothing importable", { selection: "nothing-importable" }, no("These folders have no bookmarks that can be imported.")],
    ["nothing selected comes before the destination", { selection: "none", collections: "loading" }, no("Select at least one folder")],
  ] as const)("%s", (_name, change, expected) => {
    expect(importReadiness({ ...base, ...change })).toEqual(expected);
  });
});
