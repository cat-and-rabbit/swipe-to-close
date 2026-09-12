importScripts('tab-manager.js');

const tabs = SwipeTabs.createTabManager({
  storage: chrome.storage.session,
  now: Date.now,
  getTab: id => chrome.tabs.get(id),
  getFrame: tabId => chrome.webNavigation.getFrame({ tabId, frameId: 0 }),
  confirm: (id, documentId, message) => chrome.tabs.sendMessage(id,
    { type: 'confirmClose', key: message.key, gestureId: message.gestureId }, { documentId }),
  removeTab: id => chrome.tabs.remove(id)
});
const handle = promise => promise.catch(error => console.warn('Swipe to Close:', error.message));

chrome.tabs.onCreated.addListener(tab => handle(tabs.created(tab)));
chrome.tabs.onRemoved.addListener(id => handle(tabs.removed(id)));
chrome.tabs.onReplaced.addListener((added, removed) => handle(tabs.replaced(added, removed)));
chrome.webNavigation.onCommitted.addListener(details => handle(tabs.committed(details)));
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!['sync', 'replaceRoot', 'cancelReplacement', 'close'].includes(message?.type)) return;
  tabs.message(message, sender).then(respond, () => respond({ status: 'pending', closed: false }));
  return true;
});
