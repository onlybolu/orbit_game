import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('artifacts',{recursive:true});
const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-gpu-sandbox','--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto('http://127.0.0.1:5173/?test');
await page.waitForTimeout(5000);
await page.screenshot({path:'artifacts/menu-desktop.png'});
console.log(JSON.stringify({errors:[...new Set(errors)],body:(await page.locator('body').innerText()).slice(0,1500)}));
if(await page.evaluate(()=>Boolean(window.__ORBIT__))) {
  await page.getByRole('button',{name:'WORLDS',exact:true}).click();await page.screenshot({path:'artifacts/worlds-desktop.png'});
  await page.getByRole('button',{name:'ATELIER',exact:true}).click();await page.screenshot({path:'artifacts/atelier-desktop.png'});
  await page.evaluate(()=>window.__ORBIT__.start(0));await page.waitForTimeout(2000);
  await page.screenshot({path:'artifacts/game-desktop.png'});
  await page.evaluate(async()=>{window.__ORBIT__.progress.unlocked=24;await window.__ORBIT__.start(15);});await page.waitForTimeout(1500);
  await page.screenshot({path:'artifacts/world-three.png'});
  await page.evaluate(()=>window.__ORBIT__.menu());
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(2000);
  await page.screenshot({path:'artifacts/menu-mobile.png'});
  await page.evaluate(()=>window.__ORBIT__.start(0));await page.waitForTimeout(1500);
  await page.screenshot({path:'artifacts/game-mobile.png'});
}
await browser.close();
