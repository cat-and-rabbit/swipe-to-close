// A separate Chrome profile and local-only pages for physical trackpad checks.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

(async () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'swipe-probe-'));
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html lang="ja"><meta charset="utf-8"><title>スワイプ動作検証</title>
      <style>body{font:18px system-ui;margin:50px;line-height:1.7;background:#f6f8fc;color:#192535}a{display:block;padding:10px}pre{white-space:pre-wrap}.horizontal{width:600px;overflow:auto;background:#dce6f5}.wide{width:1800px;padding:20px}</style>
      <h1>スワイプ動作検証</h1>
      ${req.url === '/probe-close' ? '<p>このページ内をクリックせず、Macの「戻る」方向に2本指でスワイプしてください。成功すると、この検証タブだけが閉じます。</p>' : '<p>戻る方向・縦スクロール・ピンチ・途中で逆向きに戻す操作を試せます。ここではタブは閉じません。</p>'}
      <a href="/probe-close" target="_blank">クローズ確認用の新規タブを開く</a>
      <a href="/probe-log" target="_blank">入力確認用の新規タブを開く（閉じません）</a>
      <div class="horizontal"><div class="wide">横スクロール確認領域 → → →</div></div>
      <pre id="result">入力待ち</pre><div style="height:1800px">縦スクロール確認領域</div>
      <script>document.addEventListener('probe-result', e => {let d=JSON.parse(e.detail);document.getElementById('result').textContent=JSON.stringify(d,null,2)});</script></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const context = await chromium.launchPersistentContext(path.join(output, 'profile'), {
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: false, ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging', '--no-first-run']
  });
  const cdp = await context.browser().newBrowserCDPSession();
  await cdp.send('Extensions.loadUnpacked', { path: path.resolve(__dirname, 'gesture-probe'), enableInIncognito: false });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/probe-log`);
  console.log(JSON.stringify({ output, url: page.url(), version: context.browser().version() }));
  const save = setInterval(async () => {
    try { fs.writeFileSync(path.join(output, 'events.json'), JSON.stringify(await worker.evaluate(() => probeEvents), null, 2)); } catch {}
  }, 1500);
  const stop = async () => { clearInterval(save); await context.close(); server.close(); process.exit(); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
})();
