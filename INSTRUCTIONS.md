# Installing "Where Am I?" (developer mode)

This extension is not on the Chrome Web Store — you install it as an **unpacked
extension**. This is fully supported by Chrome and is how the extension is meant
to be used. It takes about a minute.

> Works in any Chromium browser version **111 or newer**: Google Chrome,
> Microsoft Edge, Arc, Brave, etc. (Firefox/Safari are not supported yet.)

---

## 1. Get the files

**Option A — Download a ZIP**
1. On the GitHub repo page, click the green **Code** button → **Download ZIP**.
2. Unzip it somewhere you'll keep it (e.g. your Documents folder).
   Don't delete this folder later — Chrome loads the extension from it.

**Option B — Clone with git**
```bash
git clone https://github.com/<your-username>/<repo-name>.git
```

You should end up with a folder that contains `manifest.json` at its top level.

---

## 2. Load it into Chrome

1. Open a new tab and go to: `chrome://extensions`
   (in Edge it's `edge://extensions`).
2. Turn on **Developer mode** — the toggle in the **top‑right** corner.
3. Click **Load unpacked** (top‑left).
4. Select the folder from step 1 (the one containing `manifest.json`) and click
   **Open / Select**.
5. The **Where Am I?** card appears with its green location‑pin icon. Done.

> Tip: click the puzzle‑piece (Extensions) icon in the toolbar and **pin**
> "Where Am I?" so its icon is always visible.

---

## 3. Use it

1. Go to a course page on `https://learn.harvardonline.harvard.edu/…/content/…`.
2. A progress bar appears at the **bottom** of the page (you can move it).
3. Scroll through the Segment — it shows **Section X of Y** and a real percentage
   that climbs from 0% at the top to 100% at the end.

Click the toolbar icon to:
- Turn the bar **on/off**
- Change its **position** (top / bottom / left / right)
- Choose a **theme** (System / Dark / Light)

Click the **minimize** ( — ) button on the bar to shrink it to a small pill that
shows live `% · current/total`. **Drag** the pill anywhere; **click** it to
expand again.

---

## Updating to a newer version

1. Replace the folder's contents with the new version (re‑download/`git pull`).
2. Go to `chrome://extensions` and click the **↻ reload** icon on the
   "Where Am I?" card.
3. Refresh any open course tab.

---

## Troubleshooting

**The bar doesn't appear.**
- Make sure you're on a `learn.harvardonline.harvard.edu` course page.
- Confirm the extension is **enabled** on `chrome://extensions`.
- Reload the course page.

**It says "calibrating…" (amber bar) instead of a real total.**
- That means it couldn't read the course outline this load. Reload the page so
  the extension is in place before the app fetches its data. After one full pass
  through the Segment it will remember the total anyway.

**I reloaded the extension and saw a console error like
"Extension context invalidated".**
- That's harmless — it comes from the *old* copy still running in an already‑open
  tab. Just refresh the course page and it goes away.

**Progress seems off on the last screen.**
- The final sections register as you scroll into the last screenful; scroll all
  the way down and it should reach 100%.

---

## Removing it

Go to `chrome://extensions` and click **Remove** on the "Where Am I?" card. Your
saved settings are removed with it.
