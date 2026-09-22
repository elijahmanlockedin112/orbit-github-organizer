// Minimal service worker: open the dashboard from the toolbar button or the
// Alt+Shift+O shortcut, and show it once right after install so setup is the
// first thing you see.
//
// Orbit deliberately does NOT override the new tab page. If you want it there,
// add this block to manifest.json and reload the extension:
//
//   "chrome_url_overrides": { "newtab": "dashboard.html" }

const DASHBOARD = 'dashboard.html';

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL(DASHBOARD) });
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL(DASHBOARD) });
  }
});
