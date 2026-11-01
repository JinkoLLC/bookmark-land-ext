import { describe, expect, it } from "vitest";
import { normalizeCollectionNoteHtml } from "./collection-note-html";

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
