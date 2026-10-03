import { LEVELS } from './levels.js';

const SKINS = [
  { id: 'glacier', name: 'Glacier', type: 'Glass / arctic blue', cost: 0 },
  { id: 'sunset', name: 'Sunset', type: 'Glass / sunlit amber', cost: 80 },
  { id: 'obsidian', name: 'Obsidian', type: 'Metal / midnight black', cost: 150 },
  { id: 'pearl', name: 'Pearl', type: 'Ceramic / mother of pearl', cost: 220 },
  { id: 'aurora', name: 'Aurora', type: 'Crystal / iridescent', cost: 350 },
  { id: 'classic', name: 'Classic', type: 'The original / timeless', cost: 100 },
];
const pad = n => String(n).padStart(2, '0');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function levelPreview(level, index) {
  const palette = [['#e6dcbc','#c9b992','#ad9873'],['#c9e6e4','#8bbbbb','#659395'],['#b4a5a0','#837676','#5e585f'],['#e1dbeb','#b9abce','#9785b4']][level.worldIndex ?? Math.floor(index / 6)];
  const project = ([x,y,z]) => [(x-z)*10,(x+z)*5-y*12];
  const cubes = [...level.cubes].sort((a,b) => (a[0]+a[2]-a[1])-(b[0]+b[2]-b[1]));
  const vertices = cubes.flatMap(([x,y,z]) => [[x,y,z],[x+1,y+1,z+1],[x+1,y,z],[x,y+1,z+1]].map(project));
  const xs=vertices.map(p=>p[0]), ys=vertices.map(p=>p[1]), minX=Math.min(...xs)-12,minY=Math.min(...ys)-17,maxX=Math.max(...xs)+12,maxY=Math.max(...ys)+12;
  const face = (points, fill) => `<polygon points="${points.map(project).map(p=>p.join(',')).join(' ')}" fill="${fill}" stroke="${palette[0]}" stroke-width=".32" stroke-linejoin="round"/>`;
  const blocks = cubes.map(([x,y,z]) => face([[x,y,z+1],[x+1,y,z+1],[x+1,y+1,z+1],[x,y+1,z+1]],palette[1])+face([[x+1,y,z],[x+1,y,z+1],[x+1,y+1,z+1],[x+1,y+1,z]],palette[2])+face([[x,y+1,z],[x+1,y+1,z],[x+1,y+1,z+1],[x,y+1,z+1]],palette[0])).join('');
  const start=level.start.cell, ball=project([start[0]+.5,start[1]+1.3,start[2]+.5]);
  return `<svg class="level-map" viewBox="${minX} ${minY} ${maxX-minX} ${maxY-minY}" aria-hidden="true"><defs><radialGradient id="map-ball-${index}" cx="30%" cy="25%"><stop stop-color="#fff"/><stop offset=".45" stop-color="#c0e6ec"/><stop offset="1" stop-color="#4c8da6"/></radialGradient></defs>${blocks}<circle cx="${ball[0]}" cy="${ball[1]}" r="3.9" fill="url(#map-ball-${index})" stroke="#ffffffa0" stroke-width=".4"/></svg>`;
}

