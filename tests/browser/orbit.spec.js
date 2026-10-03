import { test, expect } from '@playwright/test';
import { Game } from '../../src/game.js';
import { LEVELS } from '../../src/levels.js';
function firstRoute() {
  const game=new Game();game.start(0);const all=[];
  for(const target of [...LEVELS[0].items.filter(i=>i.type==='key'),LEVELS[0].items.find(i=>i.type==='exit')]) {
    const id=p=>`${p.cell}|${p.normal}|${p.forward}`,face=p=>`${p.cell}|${p.normal}`;
    const q=[{p:game.pose(),route:[]}],seen=new Set();let route;
    for(let i=0;i<q.length;i++) {
      const node=q[i];if(face(node.p)===face(target)){route=node.route;break;}
      for(const action of ['forward','left','right','back']) {
        const probe=new Game();probe.start(0);probe.touch=()=>{};Object.assign(probe,node.p);probe.move(action);
        if(!seen.has(id(probe))){seen.add(id(probe));q.push({p:probe.pose(),route:[...node.route,action]});}
      }
    }
    for(const action of route){game.cooldown=0;game.move(action);}all.push(...route);
  }
  return all;
}
test('menu, tutorial, worlds, keyboard win, wallet, skins and reload',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/?test');await page.waitForFunction(()=>window.__ORBIT__?.view);
  await expect(page.getByRole('heading',{name:'Change your point of view.'})).toBeVisible();
  await page.getByRole('button',{name:'How to play'}).click();await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Got it'}).click();
  await page.getByRole('button',{name:'WORLDS',exact:true}).click();
  await expect(page.locator('.level-card')).toHaveCount(24);await expect(page.locator('.level-card:disabled')).toHaveCount(23);
  await page.locator('.level-card').first().click();
  await expect(page.locator('#boot')).toBeHidden();
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toBeVisible();
  const pausedTime=await page.evaluate(()=>window.__ORBIT__.game.time);await page.waitForTimeout(400);
  expect(await page.evaluate(()=>window.__ORBIT__.game.time)).toBe(pausedTime);
  await page.getByRole('button',{name:'Resume',exact:false}).click();
  const keys={forward:'ArrowUp',back:'ArrowDown',left:'ArrowLeft',right:'ArrowRight'};
  for(const action of firstRoute()) {await page.waitForFunction(()=>window.__ORBIT__.game.cooldown===0);await page.keyboard.press(keys[action]);}
  await expect(page.locator('#interface')).toHaveAttribute('data-screen','won');
  const bank=await page.evaluate(()=>window.__ORBIT__.progress.bank);expect(bank).toBeGreaterThan(0);
  expect(await page.evaluate(()=>window.__ORBIT__.progress.unlocked)).toBe(2);
  await page.getByRole('button',{name:'Back to menu'}).click();
  await page.getByRole('button',{name:'ATELIER',exact:true}).click();
  await page.locator('[data-skin="aurora"]').click();
  expect(await page.evaluate(()=>window.__ORBIT__.progress.bank)).toBe(bank);
  await page.evaluate(()=>{window.__ORBIT__.progress.bank=500;});
  await page.locator('[data-skin="sunset"]').click();
  expect(await page.evaluate(()=>window.__ORBIT__.progress.bank)).toBe(420);
  await page.reload();await page.waitForFunction(()=>window.__ORBIT__?.view);
  expect(await page.evaluate(()=>window.__ORBIT__.progress.skin)).toBe('sunset');
  expect(await page.evaluate(()=>window.__ORBIT__.progress.bank)).toBe(420);
  expect([...new Set(errors)]).toEqual([]);
});
test('mobile touch, jump buffering, settings and no horizontal overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/?test');await page.waitForFunction(()=>window.__ORBIT__?.view);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Balanced',exact:true}).click();
  expect(await page.evaluate(()=>window.__ORBIT__.progress.quality)).toBe('balanced');
  await page.getByRole('button',{name:'Done'}).click();
  await page.getByRole('button',{name:'Start your journey'}).click();
  await page.getByRole('button',{name:'Forward',exact:true}).click();
  expect(await page.evaluate(()=>window.__ORBIT__.game.cell)).toEqual([0,0,-1]);
  await page.getByRole('button',{name:'JUMP',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__ORBIT__.game.cell[2])).toBe(-3);
  await page.getByRole('button',{name:'Pause game'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('third-person camera follows steering and keeps edge rolls in view',async({page})=>{
  await page.goto('/?test');await page.waitForFunction(()=>window.__ORBIT__?.view);
  const result=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {game,view,start}=window.__ORBIT__;await start(0);
    view.update(1/60,0);
    const before=view.camera.quaternion.clone();
    game.move('left');
    for(let i=0;i<26;i++)view.update(1/60,i/60);
    const steeringAngle=before.angleTo(view.camera.quaternion);
    await start(0);view.update(1/60,0);game.move('back');
    const points=[];let maxFrameAngle=0;let previous=view.camera.quaternion.clone();
    for(let i=0;i<36;i++){
      view.update(1/60,i/60);
      const point=view.playerPosition.clone().project(view.camera);
      const ray=new THREE.Raycaster(view.camera.position,view.playerPosition.clone().sub(view.camera.position).normalize());
      const hit=ray.intersectObjects(view.levelGroup.children,true)[0];
      points.push({x:point.x,y:point.y,z:point.z,occluded:!!hit&&hit.distance<view.camera.position.distanceTo(view.playerPosition)-.32});
      maxFrameAngle=Math.max(maxFrameAngle,previous.angleTo(view.camera.quaternion));previous.copy(view.camera.quaternion);
    }
    return {steeringAngle,maxFrameAngle,points};
  });
  expect(result.steeringAngle).toBeGreaterThan(1.5);
  expect(result.steeringAngle).toBeLessThan(1.6);
  expect(result.maxFrameAngle).toBeLessThan(.09);
  for(const point of result.points){expect(Math.abs(point.x)).toBeLessThan(.9);expect(Math.abs(point.y)).toBeLessThan(.9);expect(point.z).toBeLessThan(1);expect(point.occluded).toBe(false);}
});

