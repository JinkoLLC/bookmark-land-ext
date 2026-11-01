import { describe, expect, it } from "vitest";
import { importAddedAnything, importLinks } from "./import-result";

const counts = { imported: 3, restored: 0, duplicates: 1, skipped: 0 };

describe("importLinks", () => {
  it("opens the first imported collection and lists every one", () => {
    expect(
      importLinks({
        ...counts,
        destinationId: "dest",
        collections: [
          { id: "bar", name: "Bookmarks bar" },
          { id: "other", name: "Other bookmarks" },
        ],
      }),
    ).toEqual({
      primaryPath: "/collections/bar",
      collections: [
        { name: "Bookmarks bar", path: "/collections/bar" },
        { name: "Other bookmarks", path: "/collections/other" },
      ],
    });
  });

  it("falls back to the destination, then the library", () => {
    expect(importLinks({ ...counts, destinationId: "dest", collections: [] }).primaryPath).toBe(
      "/collections/dest",
    );
    // A backend that predates the fields.
    expect(importLinks(counts)).toEqual({ primaryPath: "/dashboard", collections: [] });
  });
});

describe("importAddedAnything", () => {
  it("counts new and restored bookmarks, not duplicates", () => {
    expect(importAddedAnything(counts)).toBe(true);
    expect(importAddedAnything({ ...counts, imported: 0, restored: 2 })).toBe(true);
    expect(importAddedAnything({ ...counts, imported: 0 })).toBe(false);
  });
});
