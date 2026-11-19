import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import {
  allowanceLine,
  createRecordKey,
  deriveShortLinkView,
  findShortLink,
  limitReached,
  parseAddress,
  readCreateRecord,
  refusalFrom,
  refusedLocally,
  unfinishedSentence,
  type ShortLinkRow,
  type ShortLinkUsage,
} from "./short-link";

const PAGE = "https://gridnotes.example/pilots?ref=newsletter";
const link = (over: Partial<ShortLinkRow> = {}): ShortLinkRow => ({
  shortUrl: "https://bkmk.to/k7m2qx",
  targetUrl: PAGE,
  status: "active",
  userPaused: false,
  ...over,
});
const RESETS = new Date(2026, 11, 1).getTime();
const PRO: ShortLinkUsage = { tier: "pro", created: 12, monthly: 50, resetsAt: RESETS, available: true };
const EDU: ShortLinkUsage = { tier: "edu", created: 15, monthly: 25, liveCap: 25, held: 24, resetsAt: RESETS, available: true };

describe("parseAddress", () => {
  it("returns the address as the server stores it, for http and https only", () => {
    expect(parseAddress("https://Gridnotes.example")).toBe("https://gridnotes.example/");
    expect(parseAddress("http://gridnotes.example/a b?x=1#top")).toBe("http://gridnotes.example/a%20b?x=1#top");
    expect(parseAddress("chrome://extensions")).toBeNull();
    expect(parseAddress("not an address")).toBeNull();
    expect(parseAddress(undefined)).toBeNull();
  });
});

describe("refusedLocally", () => {
  it("refuses what the server's validation always refuses", () => {
    for (const address of [
      "https://alex:secret@gridnotes.example/",
      "https://alex@gridnotes.example/",
      "http://192.0.2.7/admin",
      "http://[2001:db8::1]/",
      "http://localhost:3000/",
      "https://bkmk.to/k7m2qx",
      "https://dev.bkmk.to/k7m2qx",
      `https://gridnotes.example/${"a".repeat(2048)}`,
    ]) {
      expect(refusedLocally(address), address).toBe(true);
    }
  });

  it("lets ordinary addresses through, up to 2,048 characters", () => {
    expect(refusedLocally(PAGE)).toBe(false);
    expect(refusedLocally("https://notbkmk.to/x")).toBe(false);
    expect(refusedLocally(`https://gridnotes.example/${"a".repeat(2048 - 26)}`)).toBe(false);
  });
});

describe("findShortLink", () => {
  it("matches the parsed address exactly: a query or fragment is another page", () => {
    const links = [link({ targetUrl: "https://gridnotes.example/pilots?ref=twitter" }), link({ targetUrl: "https://gridnotes.example/pilots" })];
    expect(findShortLink(links, PAGE)).toBeNull();
    expect(findShortLink(links, "https://gridnotes.example/pilots")).toBe(links[1]);
  });

  it("prefers the newest active match, then the newest match", () => {
    const paused = link({ shortUrl: "https://bkmk.to/new", userPaused: true });
    const active = link({ shortUrl: "https://bkmk.to/mid" });
    const older = link({ shortUrl: "https://bkmk.to/old" });
    expect(findShortLink([paused, active, older], PAGE)).toBe(active);
    const blocked = link({ shortUrl: "https://bkmk.to/blk", status: "blocked" });
    expect(findShortLink([paused, blocked], PAGE)).toBe(paused);
  });
});

describe("allowanceLine", () => {
  it("counts what is left of the month, naming the plan when asked", () => {
    expect(allowanceLine(PRO, true)).toBe("38 of 50 left this month · Pro plan");
    expect(allowanceLine(PRO)).toBe("38 of 50 left this month");
    expect(allowanceLine({ ...PRO, created: 60 })).toBe("0 of 50 left this month");
  });

  it("leads with the kept count on plans that cap it", () => {
    expect(allowanceLine(EDU, true)).toBe("24 of 25 kept at once · 10 new left this month");
    // On Free both limits are 25: each number says which one it is.
    expect(allowanceLine({ ...EDU, tier: "free", held: 25, created: 25 })).toBe("25 of 25 kept at once · 0 new left this month");
    // The server counts held up to one past the cap.
    expect(allowanceLine({ ...EDU, held: 26 })).toBe("25 of 25 kept at once · 10 new left this month");
  });
});

