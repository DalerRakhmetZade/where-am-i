/* Where Am I? popup logic */
const SETTINGS_KEY = "whereami:settings";
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
  return new Promise((resolve) => {
    chrome.storage.local.get(SETTINGS_KEY, (res) => {
      resolve(Object.assign({}, DEFAULT_SETTINGS, res[SETTINGS_KEY] || {}));
    });
  });
}
function setSettings(patch) {
  return getSettings().then((cur) => {
    const next = Object.assign({}, cur, patch);
    return new Promise((resolve) =>
      chrome.storage.local.set({ [SETTINGS_KEY]: next }, () => resolve(next))
    );
  });
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToTab(message) {
  const tab = await activeTab();
  if (!tab || !tab.id) return null;
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (e) {
    // Content script not present on this page.
    return null;
  }
}

function renderState(resp) {
  if (!resp || !resp.state) {
    $("pct").textContent = "—";
    $("sub").textContent = "No course page detected in this tab.";
    $("seg").textContent = "";
    return;
  }
  const s = resp.state;
  $("pct").textContent = Math.round(s.overall * 100) + "%";
  if (s.mode === "known") {
    $("sub").textContent = `Section ${s.currentStep} of ${s.learnedTotalSteps}`;
  } else {
    const more = s.hasMore ? " · more to unlock" : "";
    $("sub").textContent = `Section ${s.currentStep}${more} · calibrating…`;
  }
  $("seg").textContent = s.segmentTitle || "";
}

async function refresh() {
  const resp = await sendToTab({ type: "WAI_GET_STATE" });
  renderState(resp);
}

async function init() {
  const settings = await getSettings();
  $("enabled").checked = settings.enabled;
  $("position").value = settings.position;
  $("theme").value = settings.theme || "system";
  applyTheme(settings.theme || "system");

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
  // Track OS scheme changes while the popup is open in "system" mode.
  themeMql.addEventListener &&
    themeMql.addEventListener("change", () => {
      if (($("theme").value || "system") === "system") applyTheme("system");
    });

  refresh();
}

document.addEventListener("DOMContentLoaded", init);
