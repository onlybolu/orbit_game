import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('docs/screenshots',{recursive:true});
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{}),args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto('http://127.0.0.1:5173/?test');await page.waitForFunction(()=>window.__ORBIT__?.view);
await page.waitForTimeout(1500);await page.screenshot({path:'docs/screenshots/menu.jpg',type:'jpeg',quality:86});
for(const [level,name] of [[2,'aurelia'],[6,'tidal'],[12,'obsidian'],[18,'zenith']]){
  await page.evaluate(async index=>{window.__ORBIT__.progress.unlocked=24;await window.__ORBIT__.start(index);},level);
  await page.waitForTimeout(4000);
  await page.screenshot({path:`docs/screenshots/${name}.jpg`,type:'jpeg',quality:86});
}
await page.evaluate(()=>window.__ORBIT__.menu());await page.getByRole('button',{name:'ATELIER',exact:true}).click();
await page.screenshot({path:'docs/screenshots/atelier.jpg',type:'jpeg',quality:86});
console.log(JSON.stringify({errors:[...new Set(errors)]}));await browser.close();
if(errors.length)process.exitCode=1;
