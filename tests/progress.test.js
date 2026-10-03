import { test } from 'node:test';
import assert from 'node:assert/strict';
import {readProgress,saveProgress,awardCompletion} from '../src/progress.js';
test('corrupt saves fall back to valid playable defaults',()=>{
  assert.equal(readProgress({getItem:()=>'{broken'}).unlocked,1);
  const p=readProgress({getItem:()=>JSON.stringify({bank:-9,unlocked:100,owned:['fake'],skin:'fake',quality:'ultra'})});
  assert.equal(p.bank,0);assert.equal(p.unlocked,24);assert.deepEqual(p.owned,['glacier']);assert.equal(p.skin,'glacier');assert.equal(p.quality,'high');
});
test('completion persists earnings and unlocks sequential levels; replay cannot reduce record',()=>{
  const p=readProgress({getItem:()=>null});
  const first=awardCompletion(p,0,{coins:8,time:100,score:900,lives:3});
  assert.equal(first,53);assert.equal(p.unlocked,2);assert.equal(p.bank,53);
  awardCompletion(p,0,{coins:1,time:30,score:20,lives:1});
  assert.equal(p.best[0].score,900);assert.equal(p.best[0].stars,3);
  let saved;assert.equal(saveProgress(p,{setItem:(key,value)=>saved=value}),true);
  assert.equal(readProgress({getItem:()=>saved}).bank,p.bank);
});
test('storage unavailable returns false instead of breaking the game',()=>{
  assert.equal(saveProgress({}, {setItem:()=>{throw Error('Quota')}}),false);
});
