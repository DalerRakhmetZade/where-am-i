/*
 * WhereAmI — content script entry point.
 * Wires the detector to the UI, applies settings, and answers popup queries.
 */
(function () {
  const NS = (window.WhereAmI = window.WhereAmI || {});

  let detector = null;
  let ui = null;
  let settings = null;

  async function init() {
    settings = await NS.storage.getSettings();

    if (!settings.enabled) {
      teardown();
      return;
    }

    if (!detector) {
      detector = new NS.Detector().start();
      detector.onChange((state) => {
        if (ui) ui.render(state);
      });
    }
    if (!ui) {
      ui = new NS.ProgressUI();
      ui.mount(settings);
    } else {
      ui.updateSettings(settings);
    }

    // Render once immediately.
    ui.render(detector.getState());
  }

  function teardown() {
    if (ui) {
      ui.unmount();
      ui = null;
    }
    if (detector) {
      detector.destroy();
      detector = null;
    }
  }

  // React to settings changes from the popup / options page live.
  NS.onSettingsChanged(async (newSettings) => {
    settings = Object.assign({}, NS.storage.DEFAULT_SETTINGS, newSettings);
    if (!settings.enabled) {
      teardown();
      return;
    }
    if (!detector || !ui) {
      await init();
    } else {
      ui.updateSettings(settings);
      ui.render(detector.getState());
    }
  });

  // Messages from the popup.
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;
    switch (msg.type) {
      case "WAI_GET_STATE":
        sendResponse({
          ok: true,
          state: detector ? detector.getState() : null,
          enabled: settings ? settings.enabled : true,
        });
        break;
      default:
        sendResponse({ ok: false, error: "unknown message" });
    }
    return true;
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
