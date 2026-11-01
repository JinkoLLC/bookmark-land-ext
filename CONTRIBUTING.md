# Contributing

Thanks for helping out.

- **Bugs and ideas:** open an issue first, so we can agree on the approach before you write code.
- **Pull requests:** fork the repo, branch from `main`, and open a PR. Keep it focused on one change.
- **Review:** CodeRabbit reviews every PR automatically. A maintainer gives the final review and merges.

PRs from first-time contributors need a maintainer to approve the CI run before it starts.

## Development

You need Node.js 24 (the version is pinned in `.node-version`). Each extension is its own package, so run these from its directory:

```sh
cd chromium
npm ci
npm run lint       # ESLint
npm run compile    # TypeScript, no output
npm test           # Vitest
npm run build      # needs the variables in .env.example
```

CI runs all four. Run them before you push.

## What works without a backend

The bookmark.land backend is private. You can lint, type-check, test and build everything, and load the build unpacked. Signing in needs a Clerk instance and backend that allow the extension's ID, so a build pointed at placeholder values stays on the signed-out screen.

If your change needs checking signed in, say so in the PR and a maintainer will do it.

## Rules

- **Nothing private.** No deployment names, internal URLs, test accounts or secrets, even in tests, comments or commit messages. Everything built into an extension is public, so a real secret must never reach a build.
- **Backend functions.** `chromium/convex-api/` declares the backend functions the extension calls, by hand. Add only what the extension uses. The backend can't be type-checked from here, and installed copies keep calling old signatures, so treat these as a contract.
- **Words.** Use the terms in [GLOSSARY.md](GLOSSARY.md) in code, UI text and docs.
- **Capture-first.** Extensions never write to the browser's native bookmarks. See [docs/adr](docs/adr).
- **Permissions are public promises.** A new permission, host or kind of data sent anywhere needs its privacy disclosure updated too. Call it out in the PR.
- **No analytics SDK.** Do not add one to an extension.
- **No remote code.** No code loaded and run from a server, and no `eval`. Store policy requires both.
- **New browsers** get their own directory at the root, with their own package and CI matrix entry.
