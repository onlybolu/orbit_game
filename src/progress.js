export const SKINS = [{id:'glacier',price:0},{id:'sunset',price:80},{id:'obsidian',price:150},{id:'pearl',price:220},{id:'aurora',price:350},{id:'classic',price:100}];
const KEY = 'orbit.progress.v1';
const fresh = () => ({bank:0,unlocked:1,owned:['glacier'],skin:'glacier',best:{},sound:true,quality:'high'});
export function readProgress(storage = globalThis.localStorage) {
  const result = fresh();
  try {
    const data = JSON.parse(storage.getItem(KEY));
    if (!data || typeof data !== 'object') return result;
    result.bank = Math.max(0,Math.floor(Number(data.bank)||0));
    result.unlocked = Math.min(24,Math.max(1,Math.floor(Number(data.unlocked)||1)));
    result.owned = [...new Set(['glacier',...(Array.isArray(data.owned)?data.owned:[]).filter(id=>SKINS.some(s=>s.id===id))])];
    result.skin = result.owned.includes(data.skin)?data.skin:'glacier';
    result.best = data.best && typeof data.best === 'object' && !Array.isArray(data.best)?data.best:{};
    result.sound = data.sound !== false;
    result.quality = data.quality === 'balanced' ? 'balanced':'high';
  } catch {}
  return result;
}
export function saveProgress(progress, storage = globalThis.localStorage) {
  try { storage.setItem(KEY,JSON.stringify(progress)); return true; } catch { return false; }
}
export function awardCompletion(progress,index,snapshot) {
  const old = progress.best[index];
  const reward = Math.max(0,Number(snapshot.coins)||0) + (old ? 10 : 35) + Math.min(30,Math.floor(Math.max(0,snapshot.time)/10));
  progress.bank += reward;
  progress.unlocked = Math.min(24,Math.max(progress.unlocked,index+2));
  progress.best[index] = {score:Math.max(Number(old?.score)||0,Number(snapshot.score)||0),time:Math.max(Number(old?.time)||0,Number(snapshot.time)||0),stars:Math.max(Number(old?.stars)||0,snapshot.lives>=3?3:snapshot.lives>=2?2:1)};
  return reward;
}
