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

Maintainers also run a browser test suite against a development backend before each release. If your change needs checking signed in, say so in the PR.

## Rules

Read [AGENTS.md](AGENTS.md): it lists the project's rules for people and coding agents alike. In short:

- Nothing private: no deployment names, internal URLs, test accounts or secrets.
- Use the words in [GLOSSARY.md](GLOSSARY.md).
- A new permission or host, or a new kind of data sent anywhere, needs its privacy disclosure updated too. Call it out in the PR.
