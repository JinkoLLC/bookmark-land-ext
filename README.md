# bookmark.land browser extensions

The official browser extensions for [bookmark.land](https://bookmark.land), a bookmark manager with nested collections, tags, search and broken-link checks. Save the page you're reading with one click, and browse your library from the browser.

[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/bookmarkland/bogdilfnhofbdehjcbnchmjbbmlcgooc) · [What the extension does](https://bookmark.land/extension)

| Directory | Browsers | Status |
| --- | --- | --- |
| [`chromium/`](chromium/README.md) | Chrome, Edge, Brave and other Chromium browsers at version 114 or later | [On the Chrome Web Store](https://chromewebstore.google.com/detail/bookmarkland/bogdilfnhofbdehjcbnchmjbbmlcgooc) |

Each extension is its own package. New browsers get their own directory at the root.

## Privacy

The extension only talks to bookmark.land, its database at `convex.bookmark.land` and its sign-in provider at `clerk.bookmark.land`. The side panel also shows site icons, which the browser loads as ordinary images from the bookmarked site or Google's favicon service. It never writes to your browser's own bookmarks. The full disclosure is at [bookmark.land/extension/privacy](https://bookmark.land/extension/privacy).

## Try it from source

You need Node.js 24.

```sh
git clone https://github.com/JinkoLLC/bookmark-land-ext.git
cd bookmark-land-ext/chromium
cp .env.example .env
npm ci
npm run build
```

Then open `chrome://extensions`, turn on Developer mode, choose **Load unpacked** and select `chromium/.output/chrome-mv3/`. See [CONTRIBUTING.md](CONTRIBUTING.md) for what a build from source can do without a backend.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). To report a security issue, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). The license covers the code. The bookmark.land name and logo identify the official extension, so a fork that you publish needs its own.
