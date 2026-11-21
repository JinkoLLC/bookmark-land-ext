import { describe, expect, it } from "vitest";
import { isComposing } from "./composing";

describe("isComposing", () => {
  it("is true for a key an input method takes, however the browser reports it", () => {
    expect(isComposing({ isComposing: true, keyCode: 13 })).toBe(true);
    expect(isComposing({ isComposing: false, keyCode: 229 })).toBe(true);
  });

  it("is false for an ordinary Enter, arrow or Escape", () => {
    for (const keyCode of [13, 27, 38, 40]) expect(isComposing({ isComposing: false, keyCode })).toBe(false);
  });
});
