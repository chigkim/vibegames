# vibegames

## Testing Environment Setup

The games are tested with [Playwright](https://playwright.dev) in headless Chromium. Test files live in `tests/` and the config is `playwright.config.js`.

### Requirements

- Node.js 18 or newer (`node --version`)
- npm (comes with Node)
- About 550 MB of free disk space for the browsers

### 1. Install dependencies

From the repo root:

```sh
npm install
```

This installs `@playwright/test` into `node_modules/`, which is git-ignored.

### 2. Install the browsers

```sh
npx playwright install chromium
```

This downloads two browsers into the Playwright cache (`~/Library/Caches/ms-playwright` on macOS, `~/.cache/ms-playwright` on Linux):

| Browser | Folder | Used for |
|---------|--------|----------|
| Chrome for Testing | `chromium-<rev>` | `--headed` runs |
| Chrome Headless Shell | `chromium_headless_shell-<rev>` | default headless runs |

If it finishes, go to step 3. If it freezes, see [Troubleshooting](#troubleshooting-browser-install-freezes).

### 3. Run the tests

```sh
npx playwright test                    # all tests, headless
npx playwright test tests/rise.spec.js # one file
npx playwright test --headed           # show the browser
npx playwright show-report             # open the last HTML report, if one was made
```

You don't need to start a server first. The config starts `npx serve . -l 8788` on its own, or reuses one already running on port 8788.

A good run looks like this:

```
Running 10 tests using 1 worker
  ✓   1 [chromium] › tests/rise.spec.js:21:1 › page loads without JS errors
  ...
  10 passed
```

### Troubleshooting: browser install freezes

**Symptom:** `npx playwright install` downloads to 100% and then stops responding. The browser folder stays at about 448 KB and the `oopDownloadBrowserMain.js` process uses 0% CPU.

**Cause:** Playwright's built-in unzip step can hang on very new Node versions. This happened with Playwright 1.59.1 on Node 26.10. The download itself is fine.

**Fix:** download and unzip the browsers yourself.

1. Stop the stuck install and remove leftovers:

   ```sh
   pkill -f oopDownloadBrowserMain; pkill -f "playwright install"
   C=~/Library/Caches/ms-playwright
   rm -rf $C/__dirlock $C/chromium-* $C/chromium_headless_shell-* "$TMPDIR"/playwright-download-*
   ```

2. Get the exact folder names and download URLs for your Playwright version:

   ```sh
   npx playwright install --dry-run chromium
   ```

   For each browser, note the **Install location** and **Download url**. For Playwright 1.59.1 on Apple Silicon they are:

   | Install location | Download url |
   |------------------|--------------|
   | `chromium-1217` | `https://cdn.playwright.dev/builds/cft/147.0.7727.15/mac-arm64/chrome-mac-arm64.zip` |
   | `chromium_headless_shell-1217` | `https://cdn.playwright.dev/builds/cft/147.0.7727.15/mac-arm64/chrome-headless-shell-mac-arm64.zip` |

3. Download, check and unzip each one. Then create the two marker files Playwright looks for to know the install is finished:

   ```sh
   install_browser() {   # usage: install_browser <install-location> <download-url>
     curl -fL -o /tmp/pw-browser.zip "$2" &&
     unzip -tq /tmp/pw-browser.zip &&
     rm -rf "$1" && mkdir -p "$1" &&
     (cd "$1" && unzip -q /tmp/pw-browser.zip && touch INSTALLATION_COMPLETE DEPENDENCIES_VALIDATED) &&
     rm /tmp/pw-browser.zip
   }

   C=~/Library/Caches/ms-playwright
   install_browser $C/chromium-1217 \
     https://cdn.playwright.dev/builds/cft/147.0.7727.15/mac-arm64/chrome-mac-arm64.zip
   install_browser $C/chromium_headless_shell-1217 \
     https://cdn.playwright.dev/builds/cft/147.0.7727.15/mac-arm64/chrome-headless-shell-mac-arm64.zip
   ```

   Use the paths and URLs from step 2 if they differ from these.

4. Check the result:

   ```sh
   du -sh ~/Library/Caches/ms-playwright/*   # roughly 340 MB and 190 MB
   npx playwright test
   ```

If you upgrade Playwright, the revision number (for example `1217`) changes. Repeat these steps with the new values from `--dry-run`.

### Other common errors

| Error | Fix |
|-------|-----|
| `Cannot find module '@playwright/test'` | Run `npm install` (step 1). |
| `Executable doesn't exist at .../chromium_headless_shell-<rev>/...` | The headless shell is missing. Install it (step 2, or the manual fix above). |
| `Error: listen EADDRINUSE :::8788` | Something else is using port 8788. Stop it, or change the port in `playwright.config.js`. |
| `DeprecationWarning: module.register() is deprecated` | Harmless warning on new Node versions. You can ignore it. |
