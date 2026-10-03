export const loading = {
  paint: () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  show(label) {
    const el=document.getElementById('boot');el.hidden=false;
    const ui=document.getElementById('interface');if(ui)ui.inert=true;
    this.set(0,label);
  },
  set(fraction,label) {
    const value=Math.round(Math.max(0,Math.min(1,fraction))*100);
    document.getElementById('load-stage').textContent=label;
    const bar=document.getElementById('load-progress');bar.classList.remove('indeterminate');bar.setAttribute('aria-valuenow',value);
    document.getElementById('load-fill').style.width=`${value}%`;
    document.getElementById('load-percent').textContent=`${value}%`;
  },
  hide() {document.getElementById('boot').hidden=true;const ui=document.getElementById('interface');if(ui)ui.inert=false;},
  fail(message) {
    const el=document.getElementById('boot');el.hidden=false;el.setAttribute('role','alert');
    document.getElementById('load-stage').textContent=message;
    document.getElementById('load-progress').hidden=true;
    document.getElementById('load-percent').textContent='';
    const button=document.createElement('button');button.className='primary-button';button.textContent='Reload game';button.onclick=()=>location.reload();el.append(button);
  }
};
