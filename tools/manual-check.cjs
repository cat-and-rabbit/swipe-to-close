// Load the real extension into a disposable, visible Chrome profile.
const {chromium}=require('playwright');
const {fixtureServer}=require('../tests/fixture-server.cjs');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
(async()=>{
  const {server,base}=await fixtureServer();
  const output=fs.mkdtempSync(path.join(os.tmpdir(),'swipe-manual-'));
  const context=await chromium.launchPersistentContext(path.join(output,'profile'),{
    executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless:false,ignoreDefaultArgs:['--disable-extensions','--disable-back-forward-cache'],
    args:['--enable-unsafe-extension-debugging','--no-first-run']
  });
  const metrics=[];
  const record=value=>{
    metrics.push(value);fs.writeFileSync(path.join(output,'metrics.json'),JSON.stringify(metrics,null,2));
    console.log(JSON.stringify(value));
  };
  await context.addInitScript(()=>{
    let last=0;
    addEventListener('wheel',event=>{
      const now=Date.now();
      if(now-last>250)console.debug('SWIPE_TEST_START:'+JSON.stringify({at:now,x:event.deltaX,y:event.deltaY,activation:navigator.userActivation.hasBeenActive}));
      last=now;
    },{passive:true});
  });
  context.on('page',page=>{
    let start;
    page.on('console',message=>{
      if(message.text().startsWith('SWIPE_TEST_START:')) {
        start=JSON.parse(message.text().slice('SWIPE_TEST_START:'.length));
        record({event:'input',...start,url:page.url()});
      }
    });
    page.on('close',()=>record({event:'closed',url:page.url(),latencyMs:start?Date.now()-start.at:null}));
  });
  const cdp=await context.browser().newBrowserCDPSession();
  const extension=await cdp.send('Extensions.loadUnpacked',{path:path.resolve(__dirname,'..'),enableInIncognito:false});
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  // Include only temporary test-tab state; no access to the user's daily profile.
  const save=setInterval(async()=>{
    try {fs.writeFileSync(path.join(output,'state.json'),JSON.stringify(await worker.evaluate(()=>chrome.storage.session.get(null)),null,2));}catch{}
  },1000);
  const page=await context.newPage();await page.goto(base+'/source');await page.bringToFront();
  record({event:'ready',output,url:page.url(),version:context.browser().version(),extensionId:extension.id});
  const stop=async()=>{clearInterval(save);await context.close();server.close();process.exit();};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
})();
