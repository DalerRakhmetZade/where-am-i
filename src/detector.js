/*
 * WhereAmI — page detector / progress engine
 *
 * Strategy (no outline available on the target site):
 *   1. Track the current step by counting "gating" actions (clicks on
 *      Next / Submit / Continue style controls).
 *   2. Track fine-grained scroll position within the currently rendered content.
 *   3. Learn the total number of steps after the first complete pass and persist
 *      it, so later visits show a true "Step X of Y".
 *   4. Opportunistically scan for an embedded course manifest (refined after a
 *      real-page inspection) to upgrade to true progress on the first pass.
 *
 * Everything here is heuristic and intentionally defensive so it keeps working
 * even if the site's markup changes. Selectors are centralized for easy tuning.
 */
(function () {
  const NS = (window.WhereAmI = window.WhereAmI || {});

  // ---- Selectors / heuristics, tuned for the Harvard Online (Nuxt) player ----
  const CONFIG = {
    // Each content block on a segment page (revealed OR locked) carries this.
    sectionSelector: '[data-testid="section"]',
    // The locked/upcoming block waiting to be unlocked.
    closedSectionClass: "closed-section",
    // Bottom "Next / continue to next segment" navigation area.
    navSelector: '[data-testid="bottom-page-navigation"]',
    // Heading whose text identifies the current segment (used to scope progress).
    segmentTitleSelector: "h1",

    // --- Fallbacks (used only if the selectors above find nothing) ---
    advanceText: /\b(next|submit|continue|begin|start|proceed|go on)\b/i,
    finishText: /\b(finish|complete|done|conclude|end)\b/i,
    controlSelector:
      'button, a, [role="button"], input[type="submit"], input[type="button"]',
    // Wait this long after a gating click before re-measuring (content reveal).
    revealSettleMs: 600,
  };

  function clamp01(n) {
    if (!isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
  }

  function visible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  }

  function controlText(el) {
    return (
      (el.innerText || el.value || el.getAttribute("aria-label") || "")
        .trim()
        .replace(/\s+/g, " ")
    );
  }

  // A stable-ish identifier for the current module. Each "Segment" page is its
  // own gated long-scroll page, so we include the segment title to track each
  // segment independently (advancing to the next segment must not make a
  // previously-learned total snap the bar backward).
  function segmentTitle() {
    const h = document.querySelector(CONFIG.segmentTitleSelector);
    return h ? (h.innerText || "").trim().replace(/\s+/g, " ").slice(0, 100) : "";
  }

  function computeModuleId() {
    let path = location.pathname.replace(/\/+$/, "");
    const seg = segmentTitle();
    return location.host + path + (seg ? " :: " + seg : "");
  }

  // ---- DOM section model (Harvard Online Nuxt player) ------------------------
  // Returns the revealed sections (excluding the locked "closed-section"),
  // whether a locked section is still pending, and how far the viewport has
  // scrolled through the last revealed section (0..1). Measuring against the
  // *current* section avoids the "bar jumps backward when new content unlocks"
  // problem, because total document height growing no longer matters.
  // Determine the section the user is currently reading and how far through it
  // they are. The "reading line" sits at the very top of the viewport for most
  // of the page (so the top reads as Section 1 at 0%), but over the final
  // screenful — where there is no more room to scroll — it sweeps down to the
  // viewport bottom so the last section(s), whose headers can never reach the
  // top, still register and the bar can reach 100%.
  function domSectionModel() {
    const all = Array.from(
      document.querySelectorAll(CONFIG.sectionSelector)
    );
    if (all.length === 0) return { hasDom: false };

    const open = [];
    let closed = 0;
    for (const el of all) {
      if (el.classList.contains(CONFIG.closedSectionClass)) closed++;
      else open.push(el);
    }
    if (open.length === 0) {
      return { hasDom: true, count: 1, openCount: 0, hasClosed: closed > 0, frac: 0 };
    }

    const clientH = document.documentElement.clientHeight || window.innerHeight || 0;
    const lastBottom = open[open.length - 1].getBoundingClientRect().bottom;
    // How much further the page can scroll before the last section's bottom
    // reaches the bottom of the viewport.
    const remaining = Math.max(0, lastBottom - clientH);
    const refY = remaining >= clientH ? 0 : clientH - remaining;

    let index = 1; // 1-based reading position; defaults to first section
    let currentEl = open[0];
    for (let i = 0; i < open.length; i++) {
      const top = open[i].getBoundingClientRect().top;
      if (top <= refY) {
        index = i + 1;
        currentEl = open[i];
      } else {
        break;
      }
    }

    const rect = currentEl.getBoundingClientRect();
    const h = currentEl.offsetHeight || rect.height || 1;
    const frac = clamp01((refY - rect.top) / h);

    return {
      hasDom: true,
      count: index, // section currently being read
      openCount: open.length, // how many are revealed so far
      hasClosed: closed > 0, // a locked section is still pending
      frac, // scroll progress through the current section
    };
  }


  // The scrollable root. Most pages use the document scrolling element, but some
  // course players scroll an inner container instead.
  function scrollRoot() {
    const el = document.scrollingElement || document.documentElement;
    return el;
  }

  // Is there still a visible "advance" control on the page?
  function hasAdvanceControl() {
    const els = document.querySelectorAll(CONFIG.controlSelector);
    for (const el of els) {
      if (!visible(el)) continue;
      if (CONFIG.advanceText.test(controlText(el))) return true;
    }
    return false;
  }

  // ----------------------------------------------------------------------------
  class Detector {
    constructor() {
      this.moduleId = computeModuleId();
      this.currentStep = 1;
      this.record = null; // persisted module record
      this.listeners = new Set();
      this._pendingAdvance = null;
      this._destroyed = false;
      // Scroll offset (px) where the current section begins. Updated whenever a
      // new gated section is unlocked, so we can measure progress *within* the
      // current section instead of the whole (growing) document.
      this.sectionTopOffset = 0;
      // True sub-section total for the current segment, read from the course
      // API via the page probe (enables accurate progress from the first load).
      this.apiTotal = 0;
    }

    contentId() {
      const m = location.pathname.match(/content\/(\d+)/);
      return m ? m[1] : null;
    }

    // Ask the page-world probe for the real sub-section count of this segment.
    _fetchApiTotal() {
      const cid = this.contentId();
      if (!cid || typeof NS.requestTotal !== "function") return;
      NS.requestTotal(cid).then((info) => {
        if (this._destroyed) return;
        if (this.contentId() !== cid) return; // segment changed meanwhile
        if (info && info.total > 0) {
          this.apiTotal = info.total;
          // Remember it so progress stays accurate even if the probe misses next time.
          if (this.record) {
            this.record.learnedTotalSteps = Math.max(
              this.record.learnedTotalSteps || 0,
              info.total
            );
            NS.storage.saveModule(this.record);
          }
          this._emit();
        }
      });
    }

    onChange(cb) {
      this.listeners.add(cb);
      return () => this.listeners.delete(cb);
    }

    _emit() {
      // Recompute from the DOM, persist any newly-learned info, then notify.
      let state = this.getState();
      this._syncPersist(state);
      // If learning just completed (total became known), recompute once more so
      // listeners get the upgraded "known" state immediately.
      state = this.getState();
      this.listeners.forEach((cb) => {
        try {
          cb(state);
        } catch (e) {
          /* ignore listener errors */
        }
      });
    }

    // Fraction scrolled through the *current section only* (0..1). Fallback used
    // only when the DOM section model is unavailable.
    sectionScrollFraction() {
      const el = scrollRoot();
      const max = el.scrollHeight - el.clientHeight;
      const base = Math.min(this.sectionTopOffset, Math.max(max, 0));
      const denom = max - base;
      if (denom <= 0) return 0;
      return clamp01((el.scrollTop - base) / denom);
    }

    getState() {
      const learnedTotal =
        this.apiTotal > 0
          ? this.apiTotal
          : this.record
          ? this.record.learnedTotalSteps
          : 0;

      const dom = domSectionModel();
      let currentStep;
      let sectionScroll;
      let hasMore;
      let usingDom;
      if (dom.hasDom) {
        usingDom = true;
        currentStep = Math.max(1, dom.count);
        sectionScroll = dom.frac;
        hasMore = dom.hasClosed;
      } else {
        usingDom = false;
        currentStep = this.currentStep;
        sectionScroll = this.sectionScrollFraction();
        hasMore = hasAdvanceControl();
      }
      // Keep the persisted step in sync with what the DOM tells us.
      this.currentStep = currentStep;

      // With a known total, there's more to come whenever we're not on the last
      // section (locked sections aren't in the DOM yet, so trust the total).
      if (learnedTotal > 0 && currentStep < learnedTotal) hasMore = true;

      let overall;
      let mode;
      if (learnedTotal > 0) {
        mode = "known";
        // True segment progress: completed sections + progress through this one.
        overall = clamp01((currentStep - 1 + sectionScroll) / learnedTotal);
      } else {
        mode = "learning";
        // No reliable total yet: headline reflects progress through the CURRENT
        // section, which counts 0->100% per section without regressing.
        overall = sectionScroll;
      }
      return {
        moduleId: this.moduleId,
        segmentTitle: segmentTitle(),
        currentStep,
        learnedTotalSteps: learnedTotal,
        sectionScroll,
        overall,
        mode,
        hasMore,
        usingDom,
      };
    }

    // Persist max step reached, and lock in the learned total once the segment
    // is fully revealed (no locked section remains and we're at its end).
    _syncPersist(state) {
      if (!this.record) return;
      let changed = false;
      if (state.currentStep > this.record.maxStepReached) {
        this.record.maxStepReached = state.currentStep;
        changed = true;
      }
      const segmentComplete =
        state.usingDom && !state.hasMore && state.sectionScroll > 0.97;
      if (
        segmentComplete &&
        state.currentStep > this.record.learnedTotalSteps
      ) {
        this.record.learnedTotalSteps = state.currentStep;
        this.record.completed = true;
        changed = true;
      }
      if (changed) NS.storage.saveModule(this.record);
    }

    async _loadRecord() {
      this.record = await NS.storage.getModule(this.moduleId);
    }

    async _persist({ atEnd } = {}) {
      this.record = await NS.storage.updateModule(this.moduleId, {
        currentStep: this.currentStep,
        atEnd,
      });
    }

    _handleClick(e) {
      const path = e.composedPath ? e.composedPath() : [e.target];
      let control = null;
      for (const node of path) {
        if (!(node instanceof Element)) continue;
        if (node.matches && node.matches(CONFIG.controlSelector)) {
          control = node;
          break;
        }
      }
      if (!control) return;
      const text = controlText(control);
      if (!text) return;

      const isFinish = CONFIG.finishText.test(text);
      const isAdvance = CONFIG.advanceText.test(text);
      if (!isAdvance && !isFinish) return;

      // Where the user is at click time ~ the bottom of the section they're
      // finishing. We treat that as the start of the next section so the new
      // section's progress measures from here.
      const boundaryAtClick = scrollRoot().scrollTop;

      // Debounce: a click may bubble through multiple matching ancestors.
      clearTimeout(this._pendingAdvance);
      this._pendingAdvance = setTimeout(() => {
        this.currentStep += 1;
        this.sectionTopOffset = boundaryAtClick;
        this._persist({ atEnd: isFinish }).then(() => this._emit());
      }, CONFIG.revealSettleMs);
    }

    _onScroll() {
      this._emit();
    }

    _onUrlChange() {
      const next = computeModuleId();
      if (next === this.moduleId) return;
      this.moduleId = next;
      this.currentStep = 1;
      this.sectionTopOffset = 0;
      this.apiTotal = 0; // re-fetch for the new segment
      this._loadRecord().then(() => {
        this._fetchApiTotal();
        this._emit();
      });
    }

    start() {
      this._clickHandler = (e) => this._handleClick(e);
      this._scrollHandler = throttle(() => this._onScroll(), 100);
      document.addEventListener("click", this._clickHandler, true);
      // IMPORTANT: this site scrolls an inner container (body scroll is blocked),
      // and scroll events don't bubble. Listening in the CAPTURE phase on the
      // document catches scroll from whichever element actually scrolls.
      document.addEventListener("scroll", this._scrollHandler, {
        capture: true,
        passive: true,
      });
      window.addEventListener("resize", this._scrollHandler, { passive: true });

      // SPA route change detection.
      patchHistory(() => this._onUrlChange());
      window.addEventListener("popstate", () => this._onUrlChange());
      window.addEventListener("hashchange", () => this._onUrlChange());

      // Watch for revealed content / segment changes, then re-evaluate.
      // _onUrlChange() also catches segment (h1) changes that don't alter the URL.
      this._observer = new MutationObserver(
        throttle(() => {
          this._onUrlChange();
          this._emit();
        }, 250)
      );
      this._observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      // Polling fallback: re-render if anything meaningful changed but no event
      // fired (covers exotic scroll containers / programmatic content swaps).
      this._poll = setInterval(() => {
        // If the extension was reloaded, this content script is now orphaned;
        // shut down cleanly instead of throwing on every chrome.* call.
        if (NS.extAlive && !NS.extAlive()) {
          this.destroy();
          return;
        }
        const s = this.getState();
        const sig =
          s.currentStep + "|" + s.learnedTotalSteps + "|" + Math.round(s.overall * 100);
        if (sig !== this._lastSig) {
          this._lastSig = sig;
          this._emit();
        }
      }, 500);

      // Receive the segment total if the outline arrives after we started.
      NS._onTotal = (info) => {
        if (this._destroyed || !info) return;
        if (String(info.contentId) !== String(this.contentId())) return;
        if (info.total > 0 && info.total !== this.apiTotal) {
          this.apiTotal = info.total;
          if (this.record) {
            this.record.learnedTotalSteps = Math.max(
              this.record.learnedTotalSteps || 0,
              info.total
            );
            NS.storage.saveModule(this.record);
          }
          this._emit();
        }
      };

      this._loadRecord().then(() => {
        this._fetchApiTotal();
        this._emit();
      });
      return this;
    }

    destroy() {
      this._destroyed = true;
      document.removeEventListener("click", this._clickHandler, true);
      document.removeEventListener("scroll", this._scrollHandler, {
        capture: true,
      });
      window.removeEventListener("resize", this._scrollHandler);
      if (this._observer) this._observer.disconnect();
      if (this._poll) clearInterval(this._poll);
    }
  }

  // ---- small utilities -------------------------------------------------------
  function throttle(fn, ms) {
    let last = 0;
    let timer = null;
    return function (...args) {
      const now = Date.now();
      const remaining = ms - (now - last);
      if (remaining <= 0) {
        last = now;
        fn.apply(this, args);
      } else {
        clearTimeout(timer);
        timer = setTimeout(() => {
          last = Date.now();
          fn.apply(this, args);
        }, remaining);
      }
    };
  }

  let historyPatched = false;
  function patchHistory(onChange) {
    if (historyPatched) {
      NS._historyListeners.push(onChange);
      return;
    }
    historyPatched = true;
    NS._historyListeners = [onChange];
    const fire = () => NS._historyListeners.forEach((cb) => cb());
    const wrap = (name) => {
      const orig = history[name];
      history[name] = function () {
        const ret = orig.apply(this, arguments);
        fire();
        return ret;
      };
    };
    wrap("pushState");
    wrap("replaceState");
  }

  NS.CONFIG = CONFIG;
  NS.Detector = Detector;
  NS.util = { clamp01, throttle };
})();
