import { describe, expect, it } from "vitest";
import {
  clampTreeHeight,
  menuPosition,
  parseStoredHeight,
  MENU_HEIGHT,
  MENU_WIDTH,
  MIN_LIST_HEIGHT,
  MIN_TREE_HEIGHT,
} from "./panel-layout";

describe("clampTreeHeight", () => {
  it("passes through heights within the allowed range", () => {
    expect(clampTreeHeight(200, 180, 400)).toBe(200);
  });

  it("never goes below the tree minimum", () => {
    expect(clampTreeHeight(10, 180, 400)).toBe(MIN_TREE_HEIGHT);
    expect(clampTreeHeight(-50, 180, 400)).toBe(MIN_TREE_HEIGHT);
  });

  it("keeps the bookmark list at its minimum height", () => {
    // 180 + 400 available → tree can grow to 460, leaving 120 for the list.
    expect(clampTreeHeight(9999, 180, 400)).toBe(180 + 400 - MIN_LIST_HEIGHT);
  });

  it("prefers the tree minimum when the panel is too small for both", () => {
    expect(clampTreeHeight(150, 60, 100)).toBe(MIN_TREE_HEIGHT);
  });
});

describe("parseStoredHeight", () => {
  it("returns null for missing or invalid values", () => {
    expect(parseStoredHeight(null)).toBeNull();
    expect(parseStoredHeight("")).toBeNull();
    expect(parseStoredHeight("abc")).toBeNull();
    expect(parseStoredHeight("-20")).toBeNull();
    expect(parseStoredHeight("0")).toBeNull();
    expect(parseStoredHeight("NaN")).toBeNull();
    expect(parseStoredHeight("Infinity")).toBeNull();
  });

  it("parses and rounds stored pixel values", () => {
    expect(parseStoredHeight("240")).toBe(240);
    expect(parseStoredHeight("240.6")).toBe(241);
  });
});

describe("menuPosition", () => {
  it("opens at the click point when there is room", () => {
    expect(menuPosition(40, 60, 400, 600)).toEqual({ left: 40, top: 60 });
  });

  it("pins to the right and bottom edges", () => {
    expect(menuPosition(390, 590, 400, 600)).toEqual({
      left: 400 - MENU_WIDTH,
      top: 600 - MENU_HEIGHT,
    });
  });

  it("never goes negative in a viewport smaller than the menu", () => {
    expect(menuPosition(5, 5, 100, 30)).toEqual({ left: 0, top: 0 });
  });
});
