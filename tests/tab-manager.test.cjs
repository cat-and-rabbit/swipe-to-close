const test = require('node:test');
const assert = require('node:assert/strict');
const {createTabManager} = require('../tab-manager.js');
function setup() {
  const data = {}, removed = [], frames = new Map();
  let time = 10000;
  const api = {
    storage: {
      async get(key) { await Promise.resolve(); return structuredClone({[key]: data[key]}); },
      async set(values) { await Promise.resolve(); Object.assign(data, structuredClone(values)); },
      async remove(key) { delete data[key]; }
    }, now: () => time, getTab: async () => ({active: true}),
    getFrame: async id => ({documentId: frames.get(id)}),
    confirm: async () => ({confirmed: true}), removeTab: async id => {removed.push(id);}
  };
  const manager = createTabManager(api);
  const sender = (id, doc=`doc-${id}`) => ({tab:{id,windowId:1},frameId:0,documentId:doc,documentLifecycle:'active'});
  const commit = (id, doc=`doc-${id}`, url='https://test.example/') => {
    frames.set(id, doc);
    return manager.committed({tabId:id,frameId:0,documentId:doc,url});
  };
  const sync = (id, key=`root-${id}`, doc=`doc-${id}`, length=1) => manager.message({type:'sync',initialKey:key,initialLength:length},sender(id,doc));
  const ready = async id => {await manager.created({id,url:'https://test.example/'});await commit(id);await sync(id);};
  const close = (id, key=`root-${id}`, doc=`doc-${id}`) => manager.message({type:'close',key,gestureId:1,startedAt:time},sender(id,doc));
  return {manager,api,data,removed,frames,sender,commit,sync,ready,close,advance:ms=>time+=ms};
}
test('concurrent creation preserves every tab; registration and query are serialized', async () => {
  const f=setup();
  await Promise.all(Array.from({length:20},async(_,i)=>{
    const created=f.manager.created({id:i,url:'https://example.test/'});
    const committed=f.commit(i);
    const initialized=f.sync(i);
    await Promise.all([created,committed,initialized]);
    assert.equal(f.data[`tab:${i}`].rootKey,`root-${i}`);
  }));
  assert.equal(Object.keys(f.data).length,20);
});
test('query before registration is pending and may be retried',async()=>{
  const f=setup();assert.equal((await f.sync(1)).status,'pending');await f.ready(1);
  assert.equal((await f.sync(1)).status,'ready');
});
test('cross-origin navigation never replaces the root',async()=>{
  const f=setup();await f.ready(1);await f.commit(1,'other','https://other.example/');await f.sync(1,'other-key','other',2);
  assert.equal(f.data['tab:1'].rootKey,'root-1');assert.equal((await f.close(1,'other-key','other')).closed,false);
});
test('return to the original entry can close after reload or BFCache',async()=>{
  const f=setup();await f.ready(1);await f.commit(1,'other');await f.sync(1,'other-key','other',2);
  await f.commit(1,'restored');await f.sync(1,'root-1','restored',2);
  assert.equal((await f.close(1,'root-1','restored')).closed,true);
});
test('explicit root replacement can transfer the root across origins',async()=>{
  const f=setup();await f.ready(1);await f.manager.message({type:'replaceRoot',key:'root-1',url:'https://other.example/'},f.sender(1));
  await f.commit(1,'other','https://other.example/');await f.sync(1,'replacement','other');
  assert.equal(f.data['tab:1'].rootKey,'replacement');
});
test('a cancelled replacement does not transfer to an unrelated navigation',async()=>{
  const f=setup();await f.ready(1);await f.manager.message({type:'replaceRoot',key:'root-1',url:'https://cancelled.example/'},f.sender(1));
  await f.commit(1,'other','https://different.example/');await f.sync(1,'new-key','other',2);
  assert.equal(f.data['tab:1'].rootKey,'root-1');
});
test('unknown restored history is excluded',async()=>{
  const f=setup();await f.manager.created({id:1,url:'https://example.test/'});await f.commit(1);
  assert.equal((await f.sync(1,'key','doc-1',5)).status,'excluded');
});
test('stale documents and subframes cannot close a tab',async()=>{
  const f=setup();await f.ready(1);await f.commit(1,'new-document');
  assert.equal((await f.close(1)).closed,false);
  assert.equal((await f.manager.message({type:'close',key:'root-1'},{...f.sender(1,'new-document'),frameId:2})).status,'excluded');
  assert.deepEqual(f.removed,[]);
});
test('confirmation checks the current page again before closing',async()=>{
  const f=setup();await f.ready(1);f.api.confirm=async()=>({confirmed:false});
  assert.equal((await f.close(1)).closed,false);assert.deepEqual(f.removed,[]);
});
test('concurrent close requests in one window close only one tab',async()=>{
  const f=setup();await Promise.all([f.ready(1),f.ready(2)]);
  await Promise.all([f.close(1),f.close(2),f.close(1)]);
  assert.equal(f.removed.length,1);
});
test('state and close guard survive worker recreation',async()=>{
  const f=setup();await f.ready(1);await f.ready(2);await f.close(1);
  const restarted=createTabManager(f.api);
  assert.equal((await restarted.message({type:'close',key:'root-2',startedAt:f.api.now()},f.sender(2))).closed,false);
  f.advance(1500);assert.equal((await restarted.message({type:'close',key:'root-2',startedAt:f.api.now()},f.sender(2))).closed,true);
});
test('a momentum gesture that began during the guard stays blocked after it expires',async()=>{
  const f=setup();await f.ready(1);await f.ready(2);await f.close(1);const startedAt=f.api.now()+100;
  f.advance(2500);
  assert.equal((await f.manager.message({type:'close',key:'root-2',startedAt},f.sender(2))).closed,false);
});
test('deletion queued after creation leaves no stale record',async()=>{
  const f=setup();await Promise.all([f.manager.created({id:1}),f.manager.removed(1)]);
  assert.equal(f.data['tab:1'],undefined);
});
