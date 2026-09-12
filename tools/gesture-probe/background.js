self.probeEvents = [];
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type !== 'probe') return;
  probeEvents.push({ ...message, tabId: sender.tab?.id, url: sender.url });
  if (probeEvents.length > 2000) probeEvents.shift();
  if (message.close && new URL(sender.url).pathname === '/probe-close') {
    chrome.tabs.remove(sender.tab.id);
  }
});
