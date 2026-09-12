# Swipe to Close (for macOS)

Close a newly opened Chrome tab with a two-finger **back swipe**, without clicking the page first. Open a link with ⌘-click, a middle click, the context menu, `target="_blank"`, or `window.open()`, then swipe back when you are done reading.

## How it works

The extension remembers the starting history entry of each new tab. At that entry, it recognizes a backward horizontal trackpad gesture and closes that tab. If you navigate to another page or site, Chrome's normal back navigation takes you through the existing history. Once you return to the starting entry, another back swipe closes the tab.

Version 1.1 does **not** add history entries or replace the page's `history.state`. It keeps its bookkeeping in extension session storage, independently of the page and its opener. The browser's Back button and keyboard shortcuts retain their normal behavior; they do not trigger the extension's close action.

To reduce accidental closes, vertical scrolling, pinch zoom, modifier-key scrolling, gestures inside horizontal scroll areas, and reversals before recognition are excluded. The recognizer can complete when a swipe starts decelerating, so it does not wait for the full momentum tail. After a close or tab switch, continuing momentum is ignored.

## Requirements and limitations

- macOS with a trackpad; use the same direction as Chrome's normal back gesture. The implementation recognizes negative horizontal pixel deltas, verified with the test machine's back swipe.
- Chrome 106 or later is required by the APIs. Automated integration checks were run on Chrome 152; minimum-version support has not been separately tested.
- Only ordinary HTTP/HTTPS pages are supported. `chrome://` pages, Chrome Web Store pages, built-in viewers, local files, and pages without content-script access are not supported.
- Gestures over embedded frames (`iframe`) are not handled. Move the pointer over the main page.
- A horizontal scroll area keeps its gesture even when already at its edge. Range sliders, canvases, and videos are also excluded.
- Wheel events do not identify fingers or expose macOS's native swipe-completion event. Some pixel-based horizontal mouse input can look like a trackpad swipe. Reversal cancels only before the extension commits the close; a completed close cannot be cancelled by reversing afterward.
- Tabs already open when the extension is installed/reloaded, and restored or prerendered tabs whose starting entry cannot be established, are left alone. Open a fresh link to use the extension after reloading it.
- A brief guard after closing a tab prevents the same momentum from closing the next tab. Allow the current gesture to finish before closing another tab.

## Installation or update

1. Download/extract this repository or the release ZIP.
2. Open `chrome://extensions/` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the extension folder. For an existing unpacked installation, click its **Reload** button after updating the files.
5. Open a **new** tab from a link and test a back swipe without clicking inside that page.

## Development and tests

The extension itself has no runtime dependencies and requires no build step. Node.js 20 or later is used for tests and packaging.

```bash
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

The browser harness uses the DevTools extension-loading API in a disposable profile. To test the installed macOS Chrome instead:

```bash
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:browser
```

For physical trackpad checks with the real extension in a separate visible Chrome profile:

```bash
node tools/manual-check.cjs
```

The initial diagnostic prototype is available with `npm run probe`. Diagnostic pages and logs are local and are not included in the distributable extension. See [the verification record](docs/verification.md) for test coverage and manual results.

## Build a distributable ZIP

```bash
npm run package
```

This creates `dist/swipe-to-close-v1.1.0.zip` from an explicit list of runtime files and icons. Test tools, logs, dependencies, and Git metadata are excluded. The packaging script requires the `zip` command, included with macOS.

## License

MIT
