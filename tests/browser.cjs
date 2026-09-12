const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {fixtureServer}=require('./fixture-server.cjs');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
  const {server,base}=await fixtureServer();
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'swipe-browser-test-'));
  const context=await chromium.launchPersistentContext(profile,{
    ...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),
    headless:true,ignoreDefaultArgs:['--disable-extensions','--disable-back-forward-cache'],
    args:['--enable-unsafe-extension-debugging']
  });
  const results=[];
  try {
    const bc=await context.browser().newBrowserCDPSession();
    await bc.send('Extensions.loadUnpacked',{path:process.env.EXTENSION_PATH || path.resolve(__dirname,'..'),enableInIncognito:false});
    let sw=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
    const raw=async(page,expression)=>{
      const cdp=await context.newCDPSession(page);
      try {const result=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,userGesture:false});
        if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result.value;
      }finally{await cdp.detach().catch(()=>{});}
    };
    const snapshot=page=>raw(page,'({key:navigation.currentEntry.key,length:history.length,state:history.state,activation:navigator.userActivation.hasBeenActive,initial:window.beforeExtension})');
    const state=async id=>(await sw.evaluate(id=>chrome.storage.session.get(`tab:${id}`),id))[`tab:${id}`];
    const tab=async(route='/article')=>{
      const popup=context.waitForEvent('page');
      const created=await sw.evaluate(url=>chrome.tabs.create({url}),base+route);
      const page=await popup;await page.waitForLoadState();await pause(300);return {page,id:created.id};
    };
    const activate=async page=>{await page.bringToFront();await pause(300);};
    const wheel=async(page,values=[-60,-80,-100,-100])=>{
      await page.mouse.move(80,220);
      for(const x of values){if(page.isClosed())break;await page.mouse.wheel(x,0);await pause(20);}
      await pause(350);
    };
    const clearGuard=()=>sw.evaluate(async()=>{
      const all=await chrome.storage.session.get(null);await chrome.storage.session.remove(Object.keys(all).filter(k=>k.startsWith('window:')));
    });
    const test=async(name,fn)=>{
      await clearGuard();
      try{await fn();results.push({name,passed:true});console.log('PASS',name);}
      catch(e){results.push({name,passed:false,error:e.stack});console.error('FAIL',name,e.message);}
    };
    console.log('Chrome',context.browser().version());
    await test('new tab closes without activation; history and storage unchanged',async()=>{
      const {page,id}=await tab();const before=await snapshot(page);assert.equal(before.activation,false);assert.equal(before.length,1);
      assert.equal((await state(id)).rootKey,before.key);
      assert.equal(await raw(page,"sessionStorage.getItem('__closeOnBack_initialized')"),null);
      await wheel(page);assert.equal(page.isClosed(),true);
    });
    await test('blank-start tab cancels native back only at its verified starting entry',async()=>{
      const page=await context.newPage();await page.goto(base+'/blank-start');await pause(350);
      const root=(await snapshot(page)).key;
      await raw(page,"addEventListener('wheel',e=>queueMicrotask(()=>window.lastWheelDefault=e.defaultPrevented))");
      await page.mouse.move(80,220);await page.mouse.wheel(-5,0);await pause(180);
      assert.equal(await raw(page,'window.lastWheelDefault'),true);
      await page.locator('#same').click();await page.waitForLoadState();await pause(200);
      await raw(page,"addEventListener('wheel',e=>queueMicrotask(()=>window.lastWheelDefault=e.defaultPrevented))");
      await page.mouse.move(80,220);await page.mouse.wheel(-5,0);await pause(180);
      assert.equal(await raw(page,'window.lastWheelDefault'),false);
      await raw(page,'history.back()');await pause(350);assert.equal((await snapshot(page)).key,root);
      await wheel(page);assert.equal(page.isClosed(),true);
    });
    const source=await tab('/source');
    // Reproduce the v1.0 flag that window.open copies from an existing parent.
    await raw(source.page,"sessionStorage.setItem('__closeOnBack_initialized','1')");
    for(const [name,selector,options] of [['target_blank','#blank',{}],['command_click','#plain',{modifiers:['Meta']}],['middle_click','#plain',{button:'middle'}],['window_open','#open',{}],['explicit_opener','#opener',{}]]) {
      await test(name+' closes a link tab without clicking it',async()=>{
        await activate(source.page);
        const next=context.waitForEvent('page');await source.page.locator(selector).click(options);
        const child=await next;await child.waitForLoadState();await activate(child);
        if(name==='window_open'||name==='explicit_opener') {
          assert.equal(await raw(child,"sessionStorage.getItem('__closeOnBack_initialized')"),'1');
        }
        assert.equal((await snapshot(child)).activation,false);await wheel(child);assert.equal(child.isClosed(),true);
      });
    }
    await test('vertical scroll does not close, subsequent back swipe does',async()=>{
      const {page}=await tab();await page.mouse.wheel(0,500);await pause(200);assert.equal(page.isClosed(),false);
      await wheel(page);assert.equal(page.isClosed(),true);
    });
    await test('horizontal scroller owns the gesture even at its left edge',async()=>{
      const {page}=await tab();const box=await page.locator('#horizontal').boundingBox();await page.mouse.move(box.x+40,box.y+40);
      for(let i=0;i<5;i++){await page.mouse.wheel(-100,0);await pause(20);}await pause(300);assert.equal(page.isClosed(),false);
      await wheel(page);assert.equal(page.isClosed(),true);
    });
    await test('reversing a pending gesture cancels it',async()=>{
      const {page}=await tab();await wheel(page,[-100,-100,-100,100]);assert.equal(page.isClosed(),false);
      await wheel(page);assert.equal(page.isClosed(),true);
    });
    await test('pinch/modifier input never closes a tab',async()=>{
      const {page}=await tab();await page.keyboard.down('Control');await wheel(page);await page.keyboard.up('Control');
      assert.equal(page.isClosed(),false);
    });
    await test('iframe wheel input is excluded',async()=>{
      const {page}=await tab('/frame');const box=await page.locator('iframe').boundingBox();
      await page.mouse.move(box.x+80,box.y+80);
      for(let i=0;i<4;i++)await page.mouse.wheel(-100,0);
      await pause(350);assert.equal(page.isClosed(),false);
    });
    await test('cross-origin page does not close; returning to root does',async()=>{
      const {page,id}=await tab();const root=(await snapshot(page)).key;
      await page.locator('#cross').click();await page.waitForLoadState();await pause(300);
      assert.equal((await state(id)).rootKey,root);await wheel(page);assert.equal(page.isClosed(),false);
      await raw(page,'history.back()');await pause(400);assert.equal((await snapshot(page)).key,root);
      await wheel(page);assert.equal(page.isClosed(),true);
    });
    await test('same-origin history and forward entries preserve the root',async()=>{
      const {page}=await tab();const root=(await snapshot(page)).key;
      await page.locator('#same').click();await page.waitForLoadState();await pause(200);await wheel(page);assert.equal(page.isClosed(),false);
      await raw(page,'history.back()');await pause(400);assert.equal((await snapshot(page)).key,root);
      assert.equal((await snapshot(page)).length,2);await wheel(page);assert.equal(page.isClosed(),true);
    });
    await test('SPA pushState and hash entries do not become new roots',async()=>{
      const {page}=await tab();const root=(await snapshot(page)).key;
      await page.locator('#push').click();await wheel(page);assert.equal(page.isClosed(),false);
      await raw(page,'history.back()');await pause(200);
      await raw(page,"location.hash='section'");await pause(150);await wheel(page);assert.equal(page.isClosed(),false);
      await raw(page,'history.back()');await pause(200);assert.equal((await snapshot(page)).key,root);
      await wheel(page);assert.equal(page.isClosed(),true);
    });
    await test('reload retains root and site history state',async()=>{
      const {page}=await tab('/router');const root=(await snapshot(page)).key;
      assert.deepEqual((await snapshot(page)).state,{router:{position:7}});
      await page.reload();await pause(350);assert.equal((await snapshot(page)).key,root);
      assert.deepEqual((await snapshot(page)).state,{router:{position:7}});
      await wheel(page);assert.equal(page.isClosed(),true);
    });
    await test('HTTP redirect initializes at the final document',async()=>{
      const {page}=await tab('/redirect');assert.equal(new URL(page.url()).pathname,'/article');await wheel(page);assert.equal(page.isClosed(),true);
    });
    await test('explicit cross-origin replacement transfers the root',async()=>{
      const {page,id}=await tab();await page.locator('#replace').click();await page.waitForLoadState();await pause(350);
      assert.equal((await state(id)).rootKey,(await snapshot(page)).key);await wheel(page);assert.equal(page.isClosed(),true);
    });
    await test('an immediate JavaScript redirect can initialize its replacement',async()=>{
      const {page,id}=await tab('/instant-replace');await pause(350);
      assert.equal((await state(id)).rootKey,(await snapshot(page)).key);await wheel(page);assert.equal(page.isClosed(),true);
    });
    await test('simultaneous creation preserves 16 records, followed by clean removal',async()=>{
      const created=await sw.evaluate(base=>Promise.all(Array.from({length:16},(_,i)=>chrome.tabs.create({url:base+'/burst-'+i,active:false}))),base);
      await pause(700);
      for(const item of created){assert.equal((await state(item.id)).status,'ready');}
      await sw.evaluate(ids=>chrome.tabs.remove(ids),created.map(t=>t.id));await pause(200);
      for(const item of created)assert.equal(await state(item.id),undefined);
    });
    await test('remaining momentum cannot close the newly revealed tab',async()=>{
      const parent=await tab();const child=await tab();await wheel(child.page);assert.equal(child.page.isClosed(),true);
      await parent.page.bringToFront(); // No quiet interval: simulate the continuing physical stream.
      for(let i=0;i<18;i++){await parent.page.mouse.wheel(-100,0);await pause(30);}
      await pause(200);assert.equal(parent.page.isClosed(),false);
    });
    await test('worker restart retains roots',async()=>{
      const {page,id}=await tab();const root=(await state(id)).rootKey;
      const workerURL=sw.url();
      const control=await context.newCDPSession(page);
      let versions=[];
      control.on('ServiceWorker.workerVersionUpdated',event=>{versions.push(...event.versions);});
      await control.send('ServiceWorker.enable');await pause(250);
      const version=versions.find(v=>v.scriptURL===workerURL&&v.status==='activated');
      assert.ok(version,'service-worker version should be observable');
      await control.send('ServiceWorker.stopWorker',{versionId:version.versionId});await pause(250);
      // A wheel sends an extension message and restarts the worker without activating the page.
      await wheel(page);
      const states=versions.filter(v=>v.versionId===version.versionId).map(v=>v.runningStatus);
      console.log('Worker lifecycle:',states.join(' -> '));
      assert.ok(states.includes('stopped'),'worker actually stopped');
      assert.ok(states.slice(states.indexOf('stopped')+1).includes('running'),'worker restarted');
      sw=context.serviceWorkers().find(w=>w.url()===workerURL)||sw;
      assert.equal(page.isClosed(),true);assert.ok(root);
    });
  }finally{
    fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/browser.json',JSON.stringify(results,null,2));
    await context.close();await new Promise(r=>server.close(r));fs.rmSync(profile,{recursive:true,force:true});
  }
  const failed=results.filter(x=>!x.passed);console.log(`${results.length-failed.length}/${results.length} browser checks passed`);if(failed.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
