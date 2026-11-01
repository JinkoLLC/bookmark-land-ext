# Agent instructions

The official browser extensions for bookmark.land. This repo is public and MIT-licensed.

## Rules

- **Nothing private.** Never add code, types, deployment names, internal URLs, test accounts or secrets from the private bookmark.land server repo, even in tests, comments or commit messages. Everything built into an extension is public, so a value being in a build doesn't make it a secret, and a real secret must never reach a build.
- **Backend functions.** `chromium/convex-api/` declares the backend functions the extension calls, by hand. Add only what the extension uses. The backend can't be type-checked from here, and installed copies keep calling old signatures, so treat these as a contract.
- **Use the glossary.** Use the terms in `GLOSSARY.md` in code, UI text and docs.
- **Capture-first.** Extensions never write to the browser's native bookmarks. See `docs/adr/`.
- **Permissions are public promises.** A new permission, host or kind of data sent anywhere needs its privacy disclosure updated too. Call it out in the PR.
- **No remote code.** No content loaded and run from a server, no `eval`, no analytics SDK. Store policy requires the first two.

## Layout

- `chromium/`: the Manifest V3 extension for Chromium browsers. New browsers get their own directory at the root, with their own package and CI matrix entry.
- `chromium/entrypoints/`: background worker, popup, side panel, import page.
- `chromium/components/`, `chromium/utils/`, `chromium/hooks/`: UI and logic. Tests sit next to the code.
- `chromium/shared/`: helpers kept in step with the backend by hand, such as URL normalization.
- `chromium/scripts/store-package.mjs`: the release package and its checks.

## Before opening a PR

From the package's directory, run all of these and make sure they pass: `npm run lint`, `npm run compile`, `npm test`, `npm run build`.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues on JinkoLLC/bookmark-land-ext (`gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
