import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { LEVELS } from '../src/levels.js';

const AXES = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const faceId = p => `${p.cell}|${p.normal}`;
const poseId = p => `${faceId(p)}|${p.forward}`;
const dot = (a,b) => a.reduce((sum,v,i)=>sum+v*b[i],0);
const add = (a,b) => a.map((v,i)=>v+b[i]);

// Explore the actual movement engine with collisions enabled but collectibles
// disabled. Route replay below uses an unmodified live Game including pickups.
function navigator(levelIndex) {
  const probe = new Game(); probe.start(levelIndex); probe.touch = () => {};
  const level = LEVELS[levelIndex];
  const hazards = new Set(level.items.filter(i=>i.type==='spike'||i.type==='lava').map(faceId));
  const actions = ['forward','back','left','right','jump'];
  function next(p, action) {
    probe.cell=[...p.cell]; probe.normal=[...p.normal]; probe.forward=[...p.forward];
    probe.state='playing'; probe.cooldown=0; probe.lives=3;
    const moved = action==='jump' ? probe.jump() : probe.move(action);
    if(!moved || probe.lives!==3 || hazards.has(faceId(probe)))return null;
    return probe.pose();
  }
  function search(start, target=null, allowJump=true) {
    const queue=[{pose:start,parent:-1,action:null}], seen=new Set([poseId(start)]), faces=new Set();
    for(let i=0;i<queue.length;i++) {
      const node=queue[i]; faces.add(faceId(node.pose));
      if(target && faceId(node.pose)===faceId(target)) {
        const route=[];let at=i;
        while(queue[at].parent!==-1){route.push(queue[at].action);at=queue[at].parent;}
        return route.reverse();
      }
      for(const action of actions) {
        if(!allowJump&&action==='jump')continue;
        const pose=next(node.pose,action); if(!pose || seen.has(poseId(pose)))continue;
        seen.add(poseId(pose));queue.push({pose,parent:i,action});
      }
    }
    return target ? null : faces;
  }
  return {search};
}

test('every campaign collectible and exit is reachable while avoiding hazards',()=>{
  assert.equal(LEVELS.length,24);
  for(let index=0;index<LEVELS.length;index++) {
    const level=LEVELS[index], reachable=navigator(index).search(level.start);
    const occupied=new Set(level.cubes.map(c=>c.join(',')));
    const itemFaces=new Set();
    for(const item of level.items) {
      assert(occupied.has(item.cell.join(',')),`Level ${level.id}: unsupported item`);
      assert(!occupied.has(add(item.cell,item.normal).join(',')),`Level ${level.id}: buried item`);
      assert(!itemFaces.has(faceId(item)),`Level ${level.id}: overlapping items`);itemFaces.add(faceId(item));
      if(item.type!=='spike'&&item.type!=='lava')assert(reachable.has(faceId(item)),`Level ${level.id}: unreachable ${item.type}`);
    }
  }
});

test('all 24 levels can be won through real input, including every required key',()=>{
  for(let index=0;index<LEVELS.length;index++) {
    const game=new Game(),nav=navigator(index);game.start(index);
    const targets=[...game.level.items.filter(i=>i.type==='key'),game.level.items.find(i=>i.type==='exit')];
    for(const target of targets) {
      const route=nav.search(game.pose(),target);assert(route,`Level ${index+1}: no route to ${target.type}`);
      for(const action of route) {
        game.update(.25);game.update(.25);game.update(.25);
        assert.equal(game.state,'playing',`Level ${index+1}: ended before target`);
        assert(action==='jump'?game.jump():game.move(action));
        assert.equal(game.lives,3,`Level ${index+1}: unsafe route`);
      }
    }
    assert.equal(game.state,'won',`Level ${index+1} did not complete`);
    assert.equal(game.keys,game.totalKeys);assert(game.score>0);
  }
});

test('island levels require a successful gap jump to reach the exit',()=>{
  for(const index of [1,4,7,10,13,16,19,22]) {
    const level=LEVELS[index],exit=level.items.find(i=>i.type==='exit'),nav=navigator(index);
    assert.equal(nav.search(level.start,exit,false),null,`Level ${index+1}: walking bypasses islands`);
    const route=nav.search(level.start,exit,true);assert(route?.includes('jump'));
  }
});

