# ProxyScout — Development

Building, testing, releasing and store setup. For what the extension does, see the [README](../README.md).

- [Running from source](#running-from-source)
- [Tests](#tests)
- [Building the store packages](#building-the-store-packages)
- [How the tests work](#how-the-tests-work)
- [Sync internals](#sync-internals)
- [Configuring Google sign-in](#configuring-google-sign-in)
- [Release and automatic deployment](#release-and-automatic-deployment)
- [One-time store setup](#one-time-store-setup)
- [Project layout](#project-layout)

## Running from source

No build step for Chromium browsers: open `chrome://extensions` (Edge: `edge://extensions`), turn on
**Developer mode**, **Load unpacked** → the `extension` folder, then reload it after each change.

**Firefox (temporary):** run `npm run build`, open `about:debugging#/runtime/this-firefox` →
**Load Temporary Add-on…** → `dist/firefox/manifest.json`. Temporary add-ons are removed when Firefox
closes.

## Tests

```
npm test                 # unit tests (node --test)
node tests/e2e.mjs <puppeteer folder> [screenshot folder]
node tests/e2e-firefox.mjs <selenium-webdriver folder> [screenshot folder] [firefox.exe]
node tests/sync-e2e.mjs <puppeteer folder> [screenshot folder]
node tests/bench.mjs <puppeteer folder> [proxies per group]
```

## Building the store packages

These instructions are also for add-on reviewers.

- **Requirements:** any OS (Windows, macOS or Linux) with **Node.js 20 or newer** (tested with 22.14).
  No npm packages are needed: the build has no dependencies and no network access.
- **Command:** `node tools/build-zip.mjs` (same as `npm run build`).
- **Output:**

  | File | Store |
  | --- | --- |
  | `dist/proxyscout-<version>.zip` | Chrome Web Store, Edge Add-ons |
  | `dist/proxyscout-firefox-<version>.zip` | Firefox Add-ons (`dist/firefox/` is the same package unpacked) |
  | `dist/proxyscout-opera-<version>.zip` | Opera add-ons |

  File dates in the zips are fixed, so the same source always produces byte-identical packages.
- **What the build does:** copies `extension/` unchanged, except that:
  - the `key` field is removed from the manifest (the stores assign their own IDs);
  - **Firefox:** a Manifest V2 `manifest.json` is generated (`firefoxManifest()` in
    `tools/build-zip.mjs`), `background.html` is added and `<script src="lib/firefox-shim.js">` is
    inserted into `manager.html` and `popup.html`. The persistent background page keeps the
    `proxy.onRequest` listener alive, so traffic cannot leak around the proxy while connected;
  - **Opera:** `short_name` is plain text and `data/ipv4-country.bin` is stored as base64 in
    `data/ipv4-country.json` (Opera's validator rejects `__MSG_…__` short names and `.bin` files).

  No code is transpiled, minified or bundled.

## How the tests work

Browser extensions cannot open raw TCP connections, so the tests use the browser's own network stack:
the extension installs a single **PAC script**. A test request carries the proxy as `TYPE~ip~port`
behind a random per-install token, and the PAC script routes only that request through that proxy
(Firefox: the same decision in JS, `findProxy()` in `lib/pac.js`, via `proxy.onRequest`).

1. **HTTP test** – `http://httpbin.org/get` is requested through the proxy. The returned IP and headers
   give whether it works, its anonymity level and its latency. Proxies that modify content are rejected.
2. **HTTPS test** – every proxy that passed (SOCKS included) opens **two separate** HTTPS connections to
   Cloudflare; both must return the proxy's exit IP. The test host
   (`pxs…-<type>-<ip>-<port>-….cloudflareaccess.com`) carries the proxy in its name, so all proxies are
   tested at once without changing the PAC script. `tests/bench.mjs`: real websites (Wikipedia, GitHub,
   Bing) opened **83%** of the time through proxies that passed, **7%** through those that failed. The
   chosen proxy is verified again over HTTPS on connect.
3. **Location** – country from the bundled DB-IP Lite database (`lib/geoip.js`, refreshed with
   `node tools/build-geo.mjs`); city and ISP of working proxies from ip-api.com (15 batch requests per
   minute on the free tier). Windows cannot draw flag emojis, so a small flag font is bundled.

While connected, local network addresses and the bypass list in Settings go direct.

## Sync internals

- The snapshot holds working proxies, favorites, user-added proxies, sources and settings, compressed
  (3,000 proxies ≈ 75 KB). Dead/untested proxies are left out (`lib/sync.js`).
- It is written in one go when a test finishes or 1 minute after a manual change, at most every
  2 minutes. Newer remote data is fetched and merged first (field-level "last writer wins"). Other
  devices pick up changes at startup, when browser sync delivers them and every 15 minutes.
- Browser sync uses `chrome.storage.sync` (Chrome/Edge account, Firefox: Mozilla account; Opera has
  none). Google Drive uses the `drive.appdata` scope; access tokens last one hour and are renewed
  silently for the chosen account (`lib/drive.js`).

## Configuring Google sign-in

> `BUILTIN_CLIENT_ID` in this repository belongs to the developer's own Google Cloud project. If you
> fork and distribute your own build, create your own client. Users can also enter their own client in
> **Settings → Sync → Advanced**.

Google does not let any app access Drive without a registered OAuth client (~10 minutes, once):

1. <https://console.cloud.google.com> → **New project** (e.g. "ProxyScout").
2. **APIs & Services → Library** → "Google Drive API" → **Enable**.
3. **Google Auth Platform → Branding / Audience**: app name **ProxyScout**, support e-mail, audience
   **External**. **Data Access**: `.../auth/drive.appdata`, `openid`, `.../auth/userinfo.email` (all
   non-sensitive).
4. **Clients → Create client** → **Web application** → **Authorized redirect URIs**: one per extension
   ID — `https://<extension-id>.chromiumapp.org/` for Chromium browsers,
   `https://<hash>.extensions.allizom.org/` for Firefox. Settings → Sync → Advanced shows the exact
   address with a **Copy** button. Every store gives the extension its own ID, so add one for each
   store build plus the development ID.
5. Put the **Client ID** (`…apps.googleusercontent.com`) into `BUILTIN_CLIENT_ID` in
   `extension/lib/drive.js`. The client ID is not a secret; the client **secret** is not used and must
   not be added to the extension.
6. In **Testing** only listed test users can sign in. **Publish app** to let everyone in (Branding needs
   a homepage and privacy policy URL); the scopes are non-sensitive, so no app verification is needed.

**Extension ID:** `manifest.json` contains a fixed `key` so the development build has the same ID on
every computer (`bbhjnmkfdcibcmeikpmpcobfkiajfklc`). The private key (`extension-key.pem`) is **not** in
the repository; keep it secret. `node tools/make-key.mjs` creates a key or prints the ID.

## Release and automatic deployment

On every push to `main`, GitHub Actions runs the tests
([`.github/workflows/release.yml`](../.github/workflows/release.yml)). If there is no `vX.Y.Z` tag yet for
the version in `extension/manifest.json`, it also:

1. builds the store packages and creates a GitHub Release with all three,
2. uploads them to the **Chrome Web Store**, **Edge Add-ons** and **Firefox Add-ons** and submits them
   for review (`tools/publish.mjs`),
3. opens a GitHub issue with the Opera package link and upload steps (Opera add-ons has no upload API).

To ship a fix, bump the version and push:

```
npm run bump            # 1.2.1 → 1.2.2  (also: minor / major / 1.3.0)
git commit -am "Version 1.2.2"
git push
```

Pushes without a version bump only run the tests. To check the store secrets without uploading
anything: **Actions → Release → Run workflow → "Yalnızca mağaza anahtarlarını sına"**.

## One-time store setup

Store descriptions, permission justifications and images (EN/TR): [`store/LISTING.md`](../store/LISTING.md)
and the [`store/`](../store) folder. The **first version is uploaded manually** in each store's
dashboard; later versions are sent by the workflow. Secrets go under **Settings → Secrets and
variables → Actions**; a store is skipped when its secrets are missing.

**Chrome Web Store** (one-time USD 5 registration, 2-step verification required)

1. <https://chrome.google.com/webstore/devconsole> → **New item** → upload the zip, fill in the listing,
   screenshots and **Privacy** tab → submit for review.
2. Item ID → `CWS_EXTENSION_ID`, publisher ID (Account page) → `CWS_PUBLISHER_ID`.
3. In Google Cloud enable the "Chrome Web Store API" and create an OAuth client (Web application,
   redirect URI `https://developers.google.com/oauthplayground`) → `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`.
4. In the [OAuth 2.0 Playground](https://developers.google.com/oauthplayground) use your own client and
   authorize `https://www.googleapis.com/auth/chromewebstore`; the **refresh token** →
   `CWS_REFRESH_TOKEN`.

**Microsoft Edge Add-ons** (free)

1. <https://partner.microsoft.com/dashboard/microsoftedge> → **Create new extension** → upload the zip,
   fill in the details → submit.
2. The extension's **Product ID** → `EDGE_PRODUCT_ID`.
3. **Publish API** → **Create API credentials** → `EDGE_CLIENT_ID`, `EDGE_API_KEY` (API keys expire;
   update the secret when renewed).

**Firefox Add-ons** (free)

1. <https://addons.mozilla.org/developers/> → **Submit a New Add-on** → *On this site* → upload
   `dist/proxyscout-firefox-<version>.zip` (no source upload needed: the code is not minified or
   bundled) → fill in the listing → submit.
2. **Tools → Manage API Keys** → JWT issuer → `AMO_JWT_ISSUER`, JWT secret → `AMO_JWT_SECRET`.
3. The add-on ID is fixed in the build (`proxyscout@halil-kaplan.github.io`); never change it, or
   updates become a new add-on.

**Opera add-ons** (free, no API: semi-automatic)

1. <https://addons.opera.com/developer/> → **Upload package** → `dist/proxyscout-opera-<version>.zip`
   (not the Chrome zip).
2. Listing: 64×64 icon (`store/opera-icon-64.png`), at most 3 screenshots per language
   (`store/screenshots/opera/`, 800×500). Each field is saved only after clicking the ✔ next to it;
   then **General → Submit changes**.
3. Turn on **automatic moderation**: versions that pass the automatic checks are published without a
   manual review.
4. For every new version, follow the issue the workflow opens: **Versions → Upload new version** →
   upload the zip → confirm the fields with ✔ → **Submit changes**, then close the issue. The package ID
   in the link is `OPERA_PACKAGE_ID` in the workflow.

Once a store is live, replace its `<!-- …_LINK -->` placeholder in both READMEs with the store link.

## Project layout

```
extension/
  manifest.json          Manifest V3 (Chrome/Edge/Opera; the Firefox MV2 manifest is generated)
  background.js          download, test, connect, auto switch, sync (service worker / Firefox background page)
  lib/pac.js             PAC script generation and the same decision in JS (Firefox proxy.onRequest)
  lib/platform.js        browser differences (Firefox, Opera), Firefox data-collection permission
  lib/firefox-shim.js    Firefox only: maps chrome.* to the promise-based browser.*
  lib/parse.js           list parser
  lib/sources.js         built-in sources
  lib/geoip.js           offline IP → country lookup (data/ipv4-country.bin; Opera: .json)
  lib/sync.js            sync snapshot: build, merge, compress, chrome.storage.sync packing
  lib/drive.js           Google Drive appDataFolder client and OAuth helpers
  lib/i18n.js            language selection and translation helpers
  lib/messages.js        English / Turkish strings (add new languages here)
  lib/ui.js              shared UI code
  manager.*              full-page manager
  popup.*                toolbar popup
  _locales/              extension name/description translations
  fonts/                 flag font (Twemoji, CC-BY 4.0)
tests/
  logic.test.mjs         parser, PAC and geo database tests
  i18n.test.mjs          translation keys and source structure
  sync.test.mjs          sync snapshot, merge, quota, input validation, Drive client
  firefox.test.mjs       Firefox: PAC/JS decision parity, ProxyInfo, generated manifest
  opera.test.mjs         Opera: generated manifest, JSON country database
  e2e.mjs                end-to-end test in Chrome for Testing (needs puppeteer)
  e2e-firefox.mjs        end-to-end test in Firefox (needs selenium-webdriver)
  sync-e2e.mjs           two-browser sync test
  bench.mjs              real-site comparison of proxies that passed / failed the HTTPS test
tools/
  build-zip.mjs          store packages (npm run build)
  publish.mjs            upload to Chrome Web Store / Edge Add-ons / Firefox Add-ons (GitHub Actions)
  bump-version.mjs       bump the version (npm run bump)
  store-assets.mjs       store screenshots and promo tiles (puppeteer)
  build-geo.mjs          country database from DB-IP Lite
  make-icons.mjs         icons
  make-key.mjs           fixed-ID key / print the extension ID
```
