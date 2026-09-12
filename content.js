(() => {
  if (window !== window.top || !globalThis.navigation?.currentEntry) return;
  const { BackGesture, QUIET_MS, SETTLE_MS } = SwipeGesture;
  const initialKey = navigation.currentEntry.key;
  const initialLength = history.length;
  const gesture = new BackGesture();
  let rootKey = null;
  let quietTimer, settleTimer, activationTimer;
  let syncing = false;
  let gestureId = 0;
  let gestureStartedAt = 0;
  let inFlight = false;
  let suppressed = false;
  const atRoot = () => rootKey && navigation.currentEntry?.key === rootKey;
  const send = message => chrome.runtime.sendMessage(message);

  function reset() {
    clearTimeout(quietTimer);
    clearTimeout(settleTimer);
    settleTimer = null;
    gesture.reset();
    gestureStartedAt = 0;
    gestureId++;
  }
  async function sync() {
    if (syncing) return;
    syncing = true;
    try {
      for (const delay of [0, 50, 150, 400, 1000]) {
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        const result = await send({ type: 'sync', initialKey, initialLength });
        if (result?.status !== 'pending') { rootKey = result?.rootKey || null; break; }
      }
    } catch { rootKey = null; }
    finally { syncing = false; }
  }

  // Even at the edge, a horizontal scroller owns the whole gesture.
  function horizontalOwner(event) {
    for (const element of event.composedPath()) {
      if (!(element instanceof Element)) continue;
      const style = getComputedStyle(element);
      if (element.scrollWidth > element.clientWidth + 2 &&
          (/auto|scroll|overlay/.test(style.overflowX) ||
           (element === document.scrollingElement && !/hidden|clip/.test(style.overflowX)))) return true;
      if (element.matches('input[type="range"], [role="slider"], canvas, video')) return true;
    }
    return false;
  }
  function suppressUntilQuiet() {
    suppressed = true;
    reset();
    clearTimeout(activationTimer);
    activationTimer = setTimeout(() => { suppressed = false; }, 250);
  }
  async function close() {
    if (inFlight || suppressed || !atRoot() || document.visibilityState !== 'visible' || !gesture.qualifies()) return;
    inFlight = true;
    try { await send({ type: 'close', key: rootKey, gestureId, startedAt: gestureStartedAt }); }
    catch { rootKey = null; }
    finally { inFlight = false; suppressUntilQuiet(); }
  }

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type === 'confirmClose') {
      respond({ confirmed: inFlight && !suppressed && message.gestureId === gestureId &&
        message.key === navigation.currentEntry?.key && atRoot() && document.visibilityState === 'visible' && document.hasFocus() });
    }
  });
  window.addEventListener('wheel', event => {
    if (!event.isTrusted) return;
    if (!atRoot() || document.visibilityState !== 'visible') { reset(); return; }
    const blocked = event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
      event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL || horizontalOwner(event);
    // At our verified root, stop Chrome starting its native back animation first.
    // This also covers a preceding new-tab/about:blank entry. Elsewhere we never cancel.
    if (!blocked && event.deltaX < 0 && -event.deltaX > Math.abs(event.deltaY) * 1.3 && event.cancelable) event.preventDefault();
    if (suppressed) { suppressUntilQuiet(); return; }
    if (!gestureStartedAt) gestureStartedAt = Date.now();
    const settling = gesture.add({ x: event.deltaX, y: event.deltaY, time: performance.now(), blocked });
    clearTimeout(quietTimer);
    if (!gesture.qualifies()) { clearTimeout(settleTimer); settleTimer = null; }
    if (settling && !settleTimer) settleTimer = setTimeout(close, SETTLE_MS);
    quietTimer = setTimeout(() => { if (gesture.qualifies()) close(); else reset(); }, QUIET_MS);
  }, { passive: false });

  navigation.addEventListener('navigate', event => {
    if (event.navigationType === 'replace') {
      // The page may redirect before the asynchronous initial sync has answered.
      send({ type: 'replaceRoot', key: navigation.currentEntry?.key, url: event.destination.url }).catch(() => {});
    } else send({ type: 'cancelReplacement' }).catch(() => {});
    reset();
  });
  navigation.addEventListener('navigateerror', () => send({ type: 'cancelReplacement' }).catch(() => {}));
  navigation.addEventListener('currententrychange', reset);
  window.addEventListener('pageshow', () => { reset(); sync(); });
  window.addEventListener('pagehide', () => { reset(); rootKey = null; });
  document.addEventListener('visibilitychange', () => {
    suppressUntilQuiet();
    if (document.visibilityState === 'visible') sync();
  });
  sync();
})();
