# Where Am I? — Course Progress Bar

A Chrome (Manifest V3) extension that shows a **real progress bar** on gated,
scroll‑and‑click course pages — the kind where content is revealed only after you
click *Next* / *Continue* / *Mark As Complete*, so the browser's own scrollbar is
misleading and you never know how much is actually left.

Built for **Harvard Online** (`learn.harvardonline.harvard.edu`), whose course
player presents each chapter sub‑section as one long, progressively‑gated page
with no built‑in "Section X of Y" indicator.

<!-- Add a screenshot/GIF here once you have one. -->

---

## Why the native scrollbar lies

On these pages, the sub‑sections you haven't reached yet **don't exist in the
page** until you unlock them. So the browser scrollbar only measures the content
currently rendered — it jumps backwards every time new content appears, and it
hits "100%" long before you've actually finished the segment.

**Where Am I?** solves this by reading the course's own data to learn the *true*
number of sub‑sections up front, then tracking your real reading position.

---

## How it calculates your progress

The course is a Nuxt single‑page app. Understanding three layers of its content
hierarchy is the key:

| Layer | What it is | Visible up front? |
|-------|------------|-------------------|
| **Module** | A chapter (e.g. "Module 1") | Yes (course outline) |
| **Segment** | A sub‑chapter / one long page (e.g. "Segment 7") | Yes (course outline) |
| **Section** | A sub‑sub‑chapter inside a Segment — the gated blocks | **No** (revealed as you go) |

The thing you want to track is your progress through the **Sections** of the
current Segment. That count is hidden in the UI — but it *is* present in the
app's data.

### 1. Read the true Section total from the course API

When a Segment loads, the app fetches a **course outline** from:

```
GET /api/course-provisioning/courses/{courseRunId}/outline
```

This returns a tree of `children` where each node has a `type`:

- `LONG_HLXP_SCHEMA/FOLDER` → a **Module**
- `LONG_HLXP_SCHEMA/PAGE`   → a **Segment** (matched by its numeric `id`, which
  is the `…/content/{id}` in the URL)
- `SECTION`                 → a **Section** (with `data.title`, `data.locked`,
  `data.completionRequired`)

A Segment node's `children` are its Sections, so **the number of `SECTION`
children is the true total** — even though most are still locked.

Content scripts can't see the page's own network calls, so a tiny script is
injected into the page context (`src/page-probe.js`, a MAIN‑world content script)
that wraps `fetch`/`XMLHttpRequest`, caches the outline, finds the current
Segment by its content id, counts its `SECTION` children, and posts that number
back to the extension. Example: *Segment 7* resolves to **14 sections**.

### 2. Track your real reading position in the DOM

As you unlock content, each revealed Section is a `div[data-testid="section"]`
(the next locked one is `div.closed-section`). The detector
(`src/detector.js`) figures out:

- **Which Section you're reading** — the last revealed Section whose top has
  reached a "reading line" near the top of the viewport.
- **How far through it you are** — the scroll fraction within that Section.

### 3. Combine into a smooth, honest percentage

```
progress = (currentSection − 1 + scrollWithinCurrentSection) / totalSections
```

- At the very top of a Segment → **Section 1, 0%**.
- It climbs smoothly as you read and unlock Sections.
- At the bottom → **Section N of N, 100%**.

Two subtle problems this design fixes:

- **No backward jumps.** Because progress is measured per‑Section against the
  true total (not raw page scroll), unlocking new content never makes the bar
  regress.
- **The last sections still count.** A heading near the end of the page can never
  scroll all the way to the top (there's no more page to scroll). So over the
  final screenful the reading line **sweeps down** to the viewport bottom,
  registering the last Section(s) so the bar can actually reach 100%.

### Fallback when the API isn't available

If the outline can't be read (e.g. a future site change), the extension falls
back to a **learn‑after‑one‑pass** model: it shows an amber "calibrating…" bar
and remembers the Section count after your first full pass, then shows accurate
"Section X of Y" on later visits. The learned total is stored in
`chrome.storage.local`.

---

## Features

- **Accurate from the first load** — real "Section X of Y" and %.
- **Floating bar** — dock it **top / bottom / left / right**.
- **Themes** — System / Dark / Light (System follows your OS live).
- **Minimize to a pill** — shows live `% · current/total`, and is **draggable**
  to anywhere on screen (position is remembered).
- **Resilient** — handles the site's inner‑scroll container, SPA segment changes,
  and survives extension reloads without console spam.
- **Private** — no analytics, no network calls of its own; only reads the
  course's existing API responses locally.

---

## Install

This extension is distributed as an **unpacked developer extension** (it isn't on
the Chrome Web Store). See [`INSTRUCTIONS.md`](INSTRUCTIONS.md) for step‑by‑step
setup. In short:

1. Download/clone this repo.
2. Go to `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → select this folder.
4. Open a course page on `learn.harvardonline.harvard.edu`.

> Requires a Chromium browser (Chrome / Edge / Arc / Brave) version **111+**,
> because the network probe uses MV3 `world: "MAIN"` content scripts.

---

## Using it

- Click the toolbar icon for the popup: turn it **on/off**, change the bar
  **position**, and pick a **theme**.
- Drag the **minimized pill** anywhere; click it to expand again.
- Options page (right‑click the icon → **Options**) mirrors the settings and can
  **reset all learned data**.

---

## Project layout

```
manifest.json          MV3 manifest (scoped to the course host)
icons/                 app icons (svg source + generated PNGs)
src/page-probe.js      MAIN-world network probe — reads the course outline API
src/probe-bridge.js    relays the Segment's Section total to the content script
src/storage.js         chrome.storage.local persistence + settings (reload-safe)
src/detector.js        progress engine (sections, reading position, SPA routing)
src/progress-ui.js     Shadow-DOM floating bar + draggable minimized pill
src/content.js         orchestrator + popup message handling
popup/                 toolbar popup (status + position + theme)
options/               settings + reset-all page
styles/progress.css    host-element safety net (widget styles live in shadow DOM)
```

---

## Privacy

Where Am I? runs entirely in your browser. It does not send any data anywhere,
has no analytics, and only inspects the course pages and API responses your
browser already loads. Its host permission is limited to
`https://learn.harvardonline.harvard.edu/*`.

---

## Adapting to another platform

The progress model is generic; only the site‑specific selectors and API parsing
need changing:

- `src/detector.js → CONFIG` — the `SECTION` selector, the `closed-section`
  class, and the segment‑title selector.
- `src/page-probe.js` — which API URL holds the outline and how to find the
  current Segment / count its Sections.
- `manifest.json` — `host_permissions` and the content‑script `matches`.

---

## License

[MIT](LICENSE)
