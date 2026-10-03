import {chromium} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{}),args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const initial=performance.now();await page.goto('http://127.0.0.1:5173/?test');await page.waitForFunction(()=>window.__ORBIT__?.view);
const startupMs=performance.now()-initial;
const samples=[];
for(const level of [0,12,23]){
 const sample=await page.evaluate(async index=>{
  const {game,view,progress,start}=window.__ORBIT__;progress.unlocked=24;
  const at=performance.now();await start(index);const loadMs=performance.now()-at;
  view.renderer.info.autoReset=false;view.renderer.info.reset();const first=performance.now();view.update(1/60,1);const firstFrameMs=performance.now()-first;
  const draws=view.renderer.info.render.calls,triangles=view.renderer.info.render.triangles;
  return {level:index+1,loadMs,firstFrameMs,draws,triangles,geometries:view.renderer.info.memory.geometries};
 },level);samples.push(sample);
}
const report={startupMs,samples};console.log(JSON.stringify(report));await writeFile(process.argv[2]||'artifacts/perf-current.json',JSON.stringify(report,null,2));await browser.close();
