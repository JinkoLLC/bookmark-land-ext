import { describe, expect, it } from "vitest";
import { buildCollectionOptions, suggestTags } from "./organize";

describe("buildCollectionOptions", () => {
  const c = (
    id: string,
    name: string,
    order: number,
    parentId?: string,
  ) => ({ _id: id, name, order, parentId, icon: undefined, color: undefined });

  it("orders children under parents with depth, siblings by order", () => {
    const options = buildCollectionOptions([
      c("b", "Work", 1),
      c("a", "Personal", 0),
      c("a1", "Recipes", 0, "a"),
      c("a2", "Travel", 1, "a"),
      c("a1x", "Desserts", 0, "a1"),
    ]);
    expect(options.map(({ id, name, depth }) => ({ id, name, depth }))).toEqual([
      { id: "a", name: "Personal", depth: 0 },
      { id: "a1", name: "Recipes", depth: 1 },
      { id: "a1x", name: "Desserts", depth: 2 },
      { id: "a2", name: "Travel", depth: 1 },
      { id: "b", name: "Work", depth: 0 },
    ]);
  });

  it("breaks order ties by name", () => {
    const options = buildCollectionOptions([
      c("z", "Zebra", 0),
      c("m", "Mango", 0),
    ]);
    expect(options.map((o) => o.name)).toEqual(["Mango", "Zebra"]);
  });

  it("drops orphaned subtrees and handles empty input", () => {
    expect(
      buildCollectionOptions([c("x", "Orphan", 0, "missing-parent")]),
    ).toEqual([]);
    expect(buildCollectionOptions([])).toEqual([]);
  });
});

describe("suggestTags", () => {
  const tags = ["react", "recipes", "research", "career", "rust"].map(
    (name) => ({ name }),
  );

  it("ranks prefix matches before substring matches, alphabetically", () => {
    expect(suggestTags(tags, "re", [])).toEqual([
      "react",
      "recipes",
      "research",
      "career", // substring match after prefixes
    ]);
  });

  it("excludes tags already on the bookmark (case-insensitive)", () => {
    expect(suggestTags(tags, "re", ["React", "RECIPES"])).toEqual([
      "research",
      "career",
    ]);
  });

  it("suggests nothing for empty input and respects the limit", () => {
    expect(suggestTags(tags, "   ", [])).toEqual([]);
    expect(suggestTags(tags, "r", [], 2)).toHaveLength(2);
  });
});


describe("buildCollectionOptions icon passthrough", () => {
  it("carries icon and color onto options", () => {
    const options = buildCollectionOptions([
      { _id: "x", name: "Dev", order: 0, icon: "🚀", color: "#f00" },
    ]);
    expect(options[0]).toMatchObject({ icon: "🚀", color: "#f00" });
  });
});
