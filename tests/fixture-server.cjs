const http = require('node:http');
async function fixtureServer() {
  const server=http.createServer((req,res)=>{
    const port=server.address().port;
    if(req.url==='/redirect') {res.writeHead(302,{Location:'/article'});res.end();return;}
    const cross=`http://localhost:${port}/other`;
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end(`<!doctype html><html lang="ja"><meta charset="utf-8"><title>Swipe to Close 検証</title>
      <style>body{margin:48px;font:18px system-ui;line-height:1.8;color:#183047;background:#f6f8fc}a,button{margin:8px;display:inline-block}#horizontal{width:600px;overflow:auto;background:#dbe8f5}#wide{width:2000px;height:100px}pre{white-space:pre-wrap}</style>
      <script>window.beforeExtension={length:history.length,state:history.state};${req.url==='/router' ? "history.replaceState({router:{position:7}},'');" : ''}${req.url==='/instant-replace' ? "location.replace('"+cross+"');" : ''}</script>
      <h1>Swipe to Close 1.1 動作確認</h1><p>クリック不要で閉じる機能と、通常の「戻る」を確認するページです。</p>
      <div id="plain-area" style="height:100px">スワイプ確認領域（ここで戻る方向に2本指スワイプ）</div>
      <a id="blank" href="/article" target="_blank">新しいタブで開く</a>
      <a id="plain" href="/article">通常のリンク（⌘クリック・中クリック用）</a>
      <button id="open" onclick="window.open('/article','_blank')">window.open</button>
      <a id="opener" href="/article" target="_blank" rel="opener">opener付きリンク</a>
      <a id="cross" href="${cross}">別サイトへ移動</a><a id="same" href="/next">同じサイト内で移動</a>
      <button id="push" onclick="history.pushState({router:'detail'},'', '/detail')">SPAの履歴を追加</button>
      <button id="replace" onclick="location.replace('${cross}')">別サイトへ置換</button>
      <div id="horizontal"><div id="wide">横スクロール確認領域 → → → → →</div></div>
      ${req.url==='/frame' ? '<iframe src="/iframe" width="600" height="200"></iframe>' : ''}
      <div style="height:1800px">縦スクロール確認領域</div></html>`);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {server,base:`http://127.0.0.1:${server.address().port}`};
}
module.exports={fixtureServer};
