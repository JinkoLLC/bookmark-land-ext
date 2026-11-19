import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { api } from "@convex/api";
import { DestinationPicker } from "./import-destination";
import { OrganizeSection } from "./organize";

const feeds = [{ collectionId: "shown", pages: [{ pageId: "p", path: "/p/abc", visibility: "public" }] }];
const collection = (id: string, name: string) => ({ _id: id, name, order: 0 });

vi.mock("convex/react", () => ({
  useMutation: () => () => undefined,
  useQueries: () => ({ feeds }),
  useQuery: (reference: unknown) =>
    reference === api.userPages.collectionFeeds ? feeds
    : reference === api.bookmarks.get ? { collectionId: bookmarkCollection, isFavorite: false }
    : reference === api.collections.list ? [collection("shown", "Reading"), collection("private", "Notes")]
    : [],
}));
let bookmarkCollection = "shown";

describe("a collection that a live page shows", () => {
  it("is labeled in the popup, with what becomes public", () => {
    bookmarkCollection = "shown";
    const html = renderToStaticMarkup(<OrganizeSection bookmarkId={"b" as never} />);
    expect(html).toContain("· on a page");
    // The picker's name is read from its content: what is shown, then what it is.
    expect(html).toMatch(/aria-haspopup="listbox"[^>]*>.*Reading<\/span>.*· on a page<\/span><span class="sr-only">, collection</);
    expect(html).toContain("This bookmark appears on 1 live page: its title, site and link.");
  });

  it("leaves other collections alone", () => {
    bookmarkCollection = "private";
    const html = renderToStaticMarkup(<OrganizeSection bookmarkId={"b" as never} />);
    expect(html).not.toContain("on a page");
    expect(html).not.toContain("live page");
  });

  it("is labeled as a Browser import destination", () => {
    const html = renderToStaticMarkup(
      <DestinationPicker
        value={{ kind: "existing", id: "shown" }}
        onChange={() => undefined}
        importedName="Imported Nov 1, 2026, 3:42 PM"
        options={[{ id: "shown", name: "Reading", depth: 0 }, { id: "private", name: "Notes", depth: 0 }]}
        onPage={new Map([["shown", 1]])}
      />,
    );
    // The default destination shows the name it was given.
    expect(html).toContain("Imported Nov 1, 2026, 3:42 PM");
    expect(html).toContain("Reading · on a page");
    expect(html).not.toContain("Notes · on a page");
    expect(html).toContain("Bookmarks imported into this collection appear on 1 live page");
  });
});
