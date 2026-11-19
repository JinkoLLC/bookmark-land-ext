import { describe, expect, it } from "vitest";
import {
  importHeading,
  importLinks,
  importSample,
  importOutcome,
  importLines,
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
    expect(importHeading(all)).toBe(`${(1284).toLocaleString()} bookmarks imported`);
    expect(importHeading({ ...all, imported: 1, restored: 0 })).toBe("1 bookmark imported");
    expect(importHeading(partial)).toBe("6 bookmarks imported, 47 could not be imported");
    expect(importHeading({ ...partial, imported: 1, restored: 0, skipped: 1 })).toBe(
      "1 bookmark imported, 1 could not be imported",
    );
    expect(importHeading(here)).toBe("Already all here");
    expect(importHeading(nothing)).toBe("Nothing was imported");
  });

  it("lists under the heading only the lines that apply", () => {
    const grew = "Your library just grew. Everything is searchable on bookmark.land and in the Library panel.";
    const limit = "Your library is at its 100-bookmark limit.";
    expect(importLines(all)).toEqual([grew, `Imported: ${(1280).toLocaleString()} new · 4 restored from Trash`]);
    // No restored ones: the heading already says the number.
    expect(importLines({ ...all, restored: 0 })).toEqual([grew]);
    expect(importLines(partial, 100)).toEqual([
      "Imported: 4 new · 2 restored from Trash",
      "11 were already in your library.",
      limit,
    ]);
    expect(importLines(partial)).toEqual([
      "Imported: 4 new · 2 restored from Trash",
      "11 were already in your library.",
    ]);
    expect(importLines({ ...partial, imported: 0, duplicates: 1 })).toEqual([
      "Imported: 2 restored from Trash",
      "1 was already in your library.",
    ]);
    expect(importLines({ ...partial, restored: 0, duplicates: 0 }, 100)).toEqual([limit]);
    expect(importLines(nothing, 100)).toEqual([
      "47 bookmarks could not be imported.",
      "3 were already in your library.",
      limit,
    ]);
    expect(importLines({ ...nothing, duplicates: 0, skipped: 1 }, 1000)).toEqual([
      "1 bookmark could not be imported.",
      `Your library is at its ${(1000).toLocaleString()}-bookmark limit.`,
    ]);
    expect(importLines(here)).toEqual(["64 were already in your library."]);
  });

  it("says each number once on the screen", () => {
    for (const result of [partial, nothing, here]) {
      const said = [importHeading(result), ...importLines(result, 100)].join(" ");
      for (const n of [result.imported + result.restored, result.imported, result.restored, result.duplicates, result.skipped])
        if (n > 0) expect(said.match(new RegExp(`\\b${n}\\b`, "g")), `${n} in "${said}"`).toHaveLength(1);
      expect(said).not.toMatch(/other|came over|weren't/);
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

  it("blames the plan's limit only when the library has reached it", () => {
    expect(reachedPlanLimit(partial, { bookmarkCount: 100, limit: 100 })).toBe(100);
    expect(reachedPlanLimit(partial, { bookmarkCount: 96, limit: 100 })).toBeNull();
    // Nothing was skipped: a full library is no news.
    expect(reachedPlanLimit(all, { bookmarkCount: 100, limit: 100 })).toBeNull();
    expect(reachedPlanLimit(partial, undefined)).toBeNull();
  });

  it("heads the sample as the selection unless everything picked was imported", () => {
    expect(sampleTitle(all)).toBe("Some of what was imported");
    expect(sampleTitle(partial)).toBe("Some of what you picked");
    expect(sampleTitle({ ...all, duplicates: 2 })).toBe("Some of what you picked");
  });
});
