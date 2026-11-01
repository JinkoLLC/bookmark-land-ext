import { describe, expect, it } from "vitest";
import { buildImportModel, type NativeNode } from "./import-tree";

const bm = (id: string, url: string, title = `t-${id}`): NativeNode => ({
  id,
  title,
  url,
});
const folder = (
  id: string,
  title: string,
  children: NativeNode[],
): NativeNode => ({ id, title, children });

const NONE = new Set<string>();

describe("buildImportModel", () => {
  it("maps top-level folders to top-level collections with nested children", () => {
    const roots = [
      folder("1", "Bookmarks Bar", [
        folder("10", "Dev", [
          bm("100", "https://a.com/"),
          folder("11", "React", [bm("110", "https://b.com/")]),
        ]),
      ]),
    ];
    const model = buildImportModel(roots, NONE);
    expect(model.folders).toEqual([
      { key: "10", name: "Dev", parentKey: undefined },
      { key: "11", name: "React", parentKey: "10" },
    ]);
    expect(model.bookmarks).toEqual([
      { url: "https://a.com/", title: "t-100", folderKey: "10" },
      { url: "https://b.com/", title: "t-110", folderKey: "11" },
    ]);
    expect(model.importableCount).toBe(2);
  });

  it("gathers loose root bookmarks into a root-named collection, lazily", () => {
    const roots = [
      folder("1", "Bookmarks Bar", [
        bm("100", "https://loose.com/"),
        folder("10", "Dev", [bm("101", "https://a.com/")]),
      ]),
      folder("2", "Other Bookmarks", [folder("20", "Misc", [])]),
    ];
    const model = buildImportModel(roots, NONE);
    expect(model.folders).toContainEqual({
      key: "root:1",
      name: "Bookmarks Bar",
    });
    // "Other Bookmarks" has no loose bookmarks → no synthetic folder for it.
    expect(model.folders.find((f) => f.key === "root:2")).toBeUndefined();
    expect(model.bookmarks[0]).toEqual({
      url: "https://loose.com/",
      title: "t-100",
      folderKey: "root:1",
    });
  });

  it("excludes non-web schemes upfront with a count", () => {
    const roots = [
      folder("1", "Bar", [
        bm("100", "javascript:void(0)"),
        bm("101", "chrome://settings"),
        folder("10", "F", [bm("102", "file:///etc/hosts"), bm("103", "https://ok.com/")]),
      ]),
    ];
    const model = buildImportModel(roots, NONE);
    expect(model.importableCount).toBe(1);
    expect(model.excludedSchemeCount).toBe(3);
    expect(model.bookmarks).toEqual([
      { url: "https://ok.com/", title: "t-103", folderKey: "10" },
    ]);
  });

  it("excluding a folder drops its whole subtree; excluding a root drops the root", () => {
    const roots = [
      folder("1", "Bar", [
        folder("10", "Keep", [bm("100", "https://keep.com/")]),
        folder("11", "Drop", [
          bm("110", "https://drop.com/"),
          folder("12", "DropChild", [bm("120", "https://drop2.com/")]),
        ]),
      ]),
      folder("2", "Mobile", [bm("200", "https://mobile.com/")]),
    ];
    const model = buildImportModel(roots, new Set(["11", "2"]));
    expect(model.bookmarks.map((b) => b.url)).toEqual(["https://keep.com/"]);
    expect(model.folders.map((f) => f.key)).toEqual(["10"]);
  });

  it("flattens folders beyond depth 5 into the deepest within-limit ancestor", () => {
    // d0/d1/d2/d3/d4 are collections (depths 0..4); d5 and d6 merge into d4.
    const d6 = folder("d6", "D6", [bm("b6", "https://six.com/")]);
    const d5 = folder("d5", "D5", [bm("b5", "https://five.com/"), d6]);
    const d4 = folder("d4", "D4", [bm("b4", "https://four.com/"), d5]);
    const d3 = folder("d3", "D3", [d4]);
    const d2 = folder("d2", "D2", [d3]);
    const d1 = folder("d1", "D1", [d2]);
    const d0 = folder("d0", "D0", [d1]);
    const model = buildImportModel([folder("1", "Bar", [d0])], NONE);

    expect(model.folders.map((f) => f.key)).toEqual([
      "d0",
      "d1",
      "d2",
      "d3",
      "d4",
    ]);
    expect(model.mergedFolderIds).toEqual(["d5", "d6"]);
    const byUrl = Object.fromEntries(
      model.bookmarks.map((b) => [b.url, b.folderKey]),
    );
    expect(byUrl["https://four.com/"]).toBe("d4");
    expect(byUrl["https://five.com/"]).toBe("d4");
    expect(byUrl["https://six.com/"]).toBe("d4");
  });

  it("baseDepth shifts the flattening limit for in-collection destinations", () => {
    // Same chain as above, but importing INTO a top-level collection
    // (baseDepth 1): d4 now also lands beyond the limit and merges into d3.
    const d6 = folder("d6", "D6", [bm("b6", "https://six.com/")]);
    const d5 = folder("d5", "D5", [d6]);
    const d4 = folder("d4", "D4", [bm("b4", "https://four.com/"), d5]);
    const d3 = folder("d3", "D3", [d4]);
    const d2 = folder("d2", "D2", [d3]);
    const d1 = folder("d1", "D1", [d2]);
    const d0 = folder("d0", "D0", [d1]);
    const model = buildImportModel([folder("1", "Bar", [d0])], NONE, 1);

    expect(model.folders.map((f) => f.key)).toEqual(["d0", "d1", "d2", "d3"]);
    expect(model.mergedFolderIds).toEqual(["d4", "d5", "d6"]);
    const byUrl = Object.fromEntries(
      model.bookmarks.map((b) => [b.url, b.folderKey]),
    );
    expect(byUrl["https://four.com/"]).toBe("d3");
    expect(byUrl["https://six.com/"]).toBe("d3");
  });

  it("baseDepth at the limit flattens everything into the destination", () => {
    const roots = [
      folder("1", "Bar", [
        bm("100", "https://loose.com/"),
        folder("10", "Dev", [bm("101", "https://a.com/")]),
      ]),
    ];
    const model = buildImportModel(roots, NONE, 5);
    expect(model.folders).toEqual([]);
    // Loose and foldered bookmarks all fall through to the destination.
    expect(model.bookmarks.map((b) => b.folderKey)).toEqual([
      undefined,
      undefined,
    ]);
    // Both the root (for its loose bookmark) and the folder show as merged.
    expect(model.mergedFolderIds).toEqual(["1", "10"]);
    expect(model.importableCount).toBe(2);
  });

  it("baseDepth 0 leaves the root-import behavior unchanged", () => {
    const roots = [
      folder("1", "Bar", [
        bm("100", "https://loose.com/"),
        folder("10", "Dev", [bm("101", "https://a.com/")]),
      ]),
    ];
    expect(buildImportModel(roots, NONE, 0)).toEqual(
      buildImportModel(roots, NONE),
    );
  });

  it("emits bookmarks in depth-first tree order and skips empty roots", () => {
    const roots = [
      folder("1", "Bar", [
        folder("10", "A", [
          bm("100", "https://1.com/"),
          folder("11", "A1", [bm("110", "https://2.com/")]),
          bm("101", "https://3.com/"),
        ]),
      ]),
      folder("2", "Empty", []),
    ];
    const model = buildImportModel(roots, NONE);
    expect(model.bookmarks.map((b) => b.url)).toEqual([
      "https://1.com/",
      "https://2.com/",
      "https://3.com/",
    ]);
  });

  it("omits empty titles so the server derives a hostname fallback", () => {
    const roots = [folder("1", "Bar", [bm("100", "https://a.com/", "  ")])];
    const model = buildImportModel(roots, NONE);
    expect(model.bookmarks[0].title).toBeUndefined();
  });
});
