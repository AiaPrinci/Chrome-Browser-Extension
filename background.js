const RULE_ID = 1;

async function registerPdfRedirectRule() {
  const viewerUrl = chrome.runtime.getURL("viewer/viewer.html");

  const rule = {
  id: RULE_ID,
  priority: 1,

  action: {
    type: "redirect",
    redirect: {
      regexSubstitution: `${viewerUrl}?file=\\0`
    }
  },

  condition: {
    regexFilter: "^https?://.*\\.pdf(?:[?#].*)?$",
    resourceTypes: ["main_frame"]
  }
};

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = [RULE_ID];

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules: [rule]
  });
}

chrome.runtime.onInstalled.addListener(() => {
  registerPdfRedirectRule();
});

chrome.runtime.onStartup.addListener(() => {
  registerPdfRedirectRule();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "OPEN_LOCAL_PDF_VIEWER") {
    chrome.tabs.create({
      url: chrome.runtime.getURL("viewer/viewer.html?source=local")
    });
    sendResponse({ ok: true });
  }
  return true;
});