describe("limitReached", () => {
  it("is null while a short link can be created", () => {
    expect(limitReached(PRO)).toBeNull();
    expect(limitReached(EDU)).toBeNull();
  });

  it("says when the month is used up, with Upgrade on Free and Education only", () => {
    expect(limitReached({ ...PRO, created: 50 }, "en-US")).toEqual({
      sentences: ["You've made all 50 short links for this month. You can make more on Dec 1."],
      upgrade: false,
      manage: false,
    });
    expect(limitReached({ ...EDU, created: 25 }, "en-US")?.upgrade).toBe(true);
  });

  it("says when the kept-at-once cap is reached, and puts the monthly sentence first when both are", () => {
    expect(limitReached({ ...EDU, held: 25 }, "en-US")).toEqual({
      sentences: ["The Education plan keeps up to 25 short links at once. Delete one to make room."],
      upgrade: false,
      manage: true,
    });
    const both = limitReached({ ...EDU, tier: "free", held: 26, created: 25 }, "en-US")!;
    expect(both.sentences).toEqual([
      "You've made all 25 short links for this month. You can make more on Dec 1.",
      // Deleting wouldn't help this month, so it isn't asked for as the next step.
      "After that you'd also need to delete one: the Free plan keeps up to 25 at once.",
    ]);
    expect(both).toMatchObject({ upgrade: true, manage: true });
  });
});

describe("the unfinished-create record", () => {
  it("is keyed by account id and address, so it never applies to another account or page", () => {
    const key = createRecordKey("user_alex", PAGE);
    expect(key).not.toBe(createRecordKey("user_sam", PAGE));
    expect(key).not.toBe(createRecordKey("user_alex", `${PAGE}#top`));
  });

  it("reads back only a well-formed record", () => {
    expect(readCreateRecord({ at: 1763548920000 })).toBe(1763548920000);
    expect(readCreateRecord(undefined)).toBeNull();
    expect(readCreateRecord({ at: "14:02" })).toBeNull();
    expect(readCreateRecord("x")).toBeNull();
  });

  it("gives the time, and the date when the attempt wasn't today", () => {
    const at = new Date(2026, 10, 19, 14, 2).getTime();
    expect(unfinishedSentence(at, at + 60_000, "en-GB")).toBe(
      "You started a short link for this page at 14:02 and the popup closed before it finished. We couldn't confirm whether it was created.",
    );
    expect(unfinishedSentence(at, at + 86_400_000, "en-GB")).toContain("at 14:02 on 19 Nov and the popup closed");
  });
});

describe("refusalFrom", () => {
  it("returns the server's sentence, and null for any other failure", () => {
    expect(refusalFrom(new ConvexError("Use the final address, not one from another link shortener."))).toBe(
      "Use the final address, not one from another link shortener.",
    );
    expect(refusalFrom(new ConvexError({ kind: "RateLimited" }))).toBeNull();
    expect(refusalFrom(new Error("Server Error"))).toBeNull();
  });
});

