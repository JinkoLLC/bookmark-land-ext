import { describe, expect, it } from "vitest";
import {
  importCounts,
  importHeading,
  importLinks,
  importSample,
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
    expect(importHeading(partial)).toBe("Only 6 bookmarks were imported");
    expect(importHeading({ ...partial, imported: 1, restored: 0 })).toBe("Only 1 bookmark was imported");
    expect(importHeading(here)).toBe("Already all here");
    expect(importHeading(nothing)).toBe("Nothing was imported");
  });

  it("never says everything was already saved when some were skipped", () => {
    expect(importSubtext(nothing)).toBe("47 bookmarks could not be imported.");
    expect(importSubtext(here)).toContain("already in your library");
  });

  it("says the skipped count once, and the plan's limit beside it (not as its cause) when reached", () => {
    const atLimit = "47 bookmarks weren't imported. Your library is at its 100-bookmark limit.";
    expect(importSubtext(partial, 100)).toBe(atLimit);
    expect(importSubtext(nothing, 100)).toBe(atLimit);
    expect(importSubtext({ ...nothing, skipped: 1 }, 1000)).toBe(
      "1 bookmark wasn't imported. Your library is at its 1,000-bookmark limit.",
    );
    expect(importSubtext(partial)).toMatch(/^47 could not be imported\. /);
    for (const result of [partial, nothing]) {
      const said = [importHeading(result), importSubtext(result, 100), ...importCounts(result)];
      expect(said.filter((line) => line.includes("47"))).toHaveLength(1);
    }
  });

  it("shows the sample only for a complete import, one row per address", () => {
    const sent = [
      { url: "https://a.example/", title: "A" },
      { url: "https://a.example/", title: "A again" },
      { url: "https://b.example/", title: "B" },
      { url: "https://b.example/other", title: "B" },
      { url: "https://c.example/" },
    ];
    expect(importSample(all, sent, 8)).toEqual([sent[1], sent[3], sent[4]]);
    expect(importSample({ ...all, imported: 1, restored: 0 }, sent, 8)).toHaveLength(1);
    for (const result of [partial, here, nothing]) expect(importSample(result, sent, 8)).toEqual([]);
  });

  it("lists only the counts that aren't zero", () => {
    expect(importCounts(partial)).toEqual([
      "4 new",
      "2 restored from Trash",
      "11 already in your library",
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
