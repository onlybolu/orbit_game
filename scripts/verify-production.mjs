import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const root=resolve('dist');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff'};
const server=createServer(async(req,res)=>{
  try {
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(!pathname.startsWith('/orbit/'))throw Error('outside test mount');
    const path=resolve(root,pathname.slice(7)||'index.html');
    if(!path.startsWith(root))throw Error('outside root');
    res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream'});res.end(await readFile(path));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(done=>server.listen(4179,'127.0.0.1',done));
let browser;
try {
  browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{}),args:['--enable-unsafe-swiftshader']});
  const page=await browser.newPage();const errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4179/')&&!r.url().startsWith('data:'))external.push(r.url());});
  await page.goto('http://127.0.0.1:4179/orbit/');
  await page.getByRole('button',{name:'Start your journey'}).click();
  await page.locator('#boot').waitFor({state:'hidden'});
  await page.keyboard.press('ArrowUp');await page.waitForTimeout(500);
  assert.equal(await page.locator('#interface').getAttribute('data-screen'),'playing');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('PASS: production build plays under /orbit/ with no errors or external requests.');
}finally{await browser?.close();await new Promise(done=>server.close(done));}
