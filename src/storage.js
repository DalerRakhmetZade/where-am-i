/*
 * WhereAmI — persistent storage layer (chrome.storage.local)
 *
 * Stores per-module learning data so that after one full pass the extension
 * can show a true "Step X of Y" total even though the page never reveals it.
 */
(function () {
  const NS = (window.WhereAmI = window.WhereAmI || {});

  const SETTINGS_KEY = "whereami:settings";
  const MODULE_PREFIX = "whereami:module:";

  const DEFAULT_SETTINGS = {
    enabled: true,
    position: "bottom", // "top" | "bottom" | "left" | "right"
    theme: "system", // "system" | "dark" | "light"
    minimized: false,
    pillPos: null, // {left, top} when the minimized pill has been dragged
  };

  function moduleKey(id) {
    return MODULE_PREFIX + id;
  }

  // Default record describing what we have learned about one module.
  function emptyModule(id) {
    return {
      id,
      learnedTotalSteps: 0, // best estimate of total gated steps (0 = unknown)
      maxStepReached: 0, // furthest step the user has ever reached
      completed: false, // whether the module was finished at least once
      updatedAt: Date.now(),
    };
  }

  // True only while the extension context is valid. After the extension is
  // reloaded/updated, an old content script lingers in open tabs and any
  // chrome.* call throws "Extension context invalidated"; we guard against that.
  function extAlive() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }
  NS.extAlive = extAlive;

  async function getSettings() {
    return new Promise((resolve) => {
      if (!extAlive()) return resolve(Object.assign({}, DEFAULT_SETTINGS));
      try {
        chrome.storage.local.get(SETTINGS_KEY, (res) => {
          if (chrome.runtime.lastError || !res) {
            return resolve(Object.assign({}, DEFAULT_SETTINGS));
          }
          resolve(Object.assign({}, DEFAULT_SETTINGS, res[SETTINGS_KEY] || {}));
        });
      } catch (e) {
        resolve(Object.assign({}, DEFAULT_SETTINGS));
      }
    });
  }

  async function setSettings(patch) {
    const current = await getSettings();
    const next = Object.assign({}, current, patch);
    return new Promise((resolve) => {
      if (!extAlive()) return resolve(next);
      try {
        chrome.storage.local.set({ [SETTINGS_KEY]: next }, () => resolve(next));
      } catch (e) {
        resolve(next);
      }
    });
  }

  async function getModule(id) {
    const key = moduleKey(id);
    return new Promise((resolve) => {
      if (!extAlive()) return resolve(emptyModule(id));
      try {
        chrome.storage.local.get(key, (res) => {
          if (chrome.runtime.lastError || !res) return resolve(emptyModule(id));
          resolve(res[key] || emptyModule(id));
        });
      } catch (e) {
        resolve(emptyModule(id));
      }
    });
  }

  async function saveModule(record) {
    record.updatedAt = Date.now();
    const key = moduleKey(record.id);
    return new Promise((resolve) => {
      if (!extAlive()) return resolve(record);
      try {
        chrome.storage.local.set({ [key]: record }, () => resolve(record));
      } catch (e) {
        resolve(record);
      }
    });
  }

  // Merge new observations into the stored module record.
  async function updateModule(id, { currentStep, atEnd } = {}) {
    const record = await getModule(id);
    if (typeof currentStep === "number") {
      record.maxStepReached = Math.max(record.maxStepReached, currentStep);
    }
    if (atEnd) {
      record.completed = true;
      // When the user reaches the end, the furthest step IS the true total.
      record.learnedTotalSteps = Math.max(
        record.learnedTotalSteps,
        record.maxStepReached
      );
    }
    return saveModule(record);
  }

  async function resetModule(id) {
    return saveModule(emptyModule(id));
  }

  async function resetAll() {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (all) => {
        const keys = Object.keys(all).filter((k) =>
          k.startsWith(MODULE_PREFIX)
        );
        chrome.storage.local.remove(keys, () => resolve(keys.length));
      });
    });
  }

  NS.storage = {
    DEFAULT_SETTINGS,
    getSettings,
    setSettings,
    getModule,
    saveModule,
    updateModule,
    resetModule,
    resetAll,
  };

  // Allow the popup/options pages to listen for changes.
  NS.onSettingsChanged = function (cb) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[SETTINGS_KEY]) {
        cb(changes[SETTINGS_KEY].newValue);
      }
    });
  };
})();
