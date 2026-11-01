import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as stub from "../stubs/web3-solana-wallet-buttons";

const uiDist = join(import.meta.dirname, "../node_modules/@clerk/ui/dist");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".js") ? [p] : [];
  });
}

/** Guards the wxt.config.ts alias against Clerk renaming the module or the
 * export: every `import("…/Web3SolanaWalletButtons.js").then(m => m.X)` in
 * the installed @clerk/ui must be satisfied by the stub. */
describe("Clerk Solana wallet stub", () => {
  const importers = walk(uiDist).filter((f) =>
    readFileSync(f, "utf8").includes("Web3SolanaWalletButtons.js"),
  );

  it("still has importers in @clerk/ui (otherwise drop the alias)", () => {
    expect(importers.length).toBeGreaterThan(0);
  });

  it("exports every name the importers read off the module", () => {
    const used = new Set<string>();
    for (const f of importers) {
      for (const m of readFileSync(f, "utf8").matchAll(
        /Web3SolanaWalletButtons\.js"\s*\)\s*\.then\(\s*\(?(\w+)\)?\s*=>[^)]*?\1\.(\w+)/g,
      )) {
        used.add(m[2]);
      }
    }
    expect(used.size).toBeGreaterThan(0);
    for (const name of used) expect(stub).toHaveProperty(name);
  });
});
