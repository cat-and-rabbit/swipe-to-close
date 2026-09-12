(() => {
  const webURL = url => /^https?:\/\//.test(url || '');
  const blankURL = url => !url || url === 'about:blank' || /^chrome:\/\/newtab\/?$/.test(url);

  function createTabManager(api) {
    const queues = new Map();
    const key = id => `tab:${id}`;
    function serial(name, task) {
      const result = (queues.get(name) || Promise.resolve()).catch(() => {}).then(task);
      queues.set(name, result);
      result.finally(() => { if (queues.get(name) === result) queues.delete(name); }).catch(() => {});
      return result;
    }
    const read = async id => (await api.storage.get(key(id)))[key(id)];
    const save = (id, state) => api.storage.set({ [key(id)]: state });
    const validSender = sender => sender.tab && sender.frameId === 0 && sender.documentId &&
      (!sender.documentLifecycle || sender.documentLifecycle === 'active');

    function initialize(state, message, sender) {
      if (!state.rootKey && state.firstDocument === sender.documentId) {
        const maxInitialLength = state.blankStart ? 2 : 1;
        if (!message.initialKey || message.initialLength < 1 || message.initialLength > maxInitialLength) {
          state.status = 'excluded';
        } else {
          state.rootKey = message.initialKey;
          state.status = 'ready';
        }
      }
      if (state.nextRootDocument === sender.documentId && message.initialKey) {
        state.rootKey = message.initialKey;
        state.firstDocument = sender.documentId;
        state.nextRootDocument = null;
        state.status = 'ready';
      }
    }

    return {
      created(tab) {
        return serial(key(tab.id), async () => {
          if (await read(tab.id)) return;
          await save(tab.id, { status: 'pending', blankStart: ['about:blank', 'chrome://newtab/', 'chrome://newtab'].includes(tab.pendingUrl || tab.url),
            rootKey: null, firstDocument: null, currentDocument: null, nextRootDocument: null });
        });
      },
      committed(details) {
        if (details.frameId !== 0) return Promise.resolve();
        return serial(key(details.tabId), async () => {
          const state = await read(details.tabId);
          if (!state || state.status === 'excluded') return;
          const previousDocument = state.currentDocument;
          state.currentDocument = details.documentId;
          if (webURL(details.url)) {
            if (!state.firstDocument) state.firstDocument = details.documentId;
            const replacement = state.replacement;
            if (replacement && replacement.documentId === previousDocument &&
                (replacement.url === details.url || details.transitionQualifiers?.includes('server_redirect'))) {
              state.nextRootDocument = details.documentId;
            }
          } else if (!state.firstDocument) {
            if (blankURL(details.url)) state.blankStart = true;
            else state.status = 'excluded';
          }
          state.replacement = null;
          await save(details.tabId, state);
        });
      },
      removed(id) { return serial(key(id), () => api.storage.remove(key(id))); },
      replaced(added, removed) {
        // A replaced/prerendered tab has an unverified history. Never invent a root.
        return Promise.all([serial(key(added), () => api.storage.remove(key(added))),
          serial(key(removed), () => api.storage.remove(key(removed)))]);
      },
      message(message, sender) {
        if (!validSender(sender)) return Promise.resolve({ status: 'excluded' });
        const id = sender.tab.id;
        return serial(key(id), async () => {
          const state = await read(id);
          if (!state || !state.firstDocument) return { status: 'pending' };
          if (state.status === 'excluded') return { status: 'excluded' };
          if (message.type === 'sync') {
            initialize(state, message, sender);
            await save(id, state);
            return { status: state.status, rootKey: state.rootKey };
          }
          if (message.type === 'replaceRoot') {
            if (message.key === state.rootKey && sender.documentId === state.currentDocument && webURL(message.url)) {
              state.replacement = { documentId: sender.documentId, url: message.url };
              await save(id, state);
            }
            return { status: state.status };
          }
          if (message.type === 'cancelReplacement') {
            if (sender.documentId === state.currentDocument) {
              state.replacement = null;
              await save(id, state);
            }
            return { status: state.status };
          }
          if (message.type !== 'close' || state.status !== 'ready' || message.key !== state.rootKey ||
              sender.documentId !== state.currentDocument) return { closed: false };

          return serial(`window:${sender.tab.windowId}`, async () => {
            const guardKey = `window:${sender.tab.windowId}`;
            const guard = (await api.storage.get(guardKey))[guardKey] || 0;
            if (!Number.isFinite(message.startedAt) || message.startedAt < guard || api.now() < guard) return { closed: false };
            const tab = await api.getTab(id);
            const frame = await api.getFrame(id);
            if (!tab.active || frame?.documentId !== sender.documentId) return { closed: false };
            const confirmation = await api.confirm(id, sender.documentId, message);
            if (!confirmation?.confirmed) return { closed: false };
            // Persist before closing, including across service-worker restarts.
            await api.storage.set({ [guardKey]: api.now() + 1200 });
            state.status = 'closing';
            await save(id, state);
            try { await api.removeTab(id); return { closed: true }; }
            catch (error) { state.status = 'ready'; await save(id, state); throw error; }
          });
        });
      }
    };
  }
  globalThis.SwipeTabs = { createTabManager };
  if (typeof module !== 'undefined') module.exports = globalThis.SwipeTabs;
})();