test('animated worlds, lava damage and jumping across an early gap',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/?test');await page.waitForFunction(()=>window.__ORBIT__?.view);
  const colors=[];
  for(const level of [0,6,12,18]){
    colors.push(await page.evaluate(async index=>{const a=window.__ORBIT__;a.progress.unlocked=24;await a.start(index);return a.view.scene.background.getHex();},level));
    await page.waitForTimeout(300);
    expect(await page.evaluate(()=>window.__ORBIT__.view.livingEnvironment.islandBatches.length)).toBeGreaterThan(2);
  }
  expect(new Set(colors).size).toBe(4);
  await page.evaluate(()=>window.__ORBIT__.start(2));await page.keyboard.press('w');
  expect(await page.evaluate(()=>window.__ORBIT__.game.lives)).toBe(2);
  await expect(page.locator('#toast')).toContainText('Too hot');
  await page.evaluate(()=>window.__ORBIT__.start(2));await page.keyboard.press('Space');
  await page.waitForTimeout(550);
  expect(await page.evaluate(()=>window.__ORBIT__.game.lives)).toBe(3);
  expect(await page.evaluate(()=>window.__ORBIT__.game.cell)).toEqual([0,0,-2]);
  await page.evaluate(()=>window.__ORBIT__.start(1));
  for(let i=0;i<2;i++){await page.keyboard.press('w');await page.waitForFunction(()=>window.__ORBIT__.game.cooldown===0);}
  await page.keyboard.press('Space');await page.waitForTimeout(550);
  expect(await page.evaluate(()=>window.__ORBIT__.game.cell)).toEqual([0,0,-4]);
  expect(await page.evaluate(()=>window.__ORBIT__.game.lives)).toBe(3);
  expect([...new Set(errors)]).toEqual([]);
});

test('loading progress gates gameplay and batches keep heavy worlds affordable',async({page})=>{
  await page.goto('/?test');await page.waitForFunction(()=>window.__ORBIT__?.view);
  await page.evaluate(()=>{
    const view=window.__ORBIT__.view,prepare=view.prepare.bind(view);
    view.prepare=async progress=>{await new Promise(resolve=>window.releasePreparation=resolve);return prepare(progress);};
  });
  await page.getByRole('button',{name:'Start your journey'}).click();
  await page.waitForFunction(()=>window.releasePreparation);
  await expect(page.locator('#load-progress')).toBeVisible();
  await expect(page.locator('#interface')).toHaveAttribute('inert','');
  const before=await page.evaluate(()=>window.__ORBIT__.game.getSnapshot());
  await page.keyboard.press('w');await page.waitForTimeout(250);
  const during=await page.evaluate(()=>window.__ORBIT__.game.getSnapshot());
  expect(during.time).toBe(before.time);expect(during.cell).toEqual(before.cell);
  await page.evaluate(()=>window.releasePreparation());await expect(page.locator('#boot')).toBeHidden();
  await expect(page.locator('#load-progress')).toHaveAttribute('aria-valuenow','100');
  await page.evaluate(()=>{const view=window.__ORBIT__.view;view.prepare=Object.getPrototypeOf(view).prepare.bind(view);});
  const metrics=await page.evaluate(async()=>{
    const a=window.__ORBIT__;a.progress.unlocked=24;await a.start(23);
    a.view.update(1/60,1);const stats=a.view.getPerformanceStats();
    const before=a.view.renderer.info.memory.geometries;
    await a.start(23);const after=a.view.renderer.info.memory.geometries;
    const ratio=a.view.renderer.getPixelRatio();for(let i=0;i<240;i++)a.view.sampleFrame(35);
    return {stats,before,after,ratio,adapted:a.view.renderer.getPixelRatio()};
  });
  expect(metrics.stats.calls).toBeLessThan(270);
  expect(metrics.after).toBeLessThanOrEqual(metrics.before+2);
  expect(metrics.adapted).toBeLessThan(metrics.ratio);
});
