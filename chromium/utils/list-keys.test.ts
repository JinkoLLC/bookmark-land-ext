import { describe, expect, it } from "vitest";
import { moveIndex } from "./list-keys";

describe("moveIndex", () => {
  it("moves and wraps with the arrow keys", () => {
    expect(moveIndex("ArrowDown", 0, 3)).toBe(1);
    expect(moveIndex("ArrowDown", 2, 3)).toBe(0);
    expect(moveIndex("ArrowUp", 1, 3)).toBe(0);
    expect(moveIndex("ArrowUp", 0, 3)).toBe(2);
  });

  it("starts from either end when nothing is highlighted", () => {
    expect(moveIndex("ArrowDown", -1, 3)).toBe(0);
    expect(moveIndex("ArrowUp", -1, 3)).toBe(2);
  });

  it("jumps with Home and End, and ignores other keys and empty lists", () => {
    expect(moveIndex("Home", 2, 3)).toBe(0);
    expect(moveIndex("End", 0, 3)).toBe(2);
    expect(moveIndex("Enter", 0, 3)).toBeNull();
    expect(moveIndex("ArrowDown", 0, 0)).toBeNull();
  });
});
