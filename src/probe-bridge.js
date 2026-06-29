/*
 * WhereAmI — bridge between the MAIN-world network probe and the content script.
 * Receives the true sub-section total for the current Segment (read from the
 * course outline API) via window.postMessage, and lets the detector request it.
 */
(function () {
  const NS = (window.WhereAmI = window.WhereAmI || {});

  NS.segmentTotals = {}; // contentId -> { total, requiredTotal, ... }
  let totalResolvers = []; // { contentId, resolve }

  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.source !== "wai-probe" || d.kind !== "total") return;

    NS.segmentTotals[String(d.contentId)] = d;
    if (typeof NS._onTotal === "function") NS._onTotal(d);
    const keep = [];
    totalResolvers.forEach((r) => {
      if (String(r.contentId) === String(d.contentId)) r.resolve(d);
      else keep.push(r);
    });
    totalResolvers = keep;
  });

  // Ask the probe for the true sub-section total of a Segment (by content id).
  // Resolves with the cached value if already known.
  NS.requestTotal = function (contentId) {
    const cid = String(contentId);
    if (NS.segmentTotals[cid]) return Promise.resolve(NS.segmentTotals[cid]);
    return new Promise((resolve) => {
      totalResolvers.push({ contentId: cid, resolve });
      window.postMessage({ source: "wai-cmd", cmd: "getTotal", contentId: cid }, "*");
      setTimeout(() => resolve(NS.segmentTotals[cid] || null), 1200);
    });
  };
})();
