(function () {
  window.addEventListener('popstate', function (event) {
    if (event.state && event.state.__closeOnBack === true) {
      chrome.runtime.sendMessage({ action: 'closeTab' });
    }
  });

  if (sessionStorage.getItem('__closeOnBack_initialized')) return;

  chrome.runtime.sendMessage({ action: 'isNewTab' }, function (response) {
    if (!response || !response.isNewTab) return;
    sessionStorage.setItem('__closeOnBack_initialized', '1');
    history.replaceState({ __closeOnBack: true }, '');
    history.pushState(null, '');
  });
})();