test('level three teaches visible lava: walking burns, jumping crosses safely',()=>{
  const events=[],game=new Game({onEvent:event=>events.push(event)});game.start(2);
  const lava=game.level.items.find(i=>i.type==='lava');
  assert.deepEqual(lava.cell,[0,0,-1]);assert.deepEqual(lava.normal,[0,1,0]);
  assert(game.move('forward'));
  assert.equal(game.lives,2);assert.deepEqual(game.cell,game.level.start.cell);
  assert(events.some(e=>e.type==='damage'&&e.reason==='burn'));
  assert(!game.collected.has(game.level.items.indexOf(lava)),'lava must remain dangerous');
  game.cooldown=0;assert(game.jump());
  assert.equal(game.lives,2);assert.deepEqual(game.cell,[0,0,-2]);
  assert.deepEqual(game.normal,[0,1,0]);assert.equal(game.state,'playing');
});

test('three jumps into empty space end the attempt and retry resets it',()=>{
  const events=[],game=new Game({onEvent:event=>events.push(event)});game.start(1);
  for(let remaining=2;remaining>=0;remaining--) {
    game.cooldown=0;game.forward=[-1,0,0];assert(game.jump());
    assert.equal(game.lives,remaining);
    assert.equal(game.state,remaining?'playing':'lost');
  }
  assert.equal(events.filter(e=>e.type==='damage'&&e.reason==='fall').length,3);
  assert(events.some(e=>e.type==='lost'&&e.reason==='fall'));
  game.retry();assert.equal(game.state,'playing');assert.equal(game.lives,3);
});

test('the tutorial is safe and later worlds increase visible hazards',()=>{
  const hazards=level=>level.items.filter(i=>['lava','spike'].includes(i.type));
  assert.equal(hazards(LEVELS[0]).length,0);
  for(const level of LEVELS.slice(2)) {
    assert(hazards(level).some(i=>i.type==='lava'&&i.normal[1]===1),`Level ${level.id}: missing visible burn risk`);
  }
  for(const index of [3,9,15,21]) {
    assert(hazards(LEVELS[index]).filter(i=>i.normal[1]===1).length>=2+Math.floor(index/6));
  }
});

test('every exposed edge has reversible movement and a valid tangent frame',()=>{
  let checked=0;
  for(let index=0;index<LEVELS.length;index++) {
    const game=new Game();game.start(index);game.touch=()=>{};
    const occupied=new Set(game.level.cubes.map(c=>c.join(',')));
    for(const cell of game.level.cubes)for(const normal of AXES) {
      if(occupied.has(add(cell,normal).join(',')))continue;
      for(const forward of AXES.filter(a=>dot(a,normal)===0)) {
        game.cell=[...cell];game.normal=[...normal];game.forward=[...forward];game.cooldown=0;
        game.move('forward');
        assert.equal(dot(game.normal,game.forward),0);
        assert(!occupied.has(add(game.cell,game.normal).join(',')));
        game.cooldown=0;game.move('back');
        assert.equal(game.cell.join(','),cell.join(','));assert.equal(game.normal.join(','),normal.join(','));assert.equal(game.forward.join(','),forward.join(','));checked++;
      }
    }
  }
  assert(checked>7000);
});

test('pause, timeout, hazards, failed jumps, retry and rewards obey game rules',()=>{
  const events=[],game=new Game({onEvent:event=>events.push(event)});game.start(0);
  game.pause(true);game.update(.2);assert.equal(game.time,150);assert.equal(game.move('forward'),false);
  game.pause(false);game.time=.01;game.update(.1);assert.equal(game.lives,2);assert(game.time>0);
  game.cooldown=0;game.forward=[1,0,0];game.jump();assert.equal(game.lives,1);assert.deepEqual(game.cell,[0,0,0]);
  game.cooldown=0;game.forward=[1,0,0];game.jump();assert.equal(game.state,'lost');
  game.retry();assert.equal(game.state,'playing');assert.equal(game.lives,3);assert.equal(game.score,0);
  const coin=game.level.items.find(i=>i.type==='coin');game.cell=[...coin.cell];game.normal=[...coin.normal];game.touch();
  assert.equal(game.coins,1);game.touch();assert.equal(game.coins,1,'a coin cannot be collected twice');
  const exit=game.level.items.find(i=>i.type==='exit');game.cell=[...exit.cell];game.normal=[...exit.normal];game.touch();
  assert.equal(game.state,'playing');assert(events.some(e=>e.type==='blocked'&&e.reason==='keys'));
  game.start(4);const spike=game.level.items.find(i=>i.type==='spike');game.cell=[...spike.cell];game.normal=[...spike.normal];game.touch();
  assert.equal(game.lives,2);assert.deepEqual(game.cell,game.level.start.cell);
});
