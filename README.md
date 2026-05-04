# Swipe to Close (for macOS)

A Chrome extension that closes a tab when you swipe back past the beginning of its history — replicating the behavior found in the Dia browser.

## How it works

When you open a page in a new tab (or navigate directly to a URL), the extension places a hidden sentinel at the start of the tab's history. If you swipe left with two fingers on a trackpad, press the back button, or use any other back gesture that would go past where you started, the tab closes automatically.

Normal back navigation within a tab (e.g. going back through pages you visited) is unaffected.

## What it does not work on

- `chrome://` pages (browser restriction — extensions cannot inject scripts there)
- Chrome Web Store pages (`https://chrome.google.com/webstore/...`)
- Any page opened by clicking a link in another tab (those tabs have prior history and the extension will not interfere)

## Known limitations

- If a page was opened with existing history (e.g. middle-click from a page that already had history), the extension does not activate. It only fires when `history.length === 1` at the time the page first loads.
- The extension does not track cross-page navigation within a session. If you navigate through several pages and use back to return to the first one, a final back swipe will close the tab as intended — but only if the tab was originally opened fresh.

## Installation

1. Clone or download this repository.
2. Open `chrome://extensions/` in Chrome.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `swipe-to-close/` folder.

## Build a distributable zip

```bash
cd swipe-to-close
zip -r ../swipe-to-close-v1.0.0.zip . -x "*.DS_Store" -x ".git/*"
```

## License

MIT