export class UI {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.progress = { bank: 0, unlocked: 1, owned: ['glacier'], skin: 'glacier', best: {}, sound: true, quality: 'high' };
    this.screen = 'menu';
    this.snapshot = {};
    this.root = document.createElement('div');
    this.root.id = 'interface';
    document.body.append(this.root);
    this.root.innerHTML = `
      <header class="topbar"><button class="brand" data-action="menu" aria-label="ORBIT, main menu"><span class="brand-mark"></span>ORBIT</button>
      <nav class="main-nav" aria-label="Main navigation"><button data-action="menu" data-nav="menu">PLAY</button><button data-action="worlds" data-nav="worlds">WORLDS</button><button data-action="atelier" data-nav="atelier">ATELIER</button></nav>
      <div class="header-tools"><span class="bank" title="Available coins"><span class="coin-mark">✦</span><b id="bank">0</b></span><button class="icon-button sound-toggle" data-action="sound" aria-label="Toggle audio">♫</button><button class="icon-button" data-action="settings" aria-label="Settings">⚙</button></div></header>
      <main id="screen-content"></main>
      <div id="game-hud" hidden><div class="hud-level"><span class="eyebrow">YOUR JOURNEY</span><strong id="hud-name">Solstice</strong><small id="hud-count">LEVEL 01</small></div><div class="hud-meters"><div><span>TIME</span><strong id="hud-time">120</strong><progress id="time-progress" max="120" value="120" aria-label="Time remaining"></progress></div><div><span>KEYS</span><strong id="hud-keys">0 / 1</strong><progress id="keys-progress" max="1" value="0" aria-label="Keys collected"></progress></div><div><span>COINS</span><strong id="hud-coins">0</strong></div><div><span>LIVES</span><strong id="hud-lives">3</strong></div></div><button class="icon-button pause-button" data-action="pause" aria-label="Pause game">Ⅱ</button><div class="game-guide"><kbd>W</kbd><kbd>S</kbd> roll <span>·</span><kbd>A</kbd><kbd>D</kbd> turn <span>·</span><kbd>SPACE</kbd> jump <span>·</span><kbd>ESC</kbd> pause</div><div class="touch-controls"><button data-control="left" aria-label="Turn left">↶</button><button data-control="forward" aria-label="Forward">↑</button><button data-control="back" aria-label="Backward">↓</button><button data-control="right" aria-label="Turn right">↷</button><button class="touch-jump" data-control="jump">JUMP</button></div></div>
      <div id="dialog-layer" hidden></div><div id="toast" role="status" aria-live="polite"></div>`;
    this.root.addEventListener('click', e => {
      const control = e.target.closest('[data-control]');
      if (control && e.detail === 0 && this.screen === 'playing') window.dispatchEvent(new CustomEvent('orbit-control', { detail: control.dataset.control }));
      const el = e.target.closest('[data-action]');
      if (el && !el.disabled) this.action(el.dataset.action, el.dataset);
    });
    this.root.addEventListener('pointerdown', e => {
      const control = e.target.closest('[data-control]');
      if (!control || this.screen !== 'playing') return;
      e.preventDefault();
      clearInterval(this.controlInterval);
      const dispatch = () => { if (this.screen === 'playing') window.dispatchEvent(new CustomEvent('orbit-control', { detail: control.dataset.control })); };
      dispatch();
      if (control.dataset.control !== 'jump') this.controlInterval = setInterval(dispatch, 130);
    });
    for (const event of ['pointerup','pointercancel','blur']) window.addEventListener(event, () => clearInterval(this.controlInterval));
    this.root.addEventListener('keydown', e => {
      if (!this.dialog) return;
      if (e.key === 'Escape' && ['how', 'settings'].includes(this.dialog)) { e.preventDefault(); e.stopPropagation(); this.closeDialog(); return; }
      if (e.key !== 'Tab') return;
      const buttons = [...this.root.querySelectorAll('#dialog-layer button:not(:disabled)')];
      const first = buttons[0], last = buttons.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    });
    this.showScreen('menu');
  }

  action(action, data = {}) {
    const cb = this.callbacks;
    if (action === 'play') cb.onPlay?.();
    else if (action === 'menu') { cb.onMenu?.(); this.showScreen('menu'); }
    else if (action === 'worlds' || action === 'atelier') this.showScreen(action);
    else if (action === 'level') cb.onLevel?.(Number(data.level));
    else if (action === 'skin') cb.onSkin?.(data.skin);
    else if (action === 'pause') { cb.onPause?.(); this.showScreen('paused'); }
    else if (action === 'resume') { this.showScreen('playing'); cb.onResume?.(); }
    else if (action === 'retry') cb.onRetry?.();
    else if (action === 'how') this.showDialog('how');
    else if (action === 'close') this.closeDialog();
    else if (action === 'settings') this.showDialog('settings');
    else if (action === 'sound') { this.progress.sound = !this.progress.sound; cb.onSettings?.({ sound: this.progress.sound, quality: this.progress.quality }); this.syncProgress(); if (this.dialog === 'settings') this.showDialog('settings'); }
    else if (action === 'quality') { this.progress.quality = data.quality; cb.onSettings?.({ sound: this.progress.sound, quality: this.progress.quality }); this.showDialog('settings'); }
  }

  showScreen(name) {
    clearInterval(this.controlInterval);
    const aliases = { game: 'playing', play: 'playing', pause: 'paused', win: 'won', complete: 'won', lost: 'lost', gameover: 'lost', levels: 'worlds', shop: 'atelier' };
    name = aliases[name] || name;
    this.screen = name;
    this.root.dataset.screen = name;
    this.closeDialog();
    const content = this.root.querySelector('#screen-content');
    const isGame = ['playing','paused','won','lost'].includes(name);
    this.root.querySelector('.topbar').hidden = isGame;
    this.root.querySelector('#game-hud').hidden = !isGame;
    this.root.querySelectorAll('[data-nav]').forEach(el => el.classList.toggle('active', el.dataset.nav === name));
    if (name === 'menu') content.innerHTML = `<section class="hero-copy"><div class="eyebrow hero-eyebrow"><span class="tiny-line"></span>A DIFFERENT PERSPECTIVE</div><h1>Change your<br>point of <em>view.</em></h1><p>A small world. Endless perspectives.<br>Follow gravity. Find your way.<br>Your next step might be upside down.</p><div class="hero-actions"><button class="primary-button" data-action="play">Start your journey <span>↗</span></button><button class="text-button" data-action="how"><span class="play-circle">▷</span> How to play</button></div><button class="world-preview" data-action="worlds"><span class="preview-number">01 <span>/ 04</span></span><span class="preview-description"><small>THE FIRST WORLD</small><strong>The sunlit sanctuary</strong><progress class="campaign-progress" max="24" value="0" aria-label="Campaign completion"></progress><small class="campaign-count"></small></span><span class="preview-arrow">↗</span></button></section><aside class="hero-caption"><span class="caption-symbol">✳</span><div><span class="eyebrow">WORLD 01 — AURELIA</span><p>Gravity is a matter<br>of perspective.</p></div></aside><footer class="menu-footer"><div><kbd>W A S D</kbd><span>to move</span><span class="footer-divider"></span><kbd>SPACE</kbd><span>to jump</span></div><span class="footer-motto">MADE TO GET LOST IN. <span>↗</span></span></footer>`;
    else if (name === 'worlds') content.innerHTML = `<section class="collection-page"><div class="collection-heading"><div><span class="eyebrow">04 WORLDS · ${LEVELS.length} PERSPECTIVES</span><h2>Beyond the <em>ordinary.</em></h2><p>Every surface is a new possibility.</p><progress class="campaign-progress" max="24" value="0" aria-label="Campaign completion"></progress><small class="campaign-count"></small></div><button class="text-button" data-action="menu">← Back to the beginning</button></div><div class="level-grid">${LEVELS.map((level,i) => {const locked = i >= this.progress.unlocked; return `<button class="level-card ${locked ? 'locked' : ''}" data-action="level" data-level="${i}" ${locked?'disabled':''}><span class="level-top"><span>${pad(i+1)}</span><small>${locked ? 'LOCKED' : this.progress.best?.[i] ? 'COMPLETED ✓' : 'EXPLORE ↗'}</small></span><div class="level-art">${levelPreview(level,i)}</div><span class="eyebrow">${esc(level.world || ['SOLSTICE','TIDELINE','AFTERGLOW','AETHER'][Math.floor(i/6)])}</span><strong>${esc(level.name || `Perspective ${i+1}`)}</strong><span class="level-subtitle">${esc(level.subtitle || 'A new perspective awaits.')}</span></button>`;}).join('')}</div></section>`;
    else if (name === 'atelier') content.innerHTML = `<section class="collection-page"><div class="collection-heading"><div><span class="eyebrow">THE ART OF BEING A SPHERE</span><h2>Your way to <em>shine.</em></h2><p>Collect coins. Find your material.</p></div><button class="text-button" data-action="menu">← Back to the beginning</button></div><div class="skin-grid">${SKINS.map(s => {const owned = this.progress.owned.includes(s.id), selected = this.progress.skin===s.id;return `<article class="skin-card ${selected?'selected':''}"><div class="skin-top"><span class="eyebrow">${s.id==='glacier'?'THE ORIGINAL':'MATERIAL COLLECTION'}</span>${selected?'<span class="selected-tag">EQUIPPED</span>':''}</div><div class="skin-orb ${s.id}"><span></span></div><div class="skin-info"><h3>${s.name}</h3><p>${s.type}</p><button class="skin-button" data-action="skin" data-skin="${s.id}" ${selected?'disabled':''}>${selected?'Selected':owned?'Equip ↗':`✦ ${s.cost} <span>Unlock ↗</span>`}</button></div></article>`;}).join('')}</div><p class="collection-note">Every skin is earned through play. No real-money purchases.</p></section>`;
    else content.innerHTML = '';
    if (name === 'paused' || name === 'won' || name === 'lost') this.showDialog(name);
    this.syncProgress();
  }

  showDialog(type) {
    if (!this.dialog) this.dialogReturnFocus = document.activeElement;
    this.dialog = type;
    const layer = this.root.querySelector('#dialog-layer');
    layer.hidden = false;
    const headings = { how:['A SHIFT IN PERSPECTIVE','There is more<br>than one <em>side.</em>'], settings:['YOUR SPACE','The little <em>details.</em>'], paused:['TAKE A BREATH','The world<br>can <em>wait.</em>'], won:['PERSPECTIVE UNLOCKED','One step<br><em>beyond.</em>'], lost:['TRY A DIFFERENT ANGLE','Another<br><em>possibility.</em>'] };
    const campaignComplete = type === 'won' && this.snapshot.levelIndex >= LEVELS.length - 1;
    const title = campaignComplete ? ['24 LEVELS · A NEW POINT OF VIEW','The world<br>is <em>yours.</em>'] : headings[type] || headings.paused;
    let body = '';
    if (type === 'how') body = `<div class="instructions"><p><b>01</b><span><strong>Roll beyond the edge.</strong>Gravity follows the surface: roll along the sides and underneath each block. The third-person camera follows your turns.</span></p><p><b>02</b><span><strong>Collect every key.</strong>Keys unlock the exit portal. Complete the level to bank your coins and bonuses, then unlock new skins in the Atelier.</span></p><p><b>03</b><span><strong>Jump. Look. Try again.</strong>Press Space to jump two blocks forward, across gaps or over lava and spikes. Missing a landing, touching a hazard or running out of time costs a life. Lose all three and retry. Hourglasses add 30 seconds.</span></p></div><div class="instruction-keys"><span><kbd>W / ↑</kbd> Forward</span><span><kbd>S / ↓</kbd> Backward</span><span><kbd>A D / ← →</kbd> Turn</span><span><kbd>SPACE</kbd> Jump</span><span><kbd>ESC</kbd> Pause</span></div><button class="primary-button full" data-action="close">Got it <span>↗</span></button>`;
    if (type === 'settings') body = `<div class="setting-row"><div><strong>Sound</strong><small>Little sounds for every discovery.</small></div><button class="toggle ${this.progress.sound?'on':''}" data-action="sound" aria-label="Audio" aria-pressed="${this.progress.sound}"><span></span></button></div><div class="setting-row"><div><strong>Visual quality</strong><small>Resolution adapts automatically for smoother play.</small></div><div class="segmented"><button class="${this.progress.quality==='balanced'?'active':''}" data-action="quality" data-quality="balanced">Balanced</button><button class="${this.progress.quality==='high'?'active':''}" data-action="quality" data-quality="high">High</button></div></div><button class="primary-button full" data-action="close">Done <span>✓</span></button>`;
    if (type === 'paused') body = `<p class="dialog-description">Your next perspective will be right here.</p><button class="primary-button full" data-action="resume">Resume <span>↗</span></button><button class="secondary-button full" data-action="retry">Restart level</button><button class="text-button full" data-action="menu">Back to menu</button>`;
    if (type === 'won') body = `<p class="dialog-description">${campaignComplete ? 'You have explored all four worlds. Revisit them, beat your best scores and complete your collection.' : 'You found your way. A new perspective awaits on the other side.'}</p><div class="result-stats"><div><small>SCORE</small><strong>${this.snapshot.score || 0}</strong></div><div><small>COINS EARNED</small><strong>✦ ${this.snapshot.earned ?? this.snapshot.coins ?? 0}</strong></div></div><button class="primary-button full" data-action="${campaignComplete ? 'worlds' : 'play'}">${campaignComplete ? 'Explore all worlds' : 'Next level'} <span>↗</span></button><button class="text-button full" data-action="menu">Back to menu</button>`;
    if (type === 'lost') body = `<p class="dialog-description">Every attempt is a new way to see the path.</p><button class="primary-button full" data-action="retry">Try again <span>↗</span></button><button class="text-button full" data-action="menu">Back to menu</button>`;
    layer.innerHTML = `<section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">${['how','settings'].includes(type)?'<button class="dialog-close icon-button" data-action="close" aria-label="Close">×</button>':''}<span class="eyebrow">${title[0]}</span><h2 id="dialog-title">${title[1]}</h2>${body}</section>`;
    layer.querySelector('button')?.focus({ preventScroll: true });
  }
  closeDialog() { this.dialog = null; this.root.querySelector('#dialog-layer').hidden = true; if (this.dialogReturnFocus?.isConnected) this.dialogReturnFocus.focus({ preventScroll: true }); this.dialogReturnFocus = null; }
  setProgress(progress) { this.progress = { ...this.progress, ...progress }; this.syncProgress(); if (['worlds','atelier'].includes(this.screen)) this.showScreen(this.screen); }
  syncProgress() { const completed=Object.keys(this.progress.best || {}).length; this.root.querySelectorAll('.campaign-progress').forEach(bar=>bar.value=completed);this.root.querySelectorAll('.campaign-count').forEach(label=>label.textContent=completed+' / 24 completed'); this.root.querySelector('#bank').textContent = this.progress.bank; this.root.querySelector('.sound-toggle').textContent = this.progress.sound ? '♫' : '♪'; this.root.querySelector('.sound-toggle').setAttribute('aria-pressed', String(this.progress.sound)); }
  update(snapshot, progress) {
    this.snapshot = snapshot || {};
    if (progress) this.progress = { ...this.progress, ...progress };
    this.syncProgress();
    const s = this.snapshot, level = LEVELS[s.levelIndex || 0];
    this.root.querySelector('#hud-name').textContent = level?.name || 'Solstice';
    this.root.querySelector('#hud-count').textContent = `LEVEL ${pad((s.levelIndex || 0)+1)} / ${pad(LEVELS.length)}`;
    const time = Math.max(0, Math.ceil(s.time ?? 120));
    const timer = this.root.querySelector('#hud-time'); timer.textContent = `${Math.floor(time/60)}:${pad(time%60)}`; timer.classList.toggle('urgent', time <= 20);
    const timeBar=this.root.querySelector('#time-progress');timeBar.max=Math.max(level?.time || 120,time);timeBar.value=time;
    const keyBar=this.root.querySelector('#keys-progress');keyBar.max=s.totalKeys || 1;keyBar.value=s.keys || 0;
    this.root.querySelector('#hud-keys').textContent = `${s.keys ?? 0} / ${s.totalKeys ?? 1}`;
    this.root.querySelector('#hud-coins').textContent = s.coins ?? 0;
    this.root.querySelector('#hud-lives').textContent = s.lives ?? 3;
    if (s.state && s.state !== this.lastGameState) {
      this.lastGameState = s.state;
      if (['playing','paused','won','lost','gameover'].includes(s.state)) this.showScreen(s.state);
    }
  }
  toast(text) { const el=this.root.querySelector('#toast'); el.textContent=text; el.classList.add('visible'); clearTimeout(this.toastTimeout); this.toastTimeout=setTimeout(()=>el.classList.remove('visible'),3500); }
}
