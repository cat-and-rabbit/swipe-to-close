(() => {
  let timer;
  let samples = [];
  const send = data => chrome.runtime.sendMessage({ type: 'probe', ...data });
  send({ event: 'load', key: navigation.currentEntry?.key, length: history.length });
  navigation.addEventListener('currententrychange', event => {
    send({ event: 'entry', from: event.from.key, key: navigation.currentEntry?.key });
  });
  window.addEventListener('wheel', event => {
    if (!event.isTrusted) return;
    clearTimeout(timer);
    samples.push({ x: event.deltaX, y: event.deltaY, mode: event.deltaMode,
      ctrl: event.ctrlKey, cancelable: event.cancelable, time: performance.now() });
    timer = setTimeout(() => {
      const x = samples.reduce((n, e) => n + e.x, 0);
      const y = samples.reduce((n, e) => n + Math.abs(e.y), 0);
      const reverse = samples.some(e => e.x > 5);
      const candidate = x < -180 && -x > y * 2 && !reverse && !samples.some(e => e.ctrl);
      const detail = { event: 'gesture', samples, x, y, candidate,
        activation: navigator.userActivation.hasBeenActive,
        close: candidate && location.pathname === '/probe-close' };
      send(detail);
      document.dispatchEvent(new CustomEvent('probe-result', { detail: JSON.stringify(detail) }));
      samples = [];
    }, 220);
  }, { passive: true });
})();
