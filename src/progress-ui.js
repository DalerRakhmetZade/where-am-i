/*
 * WhereAmI — floating progress bar UI
 *
 * Rendered inside a Shadow DOM so the host page's stylesheet cannot interfere
 * with (or be polluted by) our widget.
 */
(function () {
  const NS = (window.WhereAmI = window.WhereAmI || {});

  const STYLE = `
    :host { all: initial; }
    .wai-root {
      position: fixed;
      z-index: 2147483646;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
      box-sizing: border-box;
      pointer-events: none;
      color: var(--wai-text);
      /* accent (shared across themes) */
      --wai-accent-a: #34d399;
      --wai-accent-b: #22d3ee;
      --wai-glow: rgba(45, 212, 191, 0.45);
      --wai-warn-a: #fbbf24;
      --wai-warn-b: #f59e0b;
      --wai-warn-glow: rgba(245, 158, 11, 0.40);
    }
    /* Dark theme tokens */
    .wai-root.wai-theme-dark {
      --wai-bar-grad: linear-gradient(180deg, rgba(24,28,39,0.78), rgba(11,14,21,0.92));
      --wai-text: #f8fafc;
      --wai-sub: rgba(226,232,240,0.62);
      --wai-track: rgba(255,255,255,0.09);
      --wai-track-shadow: inset 0 1px 1px rgba(0,0,0,0.35);
      --wai-border: rgba(255,255,255,0.07);
      --wai-shadow: rgba(0,0,0,0.42);
      --wai-btn-bg: rgba(255,255,255,0.08);
      --wai-btn-bg-h: rgba(255,255,255,0.16);
      --wai-btn-col: rgba(248,250,252,0.85);
      --wai-pill-grad: linear-gradient(180deg, rgba(24,28,39,0.92), rgba(11,14,21,0.96));
      --wai-side-bg: rgba(11,14,21,0.92);
    }
    /* Light theme tokens */
    .wai-root.wai-theme-light {
      --wai-bar-grad: linear-gradient(180deg, rgba(255,255,255,0.88), rgba(244,246,250,0.94));
      --wai-text: #0f172a;
      --wai-sub: rgba(15,23,42,0.55);
      --wai-track: rgba(15,23,42,0.10);
      --wai-track-shadow: inset 0 1px 1px rgba(15,23,42,0.10);
      --wai-border: rgba(15,23,42,0.10);
      --wai-shadow: rgba(15,23,42,0.18);
      --wai-btn-bg: rgba(15,23,42,0.06);
      --wai-btn-bg-h: rgba(15,23,42,0.12);
      --wai-btn-col: rgba(15,23,42,0.7);
      --wai-pill-grad: linear-gradient(180deg, rgba(255,255,255,0.95), rgba(244,246,250,0.97));
      --wai-side-bg: rgba(255,255,255,0.95);
    }
    .wai-root * { box-sizing: border-box; }

    /* Position variants */
    .wai-pos-top    { top: 0; left: 0; right: 0; }
    .wai-pos-bottom { bottom: 0; left: 0; right: 0; }
    .wai-pos-left   { top: 0; bottom: 0; left: 0; width: 10px; }
    .wai-pos-right  { top: 0; bottom: 0; right: 0; width: 10px; }

    .wai-bar {
      pointer-events: auto;
      background: var(--wai-bar-grad);
      -webkit-backdrop-filter: blur(14px) saturate(140%);
      backdrop-filter: blur(14px) saturate(140%);
    }
    .wai-pos-top .wai-bar {
      box-shadow: 0 6px 22px var(--wai-shadow);
      border-bottom: 1px solid var(--wai-border);
    }
    .wai-pos-bottom .wai-bar {
      box-shadow: 0 -6px 22px var(--wai-shadow);
      border-top: 1px solid var(--wai-border);
    }
    .wai-pos-top .wai-bar, .wai-pos-bottom .wai-bar {
      display: flex; align-items: center; gap: 12px;
      padding: 9px 16px;
    }

    .wai-track {
      position: relative;
      flex: 1;
      height: 6px;
      border-radius: 999px;
      background: var(--wai-track);
      box-shadow: var(--wai-track-shadow);
      overflow: visible;
    }
    .wai-fill {
      position: absolute; left: 0; top: 0; bottom: 0;
      width: 0%;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--wai-accent-a), var(--wai-accent-b));
      box-shadow: 0 0 12px var(--wai-glow);
      transition: width 240ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    /* glossy highlight on the fill */
    .wai-fill::after {
      content: "";
      position: absolute; inset: 0;
      border-radius: 999px;
      background: linear-gradient(180deg, rgba(255,255,255,0.35), rgba(255,255,255,0) 55%);
      opacity: 0.6;
    }
    .wai-fill.learning {
      background: linear-gradient(90deg, var(--wai-warn-a), var(--wai-warn-b));
      box-shadow: 0 0 12px var(--wai-warn-glow);
    }

    .wai-label { font-size: 12.5px; white-space: nowrap; font-variant-numeric: tabular-nums; display: flex; align-items: baseline; gap: 8px; }
    .wai-pct { font-weight: 700; letter-spacing: 0.2px; color: var(--wai-text); }
    .wai-sub { color: var(--wai-sub); font-size: 11px; font-weight: 500; }

    .wai-btn {
      pointer-events: auto;
      cursor: pointer;
      border: none;
      background: var(--wai-btn-bg);
      color: var(--wai-btn-col);
      border-radius: 7px;
      width: 22px; height: 22px;
      font-size: 14px; line-height: 1;
      display: inline-flex; align-items: center; justify-content: center;
      transition: background 140ms ease, color 140ms ease;
    }
    .wai-btn:hover { background: var(--wai-btn-bg-h); color: var(--wai-text); }

    /* Side (vertical) layout */
    .wai-pos-left .wai-bar, .wai-pos-right .wai-bar {
      width: 10px; height: 100%; padding: 0;
    }
    .wai-pos-left .wai-bar { box-shadow: 6px 0 22px var(--wai-shadow); }
    .wai-pos-right .wai-bar { box-shadow: -6px 0 22px var(--wai-shadow); }
    .wai-pos-left .wai-track, .wai-pos-right .wai-track {
      width: 10px; height: 100%; border-radius: 0;
    }
    .wai-pos-left .wai-fill, .wai-pos-right .wai-fill {
      left: 0; right: 0; top: auto; bottom: 0;
      width: 100% !important; height: 0%;
      border-radius: 0;
      background: linear-gradient(0deg, var(--wai-accent-a), var(--wai-accent-b));
      transition: height 240ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    .wai-pos-left .wai-fill.learning, .wai-pos-right .wai-fill.learning {
      background: linear-gradient(0deg, var(--wai-warn-a), var(--wai-warn-b));
    }
    .wai-side-label {
      position: absolute; bottom: 8px;
      font-size: 10px; font-weight: 600; padding: 3px 6px;
      color: var(--wai-text);
      background: var(--wai-side-bg); border-radius: 6px;
      box-shadow: 0 2px 8px var(--wai-shadow);
      pointer-events: auto;
    }
    .wai-pos-left .wai-side-label { left: 12px; }
    .wai-pos-right .wai-side-label { right: 12px; }

    .wai-hidden { display: none !important; }

    /* Minimized pill */
    .wai-pill {
      pointer-events: auto;
      position: fixed;
      bottom: 14px; right: 14px;
      background: var(--wai-pill-grad);
      color: var(--wai-text); border-radius: 999px;
      padding: 7px 14px; font-size: 12px; font-weight: 600;
      cursor: grab;
      touch-action: none;
      user-select: none; -webkit-user-select: none;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      border: 1px solid var(--wai-border);
      box-shadow: 0 8px 24px var(--wai-shadow);
      transition: box-shadow 140ms ease;
    }
    .wai-pill:hover { box-shadow: 0 10px 28px var(--wai-shadow); }
    .wai-pill.wai-dragging { cursor: grabbing; box-shadow: 0 12px 30px var(--wai-shadow); }
  `;

  class ProgressUI {
    constructor() {
      this.host = null;
      this.shadow = null;
      this.settings = null;
      this.lastState = null;
      this.onSetStep = null; // callback(stepNumber)
    }

    mount(settings) {
      this.settings = settings;
      if (this.host) return;
      this.host = document.createElement("div");
      this.host.id = "whereami-host";
      this.host.style.all = "initial";
      this.shadow = this.host.attachShadow({ mode: "open" });

      const style = document.createElement("style");
      style.textContent = STYLE;
      this.shadow.appendChild(style);

      this.root = document.createElement("div");
      this.shadow.appendChild(this.root);

      (document.documentElement || document.body).appendChild(this.host);

      // Re-apply theme when the OS scheme changes (only matters in "system" mode).
      this._mql = window.matchMedia("(prefers-color-scheme: dark)");
      this._mqlHandler = () => {
        if ((this.settings.theme || "system") === "system") this._build();
      };
      if (this._mql.addEventListener) {
        this._mql.addEventListener("change", this._mqlHandler);
      } else if (this._mql.addListener) {
        this._mql.addListener(this._mqlHandler);
      }

      this._build();
    }

    _effectiveTheme() {
      const t = this.settings.theme || "system";
      if (t === "light" || t === "dark") return t;
      return this._mql && this._mql.matches ? "dark" : "light";
    }

    _build() {
      const pos = this.settings.position || "top";
      const horizontal = pos === "top" || pos === "bottom";
      const theme = this._effectiveTheme();

      this.root.innerHTML = "";
      this.root.className = `wai-root wai-pos-${pos} wai-theme-${theme}`;

      if (this.settings.minimized) {
        const pill = document.createElement("div");
        pill.className = "wai-pill";
        pill.title = "Drag to move · click to expand";
        // Restore a dragged position, if any.
        const p = this.settings.pillPos;
        if (p && typeof p.left === "number" && typeof p.top === "number") {
          pill.style.left = p.left + "px";
          pill.style.top = p.top + "px";
          pill.style.right = "auto";
          pill.style.bottom = "auto";
        }
        this.root.appendChild(pill);
        this._pill = pill;
        this._setupPillDrag(pill);
        this.render(this.lastState || { overall: 0, currentStep: 1 });
        return;
      }
      this._pill = null;

      const bar = document.createElement("div");
      bar.className = "wai-bar";

      const track = document.createElement("div");
      track.className = "wai-track";
      const fill = document.createElement("div");
      fill.className = "wai-fill";
      track.appendChild(fill);
      this._fill = fill;

      if (horizontal) {
        const label = document.createElement("div");
        label.className = "wai-label";
        label.innerHTML = `<span class="wai-pct">0%</span> <span class="wai-sub"></span>`;
        this._label = label;
        this._pct = label.querySelector(".wai-pct");
        this._sub = label.querySelector(".wai-sub");

        const minBtn = document.createElement("button");
        minBtn.className = "wai-btn";
        minBtn.textContent = "—";
        minBtn.title = "Minimize";
        minBtn.addEventListener("click", () => this._setMinimized(true));

        bar.appendChild(label);
        bar.appendChild(track);
        bar.appendChild(minBtn);
      } else {
        const sideLabel = document.createElement("div");
        sideLabel.className = "wai-side-label";
        sideLabel.textContent = "0%";
        this._sideLabel = sideLabel;
        bar.appendChild(track);
        this.root.appendChild(sideLabel);
      }

      this.root.appendChild(bar);

      if (this.lastState) this.render(this.lastState);
    }

    _setMinimized(min) {
      this.settings.minimized = min;
      NS.storage.setSettings({ minimized: min });
      this._build();
    }

    // Make the minimized pill draggable. A small movement is treated as a click
    // (expand); a larger movement repositions it and persists the location.
    _setupPillDrag(pill) {
      let dragging = false;
      let moved = false;
      let startX = 0;
      let startY = 0;
      let origLeft = 0;
      let origTop = 0;

      const onDown = (e) => {
        dragging = true;
        moved = false;
        const rect = pill.getBoundingClientRect();
        origLeft = rect.left;
        origTop = rect.top;
        startX = e.clientX;
        startY = e.clientY;
        // Switch to explicit left/top positioning for dragging.
        pill.style.left = origLeft + "px";
        pill.style.top = origTop + "px";
        pill.style.right = "auto";
        pill.style.bottom = "auto";
        pill.classList.add("wai-dragging");
        try {
          pill.setPointerCapture(e.pointerId);
        } catch (err) {
          /* ignore */
        }
        e.preventDefault();
      };

      const onMove = (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
        const w = pill.offsetWidth;
        const h = pill.offsetHeight;
        const left = Math.max(4, Math.min(window.innerWidth - w - 4, origLeft + dx));
        const top = Math.max(4, Math.min(window.innerHeight - h - 4, origTop + dy));
        pill.style.left = left + "px";
        pill.style.top = top + "px";
      };

      const onUp = (e) => {
        if (!dragging) return;
        dragging = false;
        pill.classList.remove("wai-dragging");
        try {
          pill.releasePointerCapture(e.pointerId);
        } catch (err) {
          /* ignore */
        }
        if (moved) {
          const rect = pill.getBoundingClientRect();
          this.settings.pillPos = { left: rect.left, top: rect.top };
          NS.storage.setSettings({ pillPos: this.settings.pillPos });
        } else {
          this._setMinimized(false); // simple click → expand
        }
      };

      pill.addEventListener("pointerdown", onDown);
      pill.addEventListener("pointermove", onMove);
      pill.addEventListener("pointerup", onUp);
    }

    _pillText(state) {
      const pct = Math.round((state.overall || 0) * 100);
      const cur = state.currentStep || 1;
      const total = state.learnedTotalSteps;
      return total > 0 ? `${pct}% · ${cur}/${total}` : `${pct}% · ${cur}/…`;
    }

    updateSettings(settings) {
      this.settings = settings;
      this._build();
    }

    render(state) {
      this.lastState = state;
      if (this.settings.minimized) {
        if (this._pill && state) {
          this._pill.textContent = this._pillText(state);
          this._pill.title = this._subText(state) + " · drag to move, click to expand";
        }
        return;
      }
      const pct = Math.round(state.overall * 100);
      const pos = this.settings.position || "top";
      const horizontal = pos === "top" || pos === "bottom";

      if (this._fill) {
        const learning = state.mode === "learning";
        this._fill.classList.toggle("learning", learning);
        if (horizontal) this._fill.style.width = pct + "%";
        else this._fill.style.height = pct + "%";
      }

      if (horizontal) {
        if (this._pct) this._pct.textContent = pct + "%";
        if (this._sub) this._sub.textContent = this._subText(state);
      } else if (this._sideLabel) {
        this._sideLabel.textContent = pct + "%";
        this._sideLabel.title = this._subText(state);
      }
    }

    _subText(state) {
      if (state.mode === "known") {
        return `Section ${state.currentStep} of ${state.learnedTotalSteps}`;
      }
      // Learning mode: total unknown. Headline % = progress through the current
      // section. Indicate whether more locked content remains.
      const more = state.hasMore ? " · more to unlock" : "";
      return `Section ${state.currentStep}${more} · calibrating…`;
    }

    unmount() {
      if (this._mql && this._mqlHandler) {
        if (this._mql.removeEventListener) {
          this._mql.removeEventListener("change", this._mqlHandler);
        } else if (this._mql.removeListener) {
          this._mql.removeListener(this._mqlHandler);
        }
      }
      if (this.host && this.host.parentNode) {
        this.host.parentNode.removeChild(this.host);
      }
      this.host = null;
      this.shadow = null;
    }
  }

  NS.ProgressUI = ProgressUI;
})();
