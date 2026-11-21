"use strict";
(() => {
  // src/background.js
  async function toggle(tab) {
    if (!tab || tab.id == null) return { ok: false, error: "No tab" };
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      return { ok: true };
    } catch (e) {
      const error = String(e && e.message || e);
      try {
        await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#dc2626" });
        await chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
        await chrome.action.setTitle({ tabId: tab.id, title: "Precise Dimension can't run on this page (browser pages are off limits)" });
        setTimeout(() => {
          chrome.action.setBadgeText({ tabId: tab.id, text: "" }).catch(() => {
          });
          chrome.action.setTitle({ tabId: tab.id, title: "Precise Dimension (Alt+Shift+D)" }).catch(() => {
          });
        }, 3e3);
      } catch {
      }
      return { ok: false, error };
    }
  }
  chrome.action.onClicked.addListener((tab) => {
    toggle(tab);
  });
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== "pd:capture") return;
    const windowId = sender.tab ? sender.tab.windowId : chrome.windows.WINDOW_ID_CURRENT;
    chrome.tabs.captureVisibleTab(windowId, { format: "png" }).then(
      (dataUrl) => sendResponse({ ok: true, dataUrl }),
      (e) => sendResponse({ ok: false, error: String(e && e.message || e) })
    );
    return true;
  });
  self.__pdToggle = toggle;
  self.__pdToggleActive = async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return toggle(tab);
  };
})();
