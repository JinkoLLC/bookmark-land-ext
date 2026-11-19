import { describe, expect, it } from "vitest";
import {
  importCounts,
  importHeading,
  importLinks,
  importOutcome,
  importSubtext,
  reachedPlanLimit,
  sampleTitle,
} from "./import-result";

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

describe("the result screen's decisions", () => {
  const all = { imported: 1280, restored: 4, duplicates: 0, skipped: 0 };
  const partial = { imported: 4, restored: 2, duplicates: 11, skipped: 47 };
  const here = { imported: 0, restored: 0, duplicates: 64, skipped: 0 };
  const nothing = { imported: 0, restored: 0, duplicates: 3, skipped: 47 };

  it("tells the four endings apart", () => {
    expect([all, partial, here, nothing].map(importOutcome)).toEqual([
      "imported",
      "partial",
      "already-here",
      "nothing",
    ]);
  });

  it("words the heading from what arrived and what was skipped", () => {
    expect(importHeading(all)).toBe("1,284 bookmarks imported");
    expect(importHeading({ ...all, imported: 1, restored: 0 })).toBe("1 bookmark imported");
    expect(importHeading(partial)).toBe("6 bookmarks imported, 47 could not be imported");
    expect(importHeading(here)).toBe("Already all here");
    expect(importHeading(nothing)).toBe("Nothing was imported");
  });

  it("never says everything was already saved when some were skipped", () => {
    expect(importSubtext(nothing)).toBe("47 bookmarks could not be imported.");
    expect(importSubtext(here)).toContain("already in your library");
  });

  it("lists only the counts that aren't zero", () => {
    expect(importCounts(partial)).toEqual([
      "4 new",
      "2 restored from Trash",
      "11 already in your library",
      "47 could not be imported",
    ]);
    expect(importCounts(all)).toEqual(["1,280 new", "4 restored from Trash"]);
    expect(importCounts(here)).toEqual(["64 already in your library"]);
  });

  it("blames the plan's limit only when the library has reached it", () => {
    expect(reachedPlanLimit(partial, { bookmarkCount: 100, limit: 100 })).toBe(100);
    expect(reachedPlanLimit(partial, { bookmarkCount: 96, limit: 100 })).toBeNull();
    // Nothing was skipped: a full library is no news.
    expect(reachedPlanLimit(all, { bookmarkCount: 100, limit: 100 })).toBeNull();
    expect(reachedPlanLimit(partial, undefined)).toBeNull();
  });

  it("heads the sample as the selection unless everything picked came over", () => {
    expect(sampleTitle(all)).toBe("Some of what came over");
    expect(sampleTitle(partial)).toBe("Some of what you picked");
    expect(sampleTitle({ ...all, duplicates: 2 })).toBe("Some of what you picked");
  });
});
