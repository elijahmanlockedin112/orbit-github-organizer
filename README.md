# Orbit — GitHub project organizer

A Chrome extension that puts your whole GitHub portfolio in one tab: per-project stats,
a built-in code browser, and live previews of every GitHub Pages site you've published.

No build step, no dependencies, no server. Plain ES modules talking to the GitHub REST API.

---

## Install

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and pick this folder
4. Click the Orbit icon in the toolbar (or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd>) — it asks for your GitHub username

Pin the icon via the puzzle-piece menu if you want it always visible.

### Want it on the new tab page?

Orbit opens on demand by default, because taking over every new tab gets old fast.
If you do want it there, add this to `manifest.json` and hit reload on
`chrome://extensions`:

```json
"chrome_url_overrides": { "newtab": "dashboard.html" }
```

Removing that block again restores Chrome's normal new tab. Your pins, notes and
settings survive either change — they're keyed to the extension, not the page.

### The token (optional, but do it)

Without a token you get GitHub's anonymous limit: **60 API requests/hour**, public repos only.
Orbit spends roughly one request per repo on the first load, so 30+ repos will run dry.

With a [personal access token](https://github.com/settings/tokens/new) you get **5,000/hour**:

- A **classic token with no scopes ticked** is enough for public repos.
- Tick **`repo`** to also see your private repositories.

The token is stored in `chrome.storage.local`, scoped to this extension in this Chrome
profile. It is sent to `api.github.com` and nowhere else — that's the only host the
extension is allowed to contact.

---

## What's in it

### Projects
A card per repo with estimated lines of code, a language ribbon, stars, forks, open
issues and last-push age. Pin the ones you care about; they float to the top.

Filter by language, collection or status; sort by recent, newest, most code, most stars,
name, or **most neglected** (longest since a push — a good to-do list).

### Live Sites
Every repo with GitHub Pages enabled, rendered as a real, scaled-down thumbnail of the
actual site. Click through to open it, or hit **Details** for the full view.

### Repo detail
- **Overview** — the README, rendered (tables, task lists, fenced code, relative images).
- **Code** — the full file tree with a filter box and a syntax-highlighted viewer.
  Images render inline; Markdown files toggle between rendered and raw.
- **Live site** — the Pages site in an embedded frame, with desktop/tablet/mobile widths.
- **Insights** — language breakdown, 52-week commit graph, contributors, and
  **Count exactly** (see below).
- **Organize** — status, collections, notes, and a per-repo hide toggle.

### Your own layer on top
Pins, statuses (Idea / Active / Paused / Shipped / Shelved), free-form collections and
notes are all stored locally and are searchable. Nothing is ever written back to GitHub.
Export and import them as JSON from Settings.

---

## About the line counts

GitHub's API reports **bytes per language**, never line counts. Orbit divides those bytes
by a per-language average bytes-per-line to get an estimate — one cheap request per repo,
so the whole dashboard has numbers immediately. Anything derived this way is labelled
**est.** in the UI.

For a real number, open a repo → **Insights** → **Count exactly**. That walks the git tree
and reads every source file (skipping `node_modules`, `dist`, `vendor`, build output,
binaries and files over 900 KB), then shows how far off the estimate was. It costs about
one API request per source file, so Orbit asks first when a repo has more than 400 of them.
The result is saved locally and shown on the repo from then on.

In testing the estimate lands within roughly 10–15% of the real count on ordinary source trees.

---

## Keyboard

| Key | Does |
|-----|------|
| <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd> | Open Orbit (from anywhere in Chrome) |
| *any letter or digit* | Jumps into the search box and starts typing |
| <kbd>/</kbd> | Focus search without typing a character |
| <kbd>Esc</kbd> | Clear the search, or close the overlay |

Refresh, theme and the three views are toolbar buttons. They used to be bare
<kbd>R</kbd>/<kbd>T</kbd>/<kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> shortcuts, which meant typing
anywhere outside the search box silently refreshed the page or flipped the theme instead
of searching. Type-to-search is worth more than the shortcuts were.

---

## How it's built

```
manifest.json          MV3, toolbar action + Alt+Shift+O command
dashboard.html         the whole UI shell
src/css/               base tokens + theming, dashboard, detail overlay
src/js/
  main.js              bootstrap, data loading, events
  github.js            REST client: ETag caching, rate-limit tracking, error kinds
  store.js             chrome.storage wrapper (falls back to localStorage), settings, notes
  state.js             app state + the filter/sort pipeline
  loc.js               language colours, the line estimator, the exact counter
  markdown.js          README renderer + HTML sanitiser
  highlight.js         syntax highlighter (~20 languages, no dependencies)
  util.js              DOM builder, formatters, concurrency pool
  icons.js             inline SVG icons
  views/               dashboard, detail, settings
tests/render-check.html  83 assertions over the pure functions
```

**Caching.** Every request carries an ETag; a `304 Not Modified` costs nothing against
the rate limit. Language byte counts, READMEs and file trees are cached under the repo's
`pushed_at`, so they're re-fetched exactly when the repo changes and never otherwise.
Blobs are content-addressed and cached forever, except during an exact count — that
reads each file once and would otherwise fill the 10 MB storage quota.

**Security.** README HTML goes through an allowlist sanitiser (no scripts, no iframes,
no `on*` handlers, no `javascript:` URLs, only image `data:` URLs). Pages previews are
sandboxed iframes with `no-referrer`.

### Working on it

There's no build step — edit a file and reload the extension.

To iterate in a normal tab instead, serve the folder and open `dashboard.html`
(it falls back to `localStorage` when `chrome.storage` isn't there):

```bash
python -m http.server 5178
```

Then open <http://127.0.0.1:5178/dashboard.html>, and
<http://127.0.0.1:5178/tests/render-check.html> to run the checks.

---

## Known limits

- Some sites set `X-Frame-Options` or a frame-ancestors CSP and refuse to be embedded.
  Those previews stay blank; the **Open** button always works.
- `/repos/:owner/:repo/pages` needs push access, so for repos you don't own Orbit falls
  back to the conventional `owner.github.io/repo` URL. Custom domains on other people's
  repos won't resolve.
- GitHub computes the commit-activity graph lazily; the first request for a quiet repo
  can return "still computing".
- The repo list is capped at 1,000 (10 pages of 100).