describe("deriveShortLinkView", () => {
  const base = {
    address: PAGE,
    usage: PRO,
    list: { links: [] as ShortLinkRow[], truncated: false },
    accountId: "user_alex",
    bookmarkId: null,
    creation: null,
    record: null,
  };
  const create = { kind: "create", wait: null, truncated: false, saved: false, failed: false };

  it("offers Create for a page without a short link", () => {
    expect(deriveShortLinkView(base)).toEqual(create);
    expect(deriveShortLinkView({ ...base, bookmarkId: "bm1" })).toEqual({ ...create, saved: true });
    expect(deriveShortLinkView({ ...base, list: { links: [], truncated: true } })).toEqual({ ...create, truncated: true });
  });

  it("waits for the allowance, the list, the record and Quick save's answer", () => {
    expect(deriveShortLinkView({ ...base, usage: undefined })).toMatchObject({ kind: "create", wait: "allowance" });
    expect(deriveShortLinkView({ ...base, list: undefined })).toMatchObject({ kind: "create", wait: "allowance" });
    expect(deriveShortLinkView({ ...base, record: undefined })).toMatchObject({ kind: "create", wait: "allowance" });
    expect(deriveShortLinkView({ ...base, bookmarkId: undefined })).toMatchObject({ kind: "create", wait: "page" });
  });

  it("reports a failed load", () => {
    expect(deriveShortLinkView({ ...base, list: new Error("x") })).toEqual({ kind: "failed" });
    expect(deriveShortLinkView({ ...base, usage: new Error("x") })).toEqual({ kind: "failed" });
  });

  it("offers no Create without the account id: it waits for it, and fails when the worker can't say", () => {
    // The record can't be read before the id is known.
    expect(deriveShortLinkView({ ...base, accountId: undefined, record: undefined })).toMatchObject({ kind: "create", wait: "allowance" });
    expect(deriveShortLinkView({ ...base, accountId: null, record: undefined })).toEqual({ kind: "failed" });
  });

  it("closes the view when short links aren't open to the account, even mid-creation", () => {
    const usage = { ...PRO, available: false };
    expect(deriveShortLinkView({ ...base, usage })).toEqual({ kind: "unavailable" });
    expect(deriveShortLinkView({ ...base, usage, creation: { status: "creating", slow: false } })).toEqual({ kind: "unavailable" });
  });

  it("never sends an address the server always refuses", () => {
    expect(deriveShortLinkView({ ...base, address: "http://localhost:3000/", usage: undefined, list: undefined })).toEqual({
      kind: "refused",
      sentence: "This address can't be shortened.",
    });
  });

  it("shows the page's short link with its state", () => {
    const view = (row: ShortLinkRow) => deriveShortLinkView({ ...base, list: { links: [row], truncated: false } });
    expect(view(link())).toEqual({ kind: "link", shortUrl: "https://bkmk.to/k7m2qx", targetUrl: PAGE, state: "active", outcome: "existing", copied: false });
    expect(view(link({ userPaused: true }))).toMatchObject({ state: "paused" });
    expect(view(link({ lapsePaused: true }))).toMatchObject({ state: "paused" });
    expect(view(link({ status: "blocked", userPaused: true }))).toMatchObject({ state: "blocked" });
  });

  it("follows one creation from the click to its answer", () => {
    expect(deriveShortLinkView({ ...base, creation: { status: "creating", slow: false } })).toMatchObject({ kind: "create", wait: "creating" });
    expect(deriveShortLinkView({ ...base, creation: { status: "creating", slow: true } })).toMatchObject({ kind: "create", wait: "creating-slow" });
    const created = { status: "created", shortUrl: "https://bkmk.to/n3w", copied: true } as const;
    expect(deriveShortLinkView({ ...base, creation: created })).toEqual({
      kind: "link",
      shortUrl: "https://bkmk.to/n3w",
      targetUrl: PAGE,
      state: "active",
      outcome: "created",
      copied: true,
    });
    // The short link shows as created before the clipboard answers, and when it refuses.
    expect(deriveShortLinkView({ ...base, creation: { ...created, copied: null } })).toMatchObject({ outcome: "created", copied: false });
    expect(deriveShortLinkView({ ...base, creation: { ...created, copied: false } })).toMatchObject({ outcome: "created", copied: false });
    expect(deriveShortLinkView({ ...base, creation: { status: "refused", sentence: "No." } })).toEqual({ kind: "refused", sentence: "No." });
    expect(deriveShortLinkView({ ...base, creation: { status: "failed" } })).toEqual({ ...create, failed: true });
  });

  it("never offers a plain Create while an unfinished creation is on record", () => {
    const unfinished = { kind: "unfinished", at: 5, checking: false, limit: false, wait: null, failed: false };
    expect(deriveShortLinkView({ ...base, record: 5 })).toEqual(unfinished);
    expect(deriveShortLinkView({ ...base, record: 5, list: undefined })).toEqual({ ...unfinished, checking: true });
    // A match that arrives late replaces it.
    expect(deriveShortLinkView({ ...base, record: 5, list: { links: [link()], truncated: false } })).toMatchObject({ kind: "link", outcome: "existing" });
    // "Create and copy anyway" is a creation like any other.
    expect(deriveShortLinkView({ ...base, record: 5, creation: { status: "creating", slow: false } })).toMatchObject({ kind: "create", wait: "creating" });
  });

  it("keeps the first attempt unresolved when a second one fails", () => {
    const failed = { ...base, record: 5, creation: { status: "failed" } as const };
    // Never an ordinary Create saying nothing was used: the first attempt may have been.
    expect(deriveShortLinkView(failed)).toEqual({ kind: "unfinished", at: 5, checking: false, limit: false, wait: null, failed: true });
    expect(deriveShortLinkView({ ...failed, list: undefined })).toMatchObject({ kind: "unfinished", checking: true, failed: true });
    // Until the first outcome is known (a match appears) or a second attempt succeeds.
    expect(deriveShortLinkView({ ...failed, list: { links: [link()], truncated: false } })).toMatchObject({ kind: "link", outcome: "existing" });
    expect(deriveShortLinkView({ ...failed, creation: { status: "created", shortUrl: "https://bkmk.to/n3w", copied: null } })).toMatchObject({ kind: "link", outcome: "created" });
  });

  it("holds Create and copy anyway to the checks of an ordinary Create", () => {
    // No allowance left: no Create at all. Quick save still checking or saving: it waits.
    expect(deriveShortLinkView({ ...base, record: 5, usage: { ...PRO, created: 50 } })).toMatchObject({ kind: "unfinished", limit: true });
    expect(deriveShortLinkView({ ...base, record: 5, usage: { ...EDU, held: 25 } })).toMatchObject({ kind: "unfinished", limit: true });
    expect(deriveShortLinkView({ ...base, record: 5, bookmarkId: undefined })).toMatchObject({ kind: "unfinished", limit: false, wait: "page" });
  });

  it("stops at a reached limit, but still shows an existing short link", () => {
    const usage = { ...PRO, created: 50 };
    expect(deriveShortLinkView({ ...base, usage })).toEqual({ kind: "limit" });
    expect(deriveShortLinkView({ ...base, usage, list: { links: [link()], truncated: false } })).toMatchObject({ kind: "link" });
  });
});
