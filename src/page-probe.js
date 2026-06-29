/*
 * WhereAmI — page-context network probe (runs in the MAIN world).
 *
 * Content scripts run in an isolated world and cannot see the page's own
 * fetch()/XHR calls. This script is injected into the page context to intercept
 * the course API, cache the course "outline", and report the true number of
 * sub-sections in the current Segment back to the extension (via postMessage),
 * so the progress bar can be accurate from the first load.
 */
(function () {
  if (window.__WAI_PROBE_INSTALLED__) return;
  window.__WAI_PROBE_INSTALLED__ = true;

  let outlineRoot = null; // cached parsed course outline

  function currentContentId() {
    const m = location.pathname.match(/content\/(\d+)/);
    return m ? m[1] : null;
  }

  // Find the PAGE (Segment) node in the outline by its numeric content id.
  function findPageNode(root, contentId) {
    if (!root || contentId == null) return null;
    let found = null;
    const seen = new Set();
    function walk(node) {
      if (found || !node || typeof node !== "object" || seen.has(node)) return;
      seen.add(node);
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (String(node.id) === String(contentId) && Array.isArray(node.children)) {
        found = node;
        return;
      }
      for (const k of Object.keys(node)) walk(node[k]);
    }
    walk(root);
    return found;
  }

  // Compute the true sub-section total for a Segment from the cached outline.
  function totalForContentId(contentId) {
    const node = findPageNode(outlineRoot, contentId);
    if (!node) return null;
    const sections = (node.children || []).filter(
      (c) => c && c.type === "SECTION"
    );
    return {
      contentId: String(contentId),
      segmentUid: node.uid || null,
      total: sections.length,
      requiredTotal: sections.filter(
        (s) => s.data && s.data.completionRequired
      ).length,
    };
  }

  function postTotal(contentId) {
    const info = totalForContentId(contentId);
    if (info && info.total > 0) {
      window.postMessage(
        Object.assign({ source: "wai-probe", kind: "total" }, info),
        "*"
      );
    }
  }

  // Inspect a JSON response: if it's the course outline, cache it and report the
  // current segment's total.
  function handleBody(url, body) {
    if (typeof body !== "string" || body.length < 2) return;
    if (body[0] !== "{" && body[0] !== "[") return; // JSON only
    if (!/\/outline/.test(String(url || ""))) return;
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch (e) {
      return;
    }
    outlineRoot = parsed;
    postTotal(currentContentId());
  }

  // ---- fetch wrapper --------------------------------------------------------
  const origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = function (...args) {
      const p = origFetch.apply(this, args);
      p.then((res) => {
        try {
          const ct = res.headers.get("content-type") || "";
          if (ct.indexOf("json") !== -1) {
            const url =
              (args[0] && args[0].url) || String(args[0] || res.url || "");
            if (/\/outline/.test(url)) {
              res.clone().text().then((t) => handleBody(url, t)).catch(() => {});
            }
          }
        } catch (e) {
          /* ignore */
        }
      }).catch(() => {});
      return p;
    };
  }

  // ---- XHR wrapper ----------------------------------------------------------
  const OrigOpen = XMLHttpRequest.prototype.open;
  const OrigSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__waiUrl = url;
    return OrigOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener("load", function () {
      try {
        if (!/\/outline/.test(String(this.__waiUrl || ""))) return;
        const ct = this.getResponseHeader("content-type") || "";
        const rt = this.responseType;
        if (
          ct.indexOf("json") !== -1 &&
          (rt === "" || rt === "text" || rt === "json")
        ) {
          const body =
            rt === "json" ? JSON.stringify(this.response) : this.responseText;
          handleBody(this.__waiUrl, body);
        }
      } catch (e) {
        /* ignore */
      }
    });
    return OrigSend.apply(this, arguments);
  };

  // ---- request channel: detector asks for a segment's total -----------------
  window.addEventListener("message", function (e) {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.source !== "wai-cmd") return;
    if (d.cmd === "getTotal") {
      postTotal(d.contentId || currentContentId());
    }
  });
})();
