/* WhereAmI options page */
const SETTINGS_KEY = "whereami:settings";
const MODULE_PREFIX = "whereami:module:";
const DEFAULT_SETTINGS = {
  enabled: true,
  position: "bottom",
  theme: "system",
  minimized: false,
};
const $ = (id) => document.getElementById(id);

const themeMql = window.matchMedia("(prefers-color-scheme: dark)");
function applyTheme(theme) {
  const effective =
    theme === "light" || theme === "dark"
      ? theme
      : themeMql.matches
      ? "dark"
      : "light";
  document.body.classList.toggle("theme-light", effective === "light");
  document.body.classList.toggle("theme-dark", effective === "dark");
}

function getSettings() {
  return new Promise((resolve) =>
    chrome.storage.local.get(SETTINGS_KEY, (res) =>
      resolve(Object.assign({}, DEFAULT_SETTINGS, res[SETTINGS_KEY] || {}))
    )
  );
}
function setSettings(patch) {
  return getSettings().then(
    (cur) =>
      new Promise((resolve) =>
        chrome.storage.local.set(
          { [SETTINGS_KEY]: Object.assign({}, cur, patch) },
          resolve
        )
      )
  );
}

async function init() {
  const s = await getSettings();
  $("enabled").checked = s.enabled;
  $("position").value = s.position;
  $("theme").value = s.theme || "system";
  applyTheme(s.theme || "system");

  $("enabled").addEventListener("change", (e) =>
    setSettings({ enabled: e.target.checked })
  );
  $("position").addEventListener("change", (e) =>
    setSettings({ position: e.target.value })
  );
  $("theme").addEventListener("change", (e) => {
    applyTheme(e.target.value);
    setSettings({ theme: e.target.value });
  });
  themeMql.addEventListener &&
    themeMql.addEventListener("change", () => {
      if (($("theme").value || "system") === "system") applyTheme("system");
    });

  $("resetAll").addEventListener("click", () => {
    chrome.storage.local.get(null, (all) => {
      const keys = Object.keys(all).filter((k) => k.startsWith(MODULE_PREFIX));
      chrome.storage.local.remove(keys, () => {
        $("resetMsg").textContent = `Cleared ${keys.length} module(s).`;
      });
    });
  });
}

document.addEventListener("DOMContentLoaded", init);
