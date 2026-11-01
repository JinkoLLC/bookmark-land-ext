import { describe, expect, it } from "vitest";
import { SITES_PER_QUERY, siteBatches } from "./site-batches";

describe("siteBatches", () => {
  it("dedupes, drops empty domains and sorts", () => {
    expect(siteBatches(["b.com", "", "a.com", "b.com"])).toEqual([["a.com", "b.com"]]);
  });

  it("returns no batch for no Sites", () => {
    expect(siteBatches([])).toEqual([]);
    expect(siteBatches([""])).toEqual([]);
  });

  it("covers every Site past the per-query cap", () => {
    const domains = Array.from({ length: SITES_PER_QUERY * 2 + 1 }, (_, i) => `site${i}.com`);
    const batches = siteBatches(domains);
    expect(batches.map((b) => b.length)).toEqual([SITES_PER_QUERY, SITES_PER_QUERY, 1]);
    expect(new Set(batches.flat())).toEqual(new Set(domains));
  });
});
