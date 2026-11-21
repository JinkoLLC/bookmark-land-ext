import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import {
  NEW_SESSION,
  addressParts,
  clipboardLine,
  createRecordKey,
  deriveShortLinkView,
  findShortLink,
  limitReached,
  observeList,
  parseAddress,
  readCreateRecord,
  refusalFrom,
  refusedLocally,
  shortLinkMeter,
  shortLinkSession,
  unfinishedSentence,
  type ShortLinkList,
  type ShortLinkRow,
  type ShortLinkSession,
  type ShortLinkUsage,
  type ShortLinkView,
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

describe("addressParts", () => {
  it("cuts an address after its separators, and never between two slashes", () => {
    expect(addressParts("https://grid-notes.example/a_b/storage-pilots?ref=x&utm=y")).toEqual([
      "https://", "grid-", "notes.", "example/", "a_", "b/", "storage-", "pilots?", "ref=", "x&", "utm=", "y",
    ]);
    expect(addressParts("Opens https://bkmk.to/k7m2qx").join("")).toBe("Opens https://bkmk.to/k7m2qx");
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

describe("shortLinkMeter", () => {
  it("counts what is used and left of the month, and how full the bar is", () => {
    const meter = shortLinkMeter(PRO);
    expect(meter.usedLine).toBe("12 of 50 short links used this month");
    expect(meter.leftLine).toBe("38 left");
    expect(meter.fill).toBe(0.24);
    expect(meter.inUse).toBeNull();
    // Past the allowance, the bar is full and nothing is left.
    expect(shortLinkMeter({ ...PRO, created: 60 })).toMatchObject({ usedLine: "50 of 50 short links used this month", leftLine: "0 left", fill: 1 });
  });

  it("names the cap on short links held at once on plans that have one", () => {
    expect(shortLinkMeter(EDU).inUse).toBe("24 of 25 in use");
    // The server counts held up to one past the cap: the exact number isn't known.
    expect(shortLinkMeter({ ...EDU, held: 26 }).inUse).toBe("More than 25 in use");
  });
});

describe("limitReached", () => {
  it("is null while a short link can be created", () => {
    expect(limitReached(PRO)).toBeNull();
    expect(limitReached(EDU)).toBeNull();
  });

  it("says when the month is used up, with Upgrade on Free and Education only", () => {
    expect(limitReached({ ...PRO, created: 50 }, "en-US")).toEqual({
      sentences: ["You've used this month's 50 short links. You can make more on Dec 1."],
      upgrade: false,
      manage: false,
    });
    expect(limitReached({ ...EDU, created: 25 }, "en-US")?.upgrade).toBe(true);
  });

  it("says when the cap on short links held at once is reached, and puts the monthly sentence first when both are", () => {
    expect(limitReached({ ...EDU, held: 25 }, "en-US")).toEqual({
      sentences: ["You have 25 short links, and the Education plan holds up to 25 at a time. Delete one to make room."],
      upgrade: false,
      manage: true,
    });
    const both = limitReached({ ...EDU, tier: "free", held: 25, created: 25 }, "en-US")!;
    expect(both.sentences).toEqual([
      "You've used this month's 25 short links. You can make more on Dec 1.",
      // Deleting wouldn't help this month, so it isn't asked for as the next step.
      "After that you'd also need to delete one: the Free plan holds up to 25 at a time.",
    ]);
    expect(both).toMatchObject({ upgrade: true, manage: true });
  });

  it("asks for more than one deletion above the cap, where the exact count isn't known", () => {
    expect(limitReached({ ...EDU, held: 26 }, "en-US")?.sentences).toEqual([
      "The Education plan holds up to 25 short links at a time, and you have more than 25. Delete some to get to 24 or fewer.",
    ]);
    const both = limitReached({ ...EDU, tier: "free", held: 26, created: 25 }, "en-US")!;
    expect(both.sentences[1]).toBe("After that you'd also need to delete some: you have more than the 25 the Free plan holds.");
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
    // "2:02 PM" never splits across two lines.
    expect(unfinishedSentence(at, at, "en-US")).toContain("at 2:02\u00a0PM and the popup closed");
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

const NEW = "https://bkmk.to/n3w";
const complete = (...links: ShortLinkRow[]): ShortLinkList => ({ links, truncated: false });
/** Only the newest 1,000: what isn't in it may still exist. */
const cutOff = (...links: ShortLinkRow[]): ShortLinkList => ({ links, truncated: true });
const FAILED = new Error("Server Error");

describe("deriveShortLinkView, one state at a time", () => {
  const base = { address: PAGE, usage: PRO, list: complete(), accountId: "user_alex", bookmarkId: null };
  /** The view for these answers, in a session whose record was read (none) unless `session` says otherwise. */
  const view = (over: Partial<typeof base> | object = {}, session: Partial<ShortLinkSession> = {}) => {
    const input = { ...base, ...over };
    return deriveShortLinkView({ ...input, session: observeList({ ...NEW_SESSION, record: null, ...session }, input.list, PAGE) });
  };
  const create = { kind: "create", wait: null, truncated: false, saved: false, failed: false, deleted: false, unresolved: false };

  it("offers Create for a page without a short link", () => {
    expect(view()).toEqual(create);
    expect(view({ bookmarkId: "bm1" })).toEqual({ ...create, saved: true });
    expect(view({ list: cutOff() })).toEqual({ ...create, truncated: true });
  });

  it("waits for the allowance, the list, the record and Quick save's answer", () => {
    expect(view({ usage: undefined })).toMatchObject({ kind: "create", wait: "allowance" });
    expect(view({ list: undefined })).toMatchObject({ kind: "create", wait: "allowance" });
    expect(view({}, { record: undefined })).toMatchObject({ kind: "create", wait: "allowance" });
    expect(view({ bookmarkId: undefined })).toMatchObject({ kind: "create", wait: "page" });
  });

  it("reports a failed load", () => {
    expect(view({ list: FAILED })).toEqual({ kind: "failed" });
    expect(view({ usage: FAILED })).toEqual({ kind: "failed" });
  });

  it("offers no Create without the account id: it waits for it, and fails when the worker can't say", () => {
    // The record can't be read before the id is known.
    expect(view({ accountId: undefined }, { record: undefined })).toMatchObject({ kind: "create", wait: "allowance" });
    expect(view({ accountId: null }, { record: undefined })).toEqual({ kind: "failed" });
  });

  it("closes the view when short links aren't open to the account, even mid-creation", () => {
    const usage = { ...PRO, available: false };
    expect(view({ usage })).toEqual({ kind: "unavailable" });
    expect(view({ usage }, { creation: { status: "creating", slow: false } })).toEqual({ kind: "unavailable" });
  });

  it("never sends an address the server always refuses", () => {
    expect(deriveShortLinkView({ ...base, address: "http://localhost:3000/", usage: undefined, list: undefined, session: NEW_SESSION })).toEqual({
      kind: "refused",
      sentence: "This address can't be shortened.",
      local: true,
    });
    // Refused for another reason (a short link of ours): nothing about needing a public address.
    expect(deriveShortLinkView({ ...base, address: "https://bkmk.to/k7m2qx", usage: undefined, list: undefined, session: NEW_SESSION })).toMatchObject({
      kind: "refused",
      local: false,
    });
  });

  it("shows the page's short link with its state, whatever else is loading or failed", () => {
    expect(view({ list: complete(link()) })).toEqual({ kind: "link", shortUrl: "https://bkmk.to/k7m2qx", targetUrl: PAGE, state: "active", outcome: "existing", copied: null });
    expect(view({ list: complete(link({ userPaused: true })) })).toMatchObject({ state: "paused" });
    expect(view({ list: complete(link({ lapsePaused: true })) })).toMatchObject({ state: "paused" });
    expect(view({ list: complete(link({ status: "blocked", userPaused: true })) })).toMatchObject({ state: "blocked" });
    expect(view({ list: complete(link()), usage: FAILED })).toMatchObject({ kind: "link" });
    expect(view({ list: complete(link()), usage: { ...PRO, created: 50 } })).toMatchObject({ kind: "link" });
  });

  it("follows a created short link's row once a list has it, and waits for it until then", () => {
    const creation = { status: "created", shortUrl: NEW, copied: true } as const;
    const withRow = (...rows: ShortLinkRow[]) => view({ list: complete(...rows) }, { creation });
    expect(withRow()).toEqual({ kind: "link", shortUrl: NEW, targetUrl: PAGE, state: "active", outcome: "created", copied: true });
    // Another short link for the same address isn't the created one.
    expect(withRow(link())).toMatchObject({ shortUrl: NEW, state: "active", outcome: "created" });
    expect(withRow(link({ shortUrl: NEW, userPaused: true }))).toMatchObject({ state: "paused", outcome: "created" });
    expect(withRow(link({ shortUrl: NEW, status: "blocked" }))).toMatchObject({ state: "blocked" });
    expect(withRow(link({ shortUrl: NEW, targetUrl: "https://gridnotes.example/moved" }))).toMatchObject({
      state: "active",
      targetUrl: "https://gridnotes.example/moved",
    });
  });

  it("stops at a reached limit", () => {
    expect(view({ usage: { ...PRO, created: 50 } })).toEqual({ kind: "limit", deleted: false });
    expect(view({ usage: { ...EDU, held: 25 } })).toEqual({ kind: "limit", deleted: false });
  });
});

describe("observeList", () => {
  it("changes nothing for a list that is loading or failed, or one it has already seen", () => {
    const session = observeList(NEW_SESSION, complete(link()), PAGE);
    expect(observeList(session, undefined, PAGE)).toBe(session);
    expect(observeList(session, FAILED, PAGE)).toBe(session);
    expect(observeList(session, complete(link()), PAGE)).toBe(session);
    // The same deletion, read twice.
    const gone = observeList(session, complete(), PAGE);
    expect(observeList(gone, complete(), PAGE)).toBe(gone);
  });
});

// ---- the view over time ----------------------------------------------------------

/** What happens between two looks at the view: an answer from the server, or something the user does. */
type Act = Partial<{ list: ShortLinkList | Error | undefined; usage: ShortLinkUsage }> | ((session: ShortLinkSession) => ShortLinkSession);
/** [what happens, the act, the view after it, the clipboard line after it (none unless given)] */
type Step = [string, Act, Partial<ShortLinkView>, string?];

const { recordRead, startOver, creating, created, failed, copySettled, copied } = shortLinkSession;
const opened = (at: number | null) => (session: ShortLinkSession) => recordRead(session, at);
const fail = (session: ShortLinkSession) => failed(session, null);
const copy = (what: "link" | "tracked-image" | "image", url: string) => (session: ShortLinkSession) => copied(session, { what, url });
const K7 = "https://bkmk.to/k7m2qx";
const LINK_LINE = "Short link copied.";
const IMAGE_LINE = "QR image copied.";
const newRow = link({ shortUrl: NEW });
const usedUp = { ...PRO, created: 50 };

const WALKS: Record<string, Step[]> = {
  "create and copy, then deleted elsewhere: no later read brings it back": [
    ["the view opens", opened(null), { kind: "create", wait: "allowance" }],
    ["the list answers", { list: complete() }, { kind: "create", wait: null, deleted: false, unresolved: false }],
    ["Create", creating, { kind: "create", wait: "creating" }],
    ["eight seconds on", (session) => creating(session, true), { kind: "create", wait: "creating-slow" }],
    ["the server answers", (session) => created(session, NEW), { kind: "link", shortUrl: NEW, state: "active", outcome: "created", copied: null }],
    ["the clipboard takes it", (session) => copySettled(session, NEW, true), { kind: "link", copied: true }, LINK_LINE],
    ["the list has its row", { list: complete(newRow) }, { kind: "link", shortUrl: NEW, outcome: "created" }, LINK_LINE],
    ["Copy image", copy("tracked-image", NEW), { kind: "link", shortUrl: NEW }, IMAGE_LINE],
    ["a list cut off, without it", { list: cutOff() }, { kind: "link", shortUrl: NEW, state: "active" }, IMAGE_LINE],
    ["the list fails", { list: FAILED }, { kind: "link", shortUrl: NEW, state: "active" }, IMAGE_LINE],
    ["the list loads again", { list: undefined }, { kind: "link", shortUrl: NEW, state: "active" }, IMAGE_LINE],
    ["a complete list without it: deleted", { list: complete() }, { kind: "create", wait: null, deleted: true }],
    ["a stale cut-off list still has it", { list: cutOff(newRow) }, { kind: "create", deleted: true, truncated: true }],
    ["the list fails", { list: FAILED }, { kind: "failed" }],
    ["a stale complete list still has it", { list: complete(newRow) }, { kind: "create", deleted: true }],
    ["Create again", creating, { kind: "create", wait: "creating", deleted: false }],
    ["it fails", fail, { kind: "create", wait: null, failed: true, deleted: false, unresolved: false }],
  ],
  "a deleted short link and a second one for the page: the second is shown as itself": [
    ["the view opens on an empty list", opened(null), { kind: "create", wait: "allowance" }],
    ["the list answers", { list: complete() }, { kind: "create", wait: null }],
    ["Create", creating, { kind: "create", wait: "creating" }],
    ["created", (session) => created(session, NEW), { kind: "link", shortUrl: NEW, outcome: "created" }],
    ["copied", (session) => copySettled(session, NEW, true), { kind: "link", shortUrl: NEW }, LINK_LINE],
    ["its row arrives", { list: complete(newRow) }, { kind: "link", shortUrl: NEW, outcome: "created" }, LINK_LINE],
    // The clipboard still holds the deleted one's address: no line beside another short link.
    ["deleted, and another made elsewhere", { list: complete(link()) }, { kind: "link", shortUrl: K7, outcome: "existing", copied: null }],
    ["a stale cut-off list has only the deleted one", { list: cutOff(newRow) }, { kind: "link", shortUrl: K7, outcome: "existing" }],
    ["the other is paused", { list: complete(link({ userPaused: true })) }, { kind: "link", shortUrl: K7, state: "paused" }],
    ["the list fails", { list: FAILED }, { kind: "link", shortUrl: K7, state: "paused" }],
    ["the other is deleted too", { list: complete() }, { kind: "create", deleted: true }],
    ["both come back in a stale list", { list: cutOff(link(), newRow) }, { kind: "create", deleted: true }],
  ],
  "an existing short link: copied, paused, cut off, resumed, pointed elsewhere": [
    ["the view opens", opened(null), { kind: "create", wait: "allowance" }],
    ["the list has one for the page", { list: complete(link()) }, { kind: "link", shortUrl: K7, state: "active", outcome: "existing" }],
    ["Copy", copy("link", K7), { kind: "link", state: "active" }, LINK_LINE],
    // A paused one has no Copy, and nothing is said about the clipboard.
    ["paused elsewhere", { list: complete(link({ userPaused: true })) }, { kind: "link", state: "paused" }],
    ["a list cut off, without it", { list: cutOff() }, { kind: "link", state: "paused" }],
    ["the list fails", { list: FAILED }, { kind: "link", state: "paused" }],
    ["blocked", { list: cutOff(link({ status: "blocked" })) }, { kind: "link", state: "blocked" }],
    // The clipboard was never written in between.
    ["resumed", { list: complete(link()) }, { kind: "link", state: "active" }, LINK_LINE],
    ["the plain QR image is copied in the QR code view", copy("image", PAGE), { kind: "link", state: "active" }],
    // Not this page's any more, and not deleted.
    ["pointed at another page", { list: complete(link({ targetUrl: "https://gridnotes.example/moved" })) }, { kind: "create", deleted: false }],
  ],
  "two short links for the page: the hidden one deleted, the shown one pointed elsewhere": [
    ["the view opens", opened(null), { kind: "create" }],
    ["the newest active one is shown", { list: complete(link({ shortUrl: "https://bkmk.to/new", userPaused: true }), link()) }, { kind: "link", shortUrl: K7, state: "active" }],
    ["the paused one is deleted", { list: complete(link()) }, { kind: "link", shortUrl: K7 }],
    // What was shown wasn't deleted, so nothing says it was.
    ["the shown one is pointed elsewhere", { list: complete(link({ targetUrl: "https://gridnotes.example/moved" })) }, { kind: "create", deleted: false }],
    ["a stale cut-off list has the deleted one", { list: cutOff(link({ shortUrl: "https://bkmk.to/new", userPaused: true })) }, { kind: "create", deleted: false }],
  ],
  "an unfinished creation, a new one that fails twice, then one that works": [
    ["the view opens on a record", opened(5), { kind: "unfinished", at: 5, checking: true }],
    ["the list has no match", { list: complete() }, { kind: "unfinished", checking: false, limit: false }],
    // `limit`: the view shows the limit in place of "Create a new short link", through a Check again too.
    ["the month is used up", { usage: usedUp }, { kind: "unfinished", limit: true }],
    ["Check again: the list loads", { list: undefined }, { kind: "unfinished", checking: true, limit: true }],
    ["still no match", { list: complete() }, { kind: "unfinished", checking: false, limit: true }],
    ["a new month, at the cap on short links held", { usage: { ...EDU, held: 25 } }, { kind: "unfinished", limit: true }],
    ["one is deleted: creating is offered again", { usage: PRO }, { kind: "unfinished", checking: false, limit: false }],
    ["Create a new short link", startOver, { kind: "create", wait: null, unresolved: true, failed: false }],
    ["Create", creating, { kind: "create", wait: "creating", unresolved: true }],
    ["it fails", fail, { kind: "create", wait: null, failed: true, unresolved: true }],
    ["the list fails", { list: FAILED }, { kind: "failed" }],
    ["Retry: the list loads", { list: undefined }, { kind: "create", wait: "allowance", unresolved: true }],
    ["the list is back, cut off", { list: cutOff() }, { kind: "create", wait: null, failed: true, unresolved: true, truncated: true }],
    ["Create", creating, { kind: "create", wait: "creating", unresolved: true }],
    ["it fails again", fail, { kind: "create", failed: true, unresolved: true }],
    ["Create", creating, { kind: "create", wait: "creating", unresolved: true }],
    ["created", (session) => created(session, NEW), { kind: "link", shortUrl: NEW, outcome: "created" }],
    ["the clipboard refuses", (session) => copySettled(session, NEW, false), { kind: "link", copied: false }],
    ["Copy", copy("link", NEW), { kind: "link", copied: false }, LINK_LINE],
    ["its row arrives", { list: complete(newRow) }, { kind: "link", shortUrl: NEW }, LINK_LINE],
    // The page had a confirmed short link since: the earlier attempt's warning doesn't return.
    ["deleted elsewhere", { list: complete() }, { kind: "create", deleted: true, unresolved: false }],
  ],
  "an unfinished creation, a new one started, and the first turns up": [
    ["the view opens on a record", opened(5), { kind: "unfinished", checking: true }],
    ["the list has no match", { list: complete() }, { kind: "unfinished", checking: false }],
    ["Create a new short link", startOver, { kind: "create", unresolved: true }],
    ["the month is used up", { usage: usedUp }, { kind: "limit" }],
    ["a new month", { usage: PRO }, { kind: "create", unresolved: true }],
    ["the first attempt's short link shows up", { list: complete(link()) }, { kind: "link", shortUrl: K7, outcome: "existing" }],
    ["and is deleted", { list: complete() }, { kind: "create", deleted: true, unresolved: false }],
  ],
  "an unfinished creation whose short link shows up in a cut-off list": [
    ["the view opens on a record", opened(5), { kind: "unfinished", checking: true }],
    ["a match", { list: cutOff(link({ userPaused: true })) }, { kind: "link", shortUrl: K7, state: "paused" }],
    ["a cut-off list without it", { list: cutOff() }, { kind: "link", shortUrl: K7, state: "paused" }],
    // The record was answered: no "unfinished" again.
    ["deleted", { list: complete() }, { kind: "create", deleted: true, unresolved: false }],
  ],
  "the server refuses the address": [
    ["the view opens", opened(null), { kind: "create" }],
    ["the list answers", { list: complete() }, { kind: "create", wait: null }],
    ["Create", creating, { kind: "create", wait: "creating" }],
    ["refused", (session) => failed(session, "No."), { kind: "refused", sentence: "No." }],
    ["a later list changes nothing", { list: cutOff() }, { kind: "refused", sentence: "No." }],
  ],
};

describe("deriveShortLinkView, over time", () => {
  it.each(Object.entries(WALKS))("%s", (_name, steps) => {
    let session = NEW_SESSION;
    let answers: { list: ShortLinkList | Error | undefined; usage: ShortLinkUsage } = { list: undefined, usage: PRO };
    for (const [what, act, expected, line] of steps) {
      if (typeof act === "function") session = act(session);
      else answers = { ...answers, ...act };
      // As the popup's root does on every render.
      session = observeList(session, answers.list, PAGE);
      const view = deriveShortLinkView({ address: PAGE, ...answers, accountId: "user_alex", bookmarkId: null, session });
      expect(view, what).toMatchObject(expected);
      expect(clipboardLine(view, session.copied), what).toBe(line);
    }
  });
});
