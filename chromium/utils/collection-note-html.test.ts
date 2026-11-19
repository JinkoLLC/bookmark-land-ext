import { describe, expect, it } from "vitest";
import { normalizeCollectionNoteHtml, safeNoteHref } from "./collection-note-html";

describe("normalizeCollectionNoteHtml", () => {
  it("treats empty serialized editor content as empty text", () => {
    expect(normalizeCollectionNoteHtml("")).toBe("");
    expect(normalizeCollectionNoteHtml("   ")).toBe("");
    expect(normalizeCollectionNoteHtml("<p></p>")).toBe("");
    expect(normalizeCollectionNoteHtml("<p><br></p>")).toBe("");
    expect(normalizeCollectionNoteHtml("<p><br/></p>")).toBe("");
    expect(normalizeCollectionNoteHtml("<p>&nbsp;</p>")).toBe("");
    expect(normalizeCollectionNoteHtml("<p>   </p>")).toBe("");
    expect(normalizeCollectionNoteHtml(" <p> <br /> &nbsp; </p> ")).toBe("");
  });

  it("preserves non-empty serialized editor content", () => {
    expect(normalizeCollectionNoteHtml("<p>Notes</p>")).toBe("<p>Notes</p>");
  });
});

describe("safeNoteHref", () => {
  it("keeps the schemes the editor accepts", () => {
    expect(safeNoteHref("https://example.com/a")).toBe("https://example.com/a");
    expect(safeNoteHref(" HTTP://example.com ")).toBe("HTTP://example.com");
    expect(safeNoteHref("mailto:someone@example.com")).toBe("mailto:someone@example.com");
  });

  it("rejects everything else", () => {
    expect(safeNoteHref(null)).toBeNull();
    expect(safeNoteHref("")).toBeNull();
    expect(safeNoteHref("javascript:alert(1)")).toBeNull();
    expect(safeNoteHref(" java\nscript:alert(1)")).toBeNull();
    expect(safeNoteHref("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeNoteHref("//example.com")).toBeNull();
    expect(safeNoteHref("/collections")).toBeNull();
  });
});
