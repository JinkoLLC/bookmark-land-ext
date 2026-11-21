import { describe, expect, it } from "vitest";
import { menuKeyIndex, treeKeyAction, type TreeKeyItem } from "./tree-keys";

const row = (depth: number, hasChildren = false, isExpanded = false): TreeKeyItem => ({
  depth,
  hasChildren,
  isExpanded,
});

// 0 All bookmarks · 1 Research (open) · 2 Climate (open) · 3 Grid storage
// · 4 Typography (closed, has children) · 5 Engineering
const ITEMS = [row(0), row(0, true, true), row(1, true, true), row(2), row(1, true), row(0)];
const key = (name: string, index: number, shift = false) => treeKeyAction(name, shift, ITEMS, index);

describe("treeKeyAction", () => {
  it("moves up and down and stops at the ends", () => {
    expect(key("ArrowDown", 0)).toEqual({ type: "focus", index: 1 });
    expect(key("ArrowUp", 3)).toEqual({ type: "focus", index: 2 });
    expect(key("ArrowUp", 0)).toBeNull();
    expect(key("ArrowDown", 5)).toBeNull();
  });

  it("jumps to the first and last row", () => {
    expect(key("Home", 4)).toEqual({ type: "focus", index: 0 });
    expect(key("End", 1)).toEqual({ type: "focus", index: 5 });
  });

  it("Right opens a closed row, then moves to its first child", () => {
    expect(key("ArrowRight", 4)).toEqual({ type: "toggle", index: 4, isExpanded: true });
    expect(key("ArrowRight", 1)).toEqual({ type: "focus", index: 2 });
    expect(key("ArrowRight", 3)).toBeNull();
  });

  it("Left closes an open row, otherwise moves to the parent", () => {
    expect(key("ArrowLeft", 2)).toEqual({ type: "toggle", index: 2, isExpanded: false });
    expect(key("ArrowLeft", 3)).toEqual({ type: "focus", index: 2 });
    expect(key("ArrowLeft", 4)).toEqual({ type: "focus", index: 1 });
    expect(key("ArrowLeft", 5)).toBeNull();
  });

  it("Enter and Space open the collection", () => {
    expect(key("Enter", 3)).toEqual({ type: "select", index: 3 });
    expect(key(" ", 0)).toEqual({ type: "select", index: 0 });
  });

  it("the Menu key and Shift+F10 open the row menu; plain F10 does not", () => {
    expect(key("ContextMenu", 2)).toEqual({ type: "menu", index: 2 });
    expect(key("F10", 2, true)).toEqual({ type: "menu", index: 2 });
    expect(key("F10", 2)).toBeNull();
  });

  it("ignores other keys and a row that is not there", () => {
    expect(key("a", 1)).toBeNull();
    expect(key("ArrowDown", 9)).toBeNull();
  });
});

describe("menuKeyIndex", () => {
  it("wraps with the arrows and jumps with Home and End", () => {
    expect(menuKeyIndex("ArrowDown", 1, 2)).toBe(0);
    expect(menuKeyIndex("ArrowUp", 0, 2)).toBe(1);
    expect(menuKeyIndex("Home", 1, 2)).toBe(0);
    expect(menuKeyIndex("End", 0, 2)).toBe(1);
    expect(menuKeyIndex("Enter", 0, 2)).toBeNull();
  });
});
