chrome.tabs.onCreated.addListener(function (tab) {
  if (!tab.url || tab.url === '' || tab.url === 'about:blank') {
    chrome.storage.session.get({ newTabIds: [] }, function (data) {
      data.newTabIds.push(tab.id);
      chrome.storage.session.set({ newTabIds: data.newTabIds });
    });
  }
});

chrome.tabs.onRemoved.addListener(function (tabId) {
  chrome.storage.session.get({ newTabIds: [] }, function (data) {
    const filtered = data.newTabIds.filter(function (id) { return id !== tabId; });
    chrome.storage.session.set({ newTabIds: filtered });
  });
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.action === 'closeTab' && sender.tab) {
    chrome.tabs.remove(sender.tab.id);
  }
  if (message.action === 'isNewTab' && sender.tab) {
    chrome.storage.session.get({ newTabIds: [] }, function (data) {
      sendResponse({ isNewTab: data.newTabIds.includes(sender.tab.id) });
    });
    return true;
  }
});
